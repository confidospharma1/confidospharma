import { Request, Response } from 'express';
import Decimal from 'decimal.js';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';

export const getPurchases = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId, page = '1', limit = '50' } = req.query;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    const whereClause: any = {};
    if (targetBranchId) whereClause.branchId = targetBranchId;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [total, purchases] = await Promise.all([
      prisma.purchaseInvoice.count({ where: whereClause }),
      prisma.purchaseInvoice.findMany({
        where: whereClause,
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, code: true, name: true } },
          _count: { select: { lines: true } },
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
      purchases,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch purchases' });
  }
};

export const createPurchase = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot record purchases' });
    }

    const {
      supplierId,
      supplierInvoiceNumber,
      invoiceDate,
      branchId,
      lines,
      notes,
    } = req.body;

    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId || req.user.branchId) : req.user.branchId;

    if (!targetBranchId || !supplierId || !supplierInvoiceNumber || !lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: 'Missing required purchase invoice parameters' });
    }

    // Check duplicate supplier invoice (PRD Section 6.2)
    const existing = await prisma.purchaseInvoice.findFirst({
      where: {
        supplierId,
        supplierInvoiceNumber: supplierInvoiceNumber.trim(),
        branchId: targetBranchId,
      },
    });

    if (existing) {
      return res.status(409).json({
        message: `Likely duplicate: Invoice '${supplierInvoiceNumber}' from this supplier has already been recorded for this branch.`,
      });
    }

    const branch = await prisma.branch.findUnique({ where: { id: targetBranchId } });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    const result = await prisma.$transaction(async (tx) => {
      let subtotalDec = new Decimal(0);
      let taxTotalDec = new Decimal(0);

      const count = await tx.purchaseInvoice.count({ where: { branchId: targetBranchId } });
      const invoiceNumber = `PUR-${branch.code.replace('B-', '')}-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

      const processedLines: any[] = [];

      for (const line of lines) {
        const { medicineId, batchNumber, expiryDate, quantity, purchaseRate, mrp, gstRate } = line;

        const qty = parseInt(quantity);
        const rateDec = new Decimal(purchaseRate);
        const gstDec = new Decimal(gstRate || 12);
        const mrpDec = new Decimal(mrp);

        const lineBase = rateDec.times(qty);
        const lineTax = lineBase.times(gstDec).dividedBy(100);
        const lineTotal = lineBase.plus(lineTax);

        subtotalDec = subtotalDec.plus(lineBase);
        taxTotalDec = taxTotalDec.plus(lineTax);

        const parsedExpiry = new Date(expiryDate);

        // Check/create batch in branch
        let batch = await tx.stockBatch.findFirst({
          where: {
            branchId: targetBranchId,
            medicineId,
            batchNumber: batchNumber.trim(),
          },
        });

        if (batch) {
          batch = await tx.stockBatch.update({
            where: { id: batch.id },
            data: {
              quantityReceived: batch.quantityReceived + qty,
              availableQuantity: batch.availableQuantity + qty,
              purchaseRate: rateDec.toNumber(),
              mrp: mrpDec.toNumber(),
              sellingPrice: mrpDec.toNumber(),
              status: 'ACTIVE',
            },
          });
        } else {
          batch = await tx.stockBatch.create({
            data: {
              branchId: targetBranchId,
              medicineId,
              batchNumber: batchNumber.trim(),
              expiryDate: parsedExpiry,
              quantityReceived: qty,
              availableQuantity: qty,
              purchaseRate: rateDec.toNumber(),
              mrp: mrpDec.toNumber(),
              sellingPrice: mrpDec.toNumber(),
              supplierId,
              purchaseInvoiceRef: supplierInvoiceNumber.trim(),
              status: 'ACTIVE',
            },
          });
        }

        // Record stock movement
        await tx.stockMovement.create({
          data: {
            branchId: targetBranchId,
            medicineId,
            batchId: batch.id,
            movementType: 'PURCHASE_RECEIPT',
            quantityDelta: qty,
            unitPrice: rateDec.toNumber(),
            referenceDocType: 'PURCHASE_INVOICE',
            referenceDocId: invoiceNumber,
            reason: `Supplier purchase from invoice ${supplierInvoiceNumber}`,
            performedByUserId: req.user!.id,
          },
        });

        processedLines.push({
          medicineId,
          batchNumber: batchNumber.trim(),
          expiryDate: parsedExpiry,
          quantity: qty,
          purchaseRate: rateDec.toNumber(),
          mrp: mrpDec.toNumber(),
          gstRate: gstDec.toNumber(),
          lineTotal: lineTotal.toDecimalPlaces(2).toNumber(),
        });
      }

      const grandTotalDec = subtotalDec.plus(taxTotalDec);

      const purchaseInvoice = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber,
          supplierInvoiceNumber: supplierInvoiceNumber.trim(),
          supplierId,
          branchId: targetBranchId,
          invoiceDate: new Date(invoiceDate || Date.now()),
          subtotal: subtotalDec.toDecimalPlaces(2).toNumber(),
          taxTotal: taxTotalDec.toDecimalPlaces(2).toNumber(),
          grandTotal: grandTotalDec.toDecimalPlaces(2).toNumber(),
          status: 'RECEIVED',
          receivedByUserId: req.user!.id,
          notes: notes ? notes.trim() : null,
          lines: {
            create: processedLines,
          },
        },
        include: {
          lines: true,
          supplier: true,
        },
      });

      return purchaseInvoice;
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: targetBranchId,
      action: 'PURCHASE_RECEIVE',
      targetEntity: 'PURCHASE_INVOICE',
      entityId: result.id,
      details: { invoiceNumber: result.invoiceNumber, supplierInvoiceNumber, grandTotal: result.grandTotal },
      req,
    });

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Purchase error:', error);
    return res.status(500).json({ message: error.message || 'Failed to record purchase' });
  }
};
