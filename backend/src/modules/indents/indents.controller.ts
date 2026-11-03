import { Request, Response } from 'express';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';

export const getIndents = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId, status, supplierId, search, page = '1', limit = '50' } = req.query;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    const whereClause: any = {};
    if (targetBranchId) whereClause.branchId = targetBranchId;
    if (status) whereClause.status = status as string;
    if (supplierId) whereClause.supplierId = supplierId as string;

    if (search) {
      const q = (search as string).trim();
      whereClause.OR = [
        { indentNumber: { contains: q, mode: 'insensitive' } },
        { supplier: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [total, indents] = await Promise.all([
      prisma.purchaseIndent.count({ where: whereClause }),
      prisma.purchaseIndent.findMany({
        where: whereClause,
        include: {
          supplier: { select: { id: true, name: true, phone: true, email: true } },
          branch: { select: { id: true, code: true, name: true } },
          items: {
            include: {
              medicine: {
                select: {
                  id: true,
                  internalCode: true,
                  brandName: true,
                  genericName: true,
                  strength: true,
                  dosageForm: true,
                  baseUnit: true,
                  packageUnit: true,
                  conversionFactor: true,
                },
              },
            },
          },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return res.json({
      total,
      page: parseInt(page as string),
      limit: take,
      totalPages: Math.ceil(total / take),
      indents,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch purchase indents' });
  }
};

export const getIndentById = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const id = req.params.id as string;
    const indent = await prisma.purchaseIndent.findUnique({
      where: { id },
      include: {
        supplier: true,
        branch: true,
        items: {
          include: {
            medicine: true,
          },
        },
      },
    });

    if (!indent) {
      return res.status(404).json({ message: 'Purchase indent not found' });
    }

    if (req.user.role !== 'SUPER_ADMIN' && indent.branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied: Indent belongs to another branch' });
    }

    return res.json(indent);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to fetch indent details' });
  }
};

export const createIndent = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const {
      branchId,
      supplierId,
      items,
      requiredByDate,
      notes,
    } = req.body;

    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId || req.user.branchId) : req.user.branchId;

    if (!targetBranchId) {
      return res.status(400).json({ message: 'Target branch is required.' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one medicine item is required.' });
    }

    const branch = await prisma.branch.findUnique({ where: { id: targetBranchId } });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    // Generate unique indent number
    const count = await prisma.purchaseIndent.count({ where: { branchId: targetBranchId } });
    const indentNumber = `IND-${branch.code.replace('B-', '')}-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    let totalEstimated = 0;
    const processedItems: any[] = [];

    for (const item of items) {
      const qty = parseInt(item.requestedQuantity);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ message: 'Requested quantity must be greater than zero.' });
      }

      const medicine = await prisma.medicineProduct.findUnique({ where: { id: item.medicineId } });
      if (!medicine) {
        return res.status(400).json({ message: `Medicine ID '${item.medicineId}' not found.` });
      }

      const rate = item.estimatedRate ? parseFloat(item.estimatedRate) : (medicine.defaultPurchaseRate || medicine.mrp);
      totalEstimated += qty * rate;

      processedItems.push({
        medicineId: medicine.id,
        requestedQuantity: qty,
        unit: item.unit || medicine.baseUnit || 'Tablet',
        estimatedRate: rate,
        notes: item.notes || null,
      });
    }

    // Save indent (Status: SUBMITTED - does NOT increase stock!)
    const indent = await prisma.purchaseIndent.create({
      data: {
        indentNumber,
        branchId: targetBranchId,
        supplierId: supplierId || null,
        requestedByUserId: req.user.id,
        status: 'SUBMITTED',
        requiredByDate: requiredByDate ? new Date(requiredByDate) : null,
        totalEstimatedAmount: Math.round(totalEstimated * 100) / 100,
        notes: notes || null,
        items: {
          create: processedItems,
        },
      },
      include: {
        supplier: true,
        items: {
          include: { medicine: true },
        },
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: targetBranchId,
      action: 'INDENT_CREATE',
      targetEntity: 'PURCHASE_INDENT',
      entityId: indent.id,
      details: { indentNumber, itemsCount: processedItems.length, totalEstimated },
      req,
    });

    return res.status(201).json(indent);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to create purchase indent' });
  }
};

export const approveIndent = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Only Admins can approve indents' });
    }

    const id = req.params.id as string;
    const indent = await prisma.purchaseIndent.findUnique({ where: { id } });

    if (!indent) return res.status(404).json({ message: 'Indent not found' });

    if (req.user.role !== 'SUPER_ADMIN' && indent.branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (indent.status === 'CONVERTED') {
      return res.status(400).json({ message: 'Indent is already converted to purchase invoice' });
    }

    const updated = await prisma.purchaseIndent.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedByUserId: req.user.id,
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: indent.branchId,
      action: 'INDENT_APPROVE',
      targetEntity: 'PURCHASE_INDENT',
      entityId: id,
      details: { indentNumber: indent.indentNumber },
      req,
    });

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to approve indent' });
  }
};

export const rejectIndent = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Only Admins can reject indents' });
    }

    const id = req.params.id as string;
    const { reason } = req.body;
    const indent = await prisma.purchaseIndent.findUnique({ where: { id } });

    if (!indent) return res.status(404).json({ message: 'Indent not found' });

    if (req.user.role !== 'SUPER_ADMIN' && indent.branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const updated = await prisma.purchaseIndent.update({
      where: { id },
      data: {
        status: 'REJECTED',
        notes: reason ? `${indent.notes || ''} [Rejected: ${reason}]`.trim() : indent.notes,
      },
    });

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to reject indent' });
  }
};

export const convertIndentToPurchase = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const id = req.params.id as string;
    const indent = await prisma.purchaseIndent.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: { include: { medicine: true } },
      },
    });

    if (!indent) return res.status(404).json({ message: 'Indent not found' });

    if (indent.status === 'REJECTED') {
      return res.status(400).json({ message: 'Cannot convert a rejected indent' });
    }

    // Mark as CONVERTED
    await prisma.purchaseIndent.update({
      where: { id },
      data: { status: 'CONVERTED' },
    });

    // Return pre-filled purchase invoice draft items
    const invoiceDraft = {
      indentId: indent.id,
      indentNumber: indent.indentNumber,
      supplierId: indent.supplierId,
      branchId: indent.branchId,
      lines: indent.items.map((item) => ({
        medicineId: item.medicineId,
        brandName: item.medicine.brandName,
        genericName: item.medicine.genericName,
        strength: item.medicine.strength,
        dosageForm: item.medicine.dosageForm,
        quantity: item.requestedQuantity,
        freeQuantity: 0,
        unit: item.unit || item.medicine.baseUnit,
        purchaseRate: item.estimatedRate || item.medicine.defaultPurchaseRate || 0,
        sellingRate: item.medicine.defaultSellingRate || item.medicine.mrp,
        mrp: item.medicine.mrp,
        gstRate: item.medicine.gstRate,
        discountPercent: 15,
      })),
    };

    return res.json({
      message: `Indent ${indent.indentNumber} converted to purchase draft.`,
      draft: invoiceDraft,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to convert indent' });
  }
};
