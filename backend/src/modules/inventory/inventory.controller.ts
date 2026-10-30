import { Request, Response } from 'express';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';

export const getBatches = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId, medicineId, status, nearExpiry, expired } = req.query;

    let targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    if (req.user.role !== 'SUPER_ADMIN' && branchId && branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied to other branch inventory' });
    }

    const whereClause: any = {};
    if (targetBranchId) whereClause.branchId = targetBranchId;
    if (medicineId) whereClause.medicineId = medicineId as string;
    if (status) whereClause.status = status as string;

    const now = new Date();
    if (expired === 'true') {
      whereClause.OR = [
        { status: 'EXPIRED' },
        { expiryDate: { lte: now } },
      ];
    } else if (nearExpiry === 'true') {
      const future60Days = new Date();
      future60Days.setDate(now.getDate() + 60);
      whereClause.status = 'ACTIVE';
      whereClause.availableQuantity = { gt: 0 };
      whereClause.expiryDate = { gte: now, lte: future60Days };
    }

    const batches = await prisma.stockBatch.findMany({
      where: whereClause,
      include: {
        medicine: true,
        branch: { select: { id: true, code: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { expiryDate: 'asc' }, // FEFO default
    });

    return res.json(batches);
  } catch (error) {
    console.error('Error fetching batches:', error);
    return res.status(500).json({ message: 'Failed to fetch inventory batches' });
  }
};

export const getFEFOBatch = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const medicineId = req.params.medicineId as string;
    const { branchId } = req.query;

    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) || req.user.branchId : req.user.branchId;

    if (!targetBranchId) {
      return res.status(400).json({ message: 'Branch ID is required' });
    }

    const now = new Date();

    // Earliest expiring active batch with available stock
    const batch = await prisma.stockBatch.findFirst({
      where: {
        branchId: targetBranchId,
        medicineId,
        status: 'ACTIVE',
        availableQuantity: { gt: 0 },
        expiryDate: { gt: now },
      },
      orderBy: { expiryDate: 'asc' },
      include: {
        medicine: true,
      },
    });

    if (!batch) {
      return res.status(404).json({ message: 'No eligible saleable batch available for this medicine in current branch' });
    }

    return res.json(batch);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to find FEFO batch' });
  }
};

export const receiveStockBatch = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot receive stock batches' });
    }

    const {
      branchId,
      medicineId,
      batchNumber,
      expiryDate,
      quantity,
      purchaseRate,
      mrp,
      sellingPrice,
      supplierId,
      purchaseInvoiceRef,
    } = req.body;

    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? branchId : req.user.branchId;

    if (!targetBranchId || !medicineId || !batchNumber || !expiryDate || !quantity || purchaseRate === undefined || mrp === undefined) {
      return res.status(400).json({ message: 'Missing required stock receipt fields' });
    }

    const parsedQty = parseInt(quantity);
    if (parsedQty <= 0) {
      return res.status(400).json({ message: 'Quantity must be greater than zero' });
    }

    const parsedExpiry = new Date(expiryDate);
    if (isNaN(parsedExpiry.getTime())) {
      return res.status(400).json({ message: 'Invalid expiry date format' });
    }

    // Check medicine exists
    const medicine = await prisma.medicineProduct.findUnique({ where: { id: medicineId } });
    if (!medicine) return res.status(404).json({ message: 'Medicine product not found' });

    // Atomic transaction for batch creation & movement record
    const result = await prisma.$transaction(async (tx) => {
      // Check if matching batch already exists in this branch (same supplier and expiry)
      const existingBatches = await tx.stockBatch.findMany({
        where: {
          branchId: targetBranchId,
          medicineId,
          batchNumber: batchNumber.trim(),
        },
      });

      let batch = existingBatches.find((b) => {
        const supplierMatches = (!b.supplierId && !supplierId) || (b.supplierId === supplierId);
        const bDateStr = b.expiryDate.toISOString().slice(0, 10);
        const pDateStr = parsedExpiry.toISOString().slice(0, 10);
        return supplierMatches && bDateStr === pDateStr;
      });

      if (batch) {
        // Increment quantity
        batch = await tx.stockBatch.update({
          where: { id: batch.id },
          data: {
            quantityReceived: batch.quantityReceived + parsedQty,
            availableQuantity: batch.availableQuantity + parsedQty,
            purchaseRate: parseFloat(purchaseRate),
            mrp: parseFloat(mrp),
            sellingPrice: sellingPrice ? parseFloat(sellingPrice) : parseFloat(mrp),
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
            quantityReceived: parsedQty,
            availableQuantity: parsedQty,
            purchaseRate: parseFloat(purchaseRate),
            mrp: parseFloat(mrp),
            sellingPrice: sellingPrice ? parseFloat(sellingPrice) : parseFloat(mrp),
            supplierId: supplierId || null,
            purchaseInvoiceRef: purchaseInvoiceRef || null,
            status: 'ACTIVE',
          },
        });
      }

      // Record movement
      await tx.stockMovement.create({
        data: {
          branchId: targetBranchId,
          medicineId,
          batchId: batch.id,
          movementType: 'PURCHASE_RECEIPT',
          quantityDelta: parsedQty,
          unitPrice: parseFloat(purchaseRate),
          referenceDocType: 'PURCHASE_RECEIPT',
          referenceDocId: purchaseInvoiceRef || null,
          reason: 'Manual stock receipt',
          performedByUserId: req.user!.id,
        },
      });

      return batch;
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: targetBranchId,
      action: 'STOCK_RECEIPT',
      targetEntity: 'STOCK_BATCH',
      entityId: result.id,
      details: { medicine: medicine.brandName, batchNumber, quantity: parsedQty },
      req,
    });

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Receive stock error:', error);
    return res.status(500).json({ message: error.message || 'Failed to receive stock' });
  }
};

export const adjustStock = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot adjust inventory directly' });
    }

    const { batchId, adjustmentType, quantityDelta, reason } = req.body;

    if (!batchId || !adjustmentType || quantityDelta === undefined || !reason) {
      return res.status(400).json({ message: 'Batch ID, adjustment type, quantity delta, and clear reason are required' });
    }

    const delta = parseInt(quantityDelta);
    if (delta === 0) {
      return res.status(400).json({ message: 'Quantity delta cannot be zero' });
    }

    const batch = await prisma.stockBatch.findUnique({
      where: { id: batchId },
      include: { medicine: true },
    });

    if (!batch) return res.status(404).json({ message: 'Stock batch not found' });

    // Isolation check
    if (req.user.role !== 'SUPER_ADMIN' && batch.branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied: Batch belongs to another branch' });
    }

    const previousQty = batch.availableQuantity;
    const newQty = previousQty + delta;

    if (newQty < 0) {
      return res.status(400).json({
        message: `Adjustment rejected: New stock cannot be negative. Current: ${previousQty}, Delta: ${delta}`,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update batch quantity and status
      const updatedBatch = await tx.stockBatch.update({
        where: { id: batch.id },
        data: {
          availableQuantity: newQty,
          status: newQty === 0 ? 'DEPLETED' : (adjustmentType === 'EXPIRED' ? 'EXPIRED' : (adjustmentType === 'DAMAGE' ? 'QUARANTINE' : batch.status)),
        },
      });

      // Create StockAdjustment record
      const adjustment = await tx.stockAdjustment.create({
        data: {
          branchId: batch.branchId,
          medicineId: batch.medicineId,
          batchId: batch.id,
          adjustmentType,
          quantityDelta: delta,
          previousQuantity: previousQty,
          newQuantity: newQty,
          reason: reason.trim(),
          approvedByUserId: req.user!.id,
        },
      });

      // Create StockMovement record
      await tx.stockMovement.create({
        data: {
          branchId: batch.branchId,
          medicineId: batch.medicineId,
          batchId: batch.id,
          movementType: 'STOCK_CORRECTION',
          quantityDelta: delta,
          unitPrice: batch.purchaseRate,
          referenceDocType: 'STOCK_ADJUSTMENT',
          referenceDocId: adjustment.id,
          reason: `${adjustmentType}: ${reason.trim()}`,
          performedByUserId: req.user!.id,
        },
      });

      return { updatedBatch, adjustment };
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: batch.branchId,
      action: 'STOCK_ADJUST',
      targetEntity: 'STOCK_BATCH',
      entityId: batch.id,
      details: {
        medicine: batch.medicine.brandName,
        batchNumber: batch.batchNumber,
        adjustmentType,
        quantityDelta: delta,
        reason,
      },
      req,
    });

    return res.json(result);
  } catch (error: any) {
    console.error('Adjust stock error:', error);
    return res.status(500).json({ message: error.message || 'Failed to adjust stock' });
  }
};

export const getMovements = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId, medicineId, movementType, page = '1', limit = '50' } = req.query;

    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    const whereClause: any = {};
    if (targetBranchId) whereClause.branchId = targetBranchId;
    if (medicineId) whereClause.medicineId = medicineId as string;
    if (movementType) whereClause.movementType = movementType as string;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [total, movements] = await Promise.all([
      prisma.stockMovement.count({ where: whereClause }),
      prisma.stockMovement.findMany({
        where: whereClause,
        include: {
          branch: { select: { id: true, code: true, name: true } },
          medicine: { select: { id: true, internalCode: true, brandName: true, genericName: true } },
          batch: { select: { id: true, batchNumber: true, expiryDate: true } },
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
      movements,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch stock movements' });
  }
};

export const getTransfers = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const whereClause: any = {};
    if (req.user.role !== 'SUPER_ADMIN') {
      whereClause.OR = [
        { sourceBranchId: req.user.branchId },
        { destinationBranchId: req.user.branchId },
      ];
    }

    const transfers = await prisma.stockTransfer.findMany({
      where: whereClause,
      include: {
        sourceBranch: { select: { id: true, code: true, name: true } },
        destinationBranch: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(transfers);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch transfers' });
  }
};

export const createTransfer = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot initiate transfers' });
    }

    const { sourceBranchId, destinationBranchId, medicineId, batchNumber, quantity, notes } = req.body;

    const actualSourceId = req.user.role === 'SUPER_ADMIN' ? sourceBranchId : req.user.branchId;

    if (!actualSourceId || !destinationBranchId || !medicineId || !batchNumber || !quantity) {
      return res.status(400).json({ message: 'Missing transfer parameters' });
    }

    if (actualSourceId === destinationBranchId) {
      return res.status(400).json({ message: 'Source and destination branches cannot be the same' });
    }

    const qty = parseInt(quantity);
    if (qty <= 0) return res.status(400).json({ message: 'Quantity must be positive' });

    // Check source batch stock
    const sourceBatch = await prisma.stockBatch.findFirst({
      where: {
        branchId: actualSourceId,
        medicineId,
        batchNumber: batchNumber.trim(),
        status: 'ACTIVE',
      },
    });

    if (!sourceBatch || sourceBatch.availableQuantity < qty) {
      return res.status(400).json({
        message: `Insufficient stock in source branch. Available: ${sourceBatch?.availableQuantity || 0}`,
      });
    }

    const count = await prisma.stockTransfer.count();
    const transferNumber = `TRF-${String(count + 1).padStart(5, '0')}`;

    // Deduct stock from source and create transfer record
    const transfer = await prisma.$transaction(async (tx) => {
      // Deduct available quantity from source
      await tx.stockBatch.update({
        where: { id: sourceBatch.id },
        data: {
          availableQuantity: sourceBatch.availableQuantity - qty,
        },
      });

      const newTransfer = await tx.stockTransfer.create({
        data: {
          transferNumber,
          sourceBranchId: actualSourceId,
          destinationBranchId,
          medicineId,
          batchNumber: batchNumber.trim(),
          quantity: qty,
          requestedByUserId: req.user!.id,
          status: 'DISPATCHED',
          dispatchDate: new Date(),
          notes: notes ? notes.trim() : null,
        },
      });

      // Record movement on source branch
      await tx.stockMovement.create({
        data: {
          branchId: actualSourceId,
          medicineId,
          batchId: sourceBatch.id,
          movementType: 'TRANSFER_OUT',
          quantityDelta: -qty,
          unitPrice: sourceBatch.purchaseRate,
          referenceDocType: 'STOCK_TRANSFER',
          referenceDocId: newTransfer.id,
          reason: `Branch transfer dispatched to destination branch`,
          performedByUserId: req.user!.id,
        },
      });

      return newTransfer;
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: actualSourceId,
      action: 'BRANCH_TRANSFER_DISPATCH',
      targetEntity: 'STOCK_TRANSFER',
      entityId: transfer.id,
      details: { transferNumber, quantity: qty, destinationBranchId },
      req,
    });

    return res.status(201).json(transfer);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to create transfer' });
  }
};

export const receiveTransfer = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const id = req.params.id as string;
    const transfer = await prisma.stockTransfer.findUnique({ where: { id } });

    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });

    // Isolation check
    if (req.user.role !== 'SUPER_ADMIN' && transfer.destinationBranchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Only the destination branch can receive this transfer' });
    }

    if (transfer.status === 'RECEIVED') {
      return res.status(400).json({ message: 'Transfer has already been received. Double receipt prevented.' });
    }

    if (transfer.status !== 'DISPATCHED') {
      return res.status(400).json({ message: `Cannot receive transfer with status: ${transfer.status}` });
    }

    // Get original source batch details for price & expiry
    const sourceBatch = await prisma.stockBatch.findFirst({
      where: {
        branchId: transfer.sourceBranchId,
        medicineId: transfer.medicineId,
        batchNumber: transfer.batchNumber,
      },
    });

    const expiryDate = sourceBatch ? sourceBatch.expiryDate : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const purchaseRate = sourceBatch ? sourceBatch.purchaseRate : 0;
    const mrp = sourceBatch ? sourceBatch.mrp : 0;

    await prisma.$transaction(async (tx) => {
      // Update transfer status
      await tx.stockTransfer.update({
        where: { id: transfer.id },
        data: {
          status: 'RECEIVED',
          receiptDate: new Date(),
          approvedByUserId: req.user!.id,
        },
      });

      // Check if batch already exists at destination
      let destBatch = await tx.stockBatch.findFirst({
        where: {
          branchId: transfer.destinationBranchId,
          medicineId: transfer.medicineId,
          batchNumber: transfer.batchNumber,
        },
      });

      if (destBatch) {
        destBatch = await tx.stockBatch.update({
          where: { id: destBatch.id },
          data: {
            quantityReceived: destBatch.quantityReceived + transfer.quantity,
            availableQuantity: destBatch.availableQuantity + transfer.quantity,
            status: 'ACTIVE',
          },
        });
      } else {
        destBatch = await tx.stockBatch.create({
          data: {
            branchId: transfer.destinationBranchId,
            medicineId: transfer.medicineId,
            batchNumber: transfer.batchNumber,
            expiryDate,
            quantityReceived: transfer.quantity,
            availableQuantity: transfer.quantity,
            purchaseRate,
            mrp,
            sellingPrice: mrp,
            status: 'ACTIVE',
          },
        });
      }

      // Record movement on destination branch
      await tx.stockMovement.create({
        data: {
          branchId: transfer.destinationBranchId,
          medicineId: transfer.medicineId,
          batchId: destBatch.id,
          movementType: 'TRANSFER_IN',
          quantityDelta: transfer.quantity,
          unitPrice: purchaseRate,
          referenceDocType: 'STOCK_TRANSFER',
          referenceDocId: transfer.id,
          reason: `Branch transfer received from ${transfer.sourceBranchId}`,
          performedByUserId: req.user!.id,
        },
      });
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: transfer.destinationBranchId,
      action: 'BRANCH_TRANSFER_RECEIVE',
      targetEntity: 'STOCK_TRANSFER',
      entityId: transfer.id,
      details: { transferNumber: transfer.transferNumber, quantity: transfer.quantity },
      req,
    });

    return res.json({ message: 'Transfer received and stock added to branch successfully.' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to receive transfer' });
  }
};

export const updateBatch = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        message: 'You do not have permission to modify this record. Please contact the Super Admin for assistance.',
      });
    }

    const id = req.params.id as string;
    const { batchNumber, expiryDate, mrp, sellingPrice, status } = req.body;

    const existing = await prisma.stockBatch.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Stock batch not found' });
    }

    let parsedExpiry: Date | undefined;
    if (expiryDate) {
      parsedExpiry = new Date(expiryDate);
      if (isNaN(parsedExpiry.getTime())) {
        return res.status(400).json({ message: 'Invalid expiry date format' });
      }
    }

    const updated = await prisma.stockBatch.update({
      where: { id },
      data: {
        ...(batchNumber && { batchNumber: batchNumber.trim() }),
        ...(parsedExpiry && { expiryDate: parsedExpiry }),
        ...(mrp !== undefined && { mrp: parseFloat(mrp) }),
        ...(sellingPrice !== undefined && { sellingPrice: parseFloat(sellingPrice) }),
        ...(status && { status }),
      },
      include: {
        medicine: true,
        branch: { select: { id: true, code: true, name: true } },
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: updated.branchId,
      action: 'BATCH_UPDATE',
      targetEntity: 'STOCK_BATCH',
      entityId: updated.id,
      details: { batchNumber: updated.batchNumber, status: updated.status },
      req,
    });

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to update stock batch' });
  }
};

export const deleteBatch = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        message: 'You do not have permission to modify this record. Please contact the Super Admin for assistance.',
      });
    }

    const id = req.params.id as string;
    const batch = await prisma.stockBatch.findUnique({
      where: { id },
      include: {
        medicine: true,
      },
    });

    if (!batch) {
      return res.status(404).json({ message: 'Stock batch not found' });
    }

    // Check if used in sales invoice lines
    const salesCount = await prisma.salesInvoiceLine.count({
      where: { batchId: id },
    });

    // Check movements other than initial purchase/receipt
    const nonReceiptMovements = await prisma.stockMovement.count({
      where: {
        batchId: id,
        movementType: {
          in: ['SALE', 'TRANSFER_OUT', 'TRANSFER_IN', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN'],
        },
      },
    });

    if (salesCount > 0 || nonReceiptMovements > 0) {
      // Cannot hard delete without corrupting financial/audit records. Safely quarantine and set available quantity to 0
      await prisma.stockBatch.update({
        where: { id },
        data: {
          status: 'QUARANTINE',
          availableQuantity: 0,
        },
      });

      await logAuditEvent({
        userId: req.user.id,
        branchId: batch.branchId,
        action: 'BATCH_QUARANTINE',
        targetEntity: 'STOCK_BATCH',
        entityId: id,
        details: {
          batchNumber: batch.batchNumber,
          reason: 'Safely quarantined instead of hard-deleting because sales or movement history exists.',
        },
        req,
      });

      return res.json({
        success: true,
        quarantined: true,
        message: `Batch '${batch.batchNumber}' has active transactions or sales history. To preserve financial ledger auditability, it has been quarantined and removed from saleable inventory.`,
      });
    }

    // Safe hard-delete if no sales or movements
    await prisma.$transaction([
      prisma.stockMovement.deleteMany({ where: { batchId: id } }),
      prisma.stockBatch.delete({ where: { id } }),
    ]);

    await logAuditEvent({
      userId: req.user.id,
      branchId: batch.branchId,
      action: 'BATCH_DELETE',
      targetEntity: 'STOCK_BATCH',
      entityId: id,
      details: { batchNumber: batch.batchNumber },
      req,
    });

    return res.json({
      success: true,
      message: `Batch '${batch.batchNumber}' removed successfully.`,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to delete stock batch' });
  }
};

export const bulkBatchAction = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        message: 'You do not have permission to modify this record. Please contact the Super Admin for assistance.',
      });
    }

    const { batchIds, action } = req.body;
    if (!Array.isArray(batchIds) || batchIds.length === 0) {
      return res.status(400).json({ message: 'A non-empty array of batchIds is required' });
    }

    if (!['QUARANTINE', 'ACTIVE', 'DEPLETED', 'DELETE'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Supported: QUARANTINE, ACTIVE, DEPLETED, DELETE' });
    }

    let affectedCount = 0;
    const quarantinedIds: string[] = [];
    const deletedIds: string[] = [];
    const updatedIds: string[] = [];

    for (const id of batchIds) {
      const batch = await prisma.stockBatch.findUnique({ where: { id } });
      if (!batch) continue;

      if (action === 'DELETE') {
        const salesCount = await prisma.salesInvoiceLine.count({ where: { batchId: id } });
        const nonReceipt = await prisma.stockMovement.count({
          where: {
            batchId: id,
            movementType: { in: ['SALE', 'TRANSFER_OUT', 'TRANSFER_IN', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN'] },
          },
        });

        if (salesCount > 0 || nonReceipt > 0) {
          await prisma.stockBatch.update({
            where: { id },
            data: { status: 'QUARANTINE', availableQuantity: 0 },
          });
          quarantinedIds.push(id);
        } else {
          await prisma.stockMovement.deleteMany({ where: { batchId: id } });
          await prisma.stockBatch.delete({ where: { id } });
          deletedIds.push(id);
        }
      } else {
        await prisma.stockBatch.update({
          where: { id },
          data: {
            status: action,
            ...(action === 'DEPLETED' ? { availableQuantity: 0 } : {}),
          },
        });
        updatedIds.push(id);
      }
      affectedCount++;
    }

    await logAuditEvent({
      userId: req.user.id,
      action: 'BATCH_BULK_ACTION',
      targetEntity: 'STOCK_BATCH',
      details: { action, count: affectedCount, quarantinedIds, deletedIds, updatedIds },
      req,
    });

    let message = `Successfully processed ${affectedCount} batches with action '${action}'.`;
    if (quarantinedIds.length > 0) {
      message += ` (${quarantinedIds.length} batch(es) had sales records and were quarantined to protect audit history).`;
    }

    return res.json({
      success: true,
      affectedCount,
      quarantinedCount: quarantinedIds.length,
      deletedCount: deletedIds.length,
      updatedCount: updatedIds.length,
      message,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to execute bulk batch action' });
  }
};

/**
 * Helper to compute precise date ranges for ledger queries
 */
function parseDateRange(
  period?: string,
  startDate?: string,
  endDate?: string
): { startDateTime: Date; endDateTime: Date; label: string } {
  const now = new Date();

  if (period === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { startDateTime: start, endDateTime: end, label: 'Today' };
  }

  if (period === 'last7days') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { startDateTime: start, endDateTime: end, label: 'Last 7 Days' };
  }

  if (period === 'last30days') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { startDateTime: start, endDateTime: end, label: 'Last 30 Days' };
  }

  if (period === 'custom' && (startDate || endDate)) {
    const start = startDate
      ? new Date(startDate)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (endDate && endDate.length <= 10) {
      end.setHours(23, 59, 59, 999);
    }
    if (startDate && startDate.length <= 10) {
      start.setHours(0, 0, 0, 0);
    }
    return {
      startDateTime: start,
      endDateTime: end,
      label: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
    };
  }

  // Default: Today
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { startDateTime: start, endDateTime: end, label: 'Today' };
}

/**
 * GET /api/inventory/ledger/summary
 * Provides date-filtered KPI summaries:
 * 1. Opening Stock (Qty & Valuation before period)
 * 2. Stock Inward (Qty & Cost received during period)
 * 3. Stock Outward (Qty & Cost valuation issued during period)
 * 4. Current Available Stock (Live total remaining in pharmacy now)
 * 5. Inward Cost
 * 6. Outward Value (Valuation basis)
 * 7. Gross Profit/Loss (Eligible sales revenue minus COGS)
 * 8. Stock Adjustments (Damaged, expired, corrections, returns)
 */
export const getLedgerSummary = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId, period, startDate, endDate, medicineId } = req.query;

    const targetBranchId =
      req.user.role === 'SUPER_ADMIN' ? (branchId as string) || req.user.branchId : req.user.branchId;

    if (req.user.role !== 'SUPER_ADMIN' && branchId && branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied to other branch inventory ledger' });
    }

    const { startDateTime, endDateTime, label } = parseDateRange(
      period as string,
      startDate as string,
      endDate as string
    );

    const branchFilter = targetBranchId ? { branchId: targetBranchId } : {};
    const medicineFilter = medicineId ? { medicineId: medicineId as string } : {};

    // 1. Opening Stock (All movements strictly prior to startDateTime)
    const priorMovements = await prisma.stockMovement.findMany({
      where: {
        ...branchFilter,
        ...medicineFilter,
        createdAt: { lt: startDateTime },
      },
      select: {
        quantityDelta: true,
        unitPrice: true,
      },
    });

    let openingQuantity = 0;
    let openingValue = 0;
    for (const m of priorMovements) {
      openingQuantity += m.quantityDelta;
      openingValue += m.quantityDelta * (m.unitPrice || 0);
    }
    if (openingQuantity < 0) openingQuantity = 0;
    if (openingValue < 0) openingValue = 0;

    // 2. Inward Movements during period (quantityDelta > 0)
    const periodInward = await prisma.stockMovement.findMany({
      where: {
        ...branchFilter,
        ...medicineFilter,
        createdAt: { gte: startDateTime, lte: endDateTime },
        quantityDelta: { gt: 0 },
        movementType: { in: ['PURCHASE_RECEIPT', 'TRANSFER_IN', 'CUSTOMER_RETURN'] },
      },
      select: {
        quantityDelta: true,
        unitPrice: true,
      },
    });

    let inwardQuantity = 0;
    let inwardCost = 0;
    for (const m of periodInward) {
      inwardQuantity += m.quantityDelta;
      inwardCost += m.quantityDelta * (m.unitPrice || 0);
    }

    // 3. Outward Movements during period (quantityDelta < 0)
    const periodOutward = await prisma.stockMovement.findMany({
      where: {
        ...branchFilter,
        ...medicineFilter,
        createdAt: { gte: startDateTime, lte: endDateTime },
        quantityDelta: { lt: 0 },
        movementType: { in: ['SALE', 'TRANSFER_OUT', 'SUPPLIER_RETURN', 'DAMAGE_EXPIRY', 'CANCELLATION'] },
      },
      select: {
        quantityDelta: true,
        unitPrice: true,
      },
    });

    let outwardQuantity = 0;
    let outwardValue = 0; // Cost basis of issued stock
    for (const m of periodOutward) {
      const absQty = Math.abs(m.quantityDelta);
      outwardQuantity += absQty;
      outwardValue += absQty * (m.unitPrice || 0);
    }

    // 4. Current Available Stock (Live snapshot of actual stock remaining in pharmacy right now)
    const activeBatches = await prisma.stockBatch.findMany({
      where: {
        ...branchFilter,
        ...medicineFilter,
        status: 'ACTIVE',
        availableQuantity: { gt: 0 },
      },
      select: {
        availableQuantity: true,
        purchaseRate: true,
      },
    });

    let currentAvailableStock = 0;
    let currentStockValue = 0;
    for (const b of activeBatches) {
      currentAvailableStock += b.availableQuantity;
      currentStockValue += b.availableQuantity * b.purchaseRate;
    }

    // 5. Sales Revenue and COGS (Cost of Goods Sold)
    const completedSales = await prisma.salesInvoice.findMany({
      where: {
        ...branchFilter,
        status: 'COMPLETED',
        createdAt: { gte: startDateTime, lte: endDateTime },
      },
      include: {
        lines: {
          where: medicineFilter,
          select: {
            quantity: true,
            baseQuantity: true,
            lineTotal: true,
            purchaseRate: true,
          },
        },
      },
    });

    let salesRevenue = 0;
    let cogs = 0;
    for (const inv of completedSales) {
      for (const line of inv.lines) {
        salesRevenue += line.lineTotal;
        const units = line.baseQuantity && line.baseQuantity > 0 ? line.baseQuantity : line.quantity;
        cogs += units * (line.purchaseRate || 0);
      }
    }

    const grossProfit = salesRevenue - cogs;
    const grossProfitMargin = salesRevenue > 0 ? (grossProfit / salesRevenue) * 100 : 0;

    // 6. Stock Adjustments Breakdown
    const periodAdjustments = await prisma.stockMovement.findMany({
      where: {
        ...branchFilter,
        ...medicineFilter,
        createdAt: { gte: startDateTime, lte: endDateTime },
        movementType: { in: ['STOCK_CORRECTION', 'DAMAGE_EXPIRY', 'SUPPLIER_RETURN', 'CUSTOMER_RETURN'] },
      },
      select: {
        movementType: true,
        quantityDelta: true,
        unitPrice: true,
        reason: true,
      },
    });

    let netAdjustmentQuantity = 0;
    let netAdjustmentValue = 0;
    let damagedQty = 0;
    let damagedVal = 0;
    let expiredQty = 0;
    let expiredVal = 0;
    let correctionQty = 0;
    let correctionVal = 0;
    let supplierReturnQty = 0;
    let supplierReturnVal = 0;
    let customerReturnQty = 0;
    let customerReturnVal = 0;

    for (const m of periodAdjustments) {
      const val = m.quantityDelta * (m.unitPrice || 0);
      netAdjustmentQuantity += m.quantityDelta;
      netAdjustmentValue += val;

      if (m.movementType === 'DAMAGE_EXPIRY') {
        const isExpired = m.reason?.toLowerCase().includes('expire');
        if (isExpired) {
          expiredQty += Math.abs(m.quantityDelta);
          expiredVal += Math.abs(val);
        } else {
          damagedQty += Math.abs(m.quantityDelta);
          damagedVal += Math.abs(val);
        }
      } else if (m.movementType === 'STOCK_CORRECTION') {
        correctionQty += m.quantityDelta;
        correctionVal += val;
      } else if (m.movementType === 'SUPPLIER_RETURN') {
        supplierReturnQty += Math.abs(m.quantityDelta);
        supplierReturnVal += Math.abs(val);
      } else if (m.movementType === 'CUSTOMER_RETURN') {
        customerReturnQty += Math.abs(m.quantityDelta);
        customerReturnVal += Math.abs(val);
      }
    }

    return res.json({
      period: {
        label,
        startDate: startDateTime.toISOString(),
        endDate: endDateTime.toISOString(),
      },
      openingStock: {
        quantity: openingQuantity,
        value: parseFloat(openingValue.toFixed(2)),
      },
      inward: {
        quantity: inwardQuantity,
        cost: parseFloat(inwardCost.toFixed(2)),
      },
      outward: {
        quantity: outwardQuantity,
        value: parseFloat(outwardValue.toFixed(2)),
      },
      currentStock: {
        quantity: currentAvailableStock,
        value: parseFloat(currentStockValue.toFixed(2)),
      },
      inwardCost: parseFloat(inwardCost.toFixed(2)),
      outwardValue: parseFloat(outwardValue.toFixed(2)),
      salesRevenue: parseFloat(salesRevenue.toFixed(2)),
      cogs: parseFloat(cogs.toFixed(2)),
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      grossProfitMargin: parseFloat(grossProfitMargin.toFixed(2)),
      adjustments: {
        netQuantity: netAdjustmentQuantity,
        netValue: parseFloat(netAdjustmentValue.toFixed(2)),
        damaged: { quantity: damagedQty, value: parseFloat(damagedVal.toFixed(2)) },
        expired: { quantity: expiredQty, value: parseFloat(expiredVal.toFixed(2)) },
        corrections: { quantity: correctionQty, value: parseFloat(correctionVal.toFixed(2)) },
        supplierReturns: { quantity: supplierReturnQty, value: parseFloat(supplierReturnVal.toFixed(2)) },
        customerReturns: { quantity: customerReturnQty, value: parseFloat(customerReturnVal.toFixed(2)) },
      },
      valuationMethod: 'Batch-Specific Acquisition Cost (FIFO-deterministic)',
    });
  } catch (error: any) {
    console.error('Error fetching ledger summary:', error);
    return res.status(500).json({ message: error.message || 'Failed to fetch inventory ledger summary' });
  }
};

/**
 * GET /api/inventory/ledger/movements
 * Filterable, paginated stock movement ledger table:
 * - Date, Medicine, Dosage Form, Canonical Base Unit
 * - Batch, Expiry, Supplier
 * - Movement Type (Inward/Outward/Return/Adjustment)
 * - Inward Qty, Outward Qty, Unit Cost, Movement Value
 * - Current Available Batch Quantity
 * - Source Reference & Performed By User
 */
export const getLedgerMovements = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const {
      branchId,
      period,
      startDate,
      endDate,
      medicineId,
      batchNumber,
      supplierId,
      movementType,
      search,
      page = '1',
      limit = '25',
    } = req.query;

    const targetBranchId =
      req.user.role === 'SUPER_ADMIN' ? (branchId as string) || req.user.branchId : req.user.branchId;

    if (req.user.role !== 'SUPER_ADMIN' && branchId && branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied to other branch inventory movements' });
    }

    const { startDateTime, endDateTime } = parseDateRange(
      period as string,
      startDate as string,
      endDate as string
    );

    const whereClause: any = {
      createdAt: { gte: startDateTime, lte: endDateTime },
    };

    if (targetBranchId) whereClause.branchId = targetBranchId;
    if (medicineId) whereClause.medicineId = medicineId as string;
    if (movementType && movementType !== 'ALL') whereClause.movementType = movementType as string;

    if (batchNumber) {
      whereClause.batch = { batchNumber: { contains: (batchNumber as string).trim(), mode: 'insensitive' } };
    }

    if (supplierId) {
      whereClause.batch = {
        ...whereClause.batch,
        supplierId: supplierId as string,
      };
    }

    if (search && (search as string).trim()) {
      const q = (search as string).trim();
      whereClause.OR = [
        { medicine: { brandName: { contains: q, mode: 'insensitive' } } },
        { medicine: { genericName: { contains: q, mode: 'insensitive' } } },
        { medicine: { internalCode: { contains: q, mode: 'insensitive' } } },
        { batch: { batchNumber: { contains: q, mode: 'insensitive' } } },
        { referenceDocId: { contains: q, mode: 'insensitive' } },
        { reason: { contains: q, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(100, Math.max(1, parseInt(limit as string) || 25));
    const skip = (Math.max(1, parseInt(page as string) || 1) - 1) * take;

    const [total, rawMovements] = await Promise.all([
      prisma.stockMovement.count({ where: whereClause }),
      prisma.stockMovement.findMany({
        where: whereClause,
        include: {
          branch: { select: { id: true, code: true, name: true } },
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
          batch: {
            select: {
              id: true,
              batchNumber: true,
              expiryDate: true,
              availableQuantity: true,
              purchaseRate: true,
              supplier: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    // Resolve performedBy user names
    const userIds = Array.from(new Set(rawMovements.map((m) => m.performedByUserId).filter(Boolean)));
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, fullName: true, role: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const movementTypeLabels: Record<string, string> = {
      PURCHASE_RECEIPT: 'Purchase / Inward',
      SALE: 'Retail Sale / Outward',
      CUSTOMER_RETURN: 'Customer Return',
      SUPPLIER_RETURN: 'Supplier Return',
      DAMAGE_EXPIRY: 'Damage / Expiry',
      STOCK_CORRECTION: 'Stock Correction',
      TRANSFER_OUT: 'Transfer Out',
      TRANSFER_IN: 'Transfer In',
      CANCELLATION: 'Cancellation',
    };

    const movements = rawMovements.map((m) => {
      const user = userMap.get(m.performedByUserId);
      const isPositive = m.quantityDelta > 0;
      const absDelta = Math.abs(m.quantityDelta);
      const unitCost = m.unitPrice !== null && m.unitPrice !== undefined ? m.unitPrice : m.batch?.purchaseRate || 0;
      const movementValue = absDelta * unitCost;

      return {
        id: m.id,
        transactionDate: m.createdAt,
        movementType: m.movementType,
        movementTypeLabel: movementTypeLabels[m.movementType] || m.movementType,
        quantityDelta: m.quantityDelta,
        quantityInward: isPositive ? m.quantityDelta : 0,
        quantityOutward: !isPositive ? absDelta : 0,
        unitPurchaseCost: parseFloat(unitCost.toFixed(4)),
        totalMovementValue: parseFloat(movementValue.toFixed(2)),
        referenceDocType: m.referenceDocType,
        referenceDocId: m.referenceDocId,
        reason: m.reason,
        medicine: {
          id: m.medicine.id,
          brandName: m.medicine.brandName,
          genericName: m.medicine.genericName,
          strength: m.medicine.strength,
          dosageForm: m.medicine.dosageForm,
          baseUnit: m.medicine.baseUnit,
          packageUnit: m.medicine.packageUnit,
          conversionFactor: m.medicine.conversionFactor,
        },
        batch: m.batch
          ? {
              id: m.batch.id,
              batchNumber: m.batch.batchNumber,
              expiryDate: m.batch.expiryDate,
              availableQuantity: m.batch.availableQuantity,
              supplier: m.batch.supplier ? { id: m.batch.supplier.id, name: m.batch.supplier.name } : null,
            }
          : null,
        branch: m.branch,
        performedBy: user
          ? { id: user.id, username: user.username, fullName: user.fullName, role: user.role }
          : { id: m.performedByUserId, username: 'system', fullName: 'System Operation', role: '' },
      };
    });

    return res.json({
      total,
      page: Math.max(1, parseInt(page as string) || 1),
      limit: take,
      totalPages: Math.ceil(total / take),
      movements,
    });
  } catch (error: any) {
    console.error('Error fetching ledger movements:', error);
    return res.status(500).json({ message: error.message || 'Failed to fetch stock movements' });
  }
};

