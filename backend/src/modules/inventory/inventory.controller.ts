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
      // Check if batch already exists in this branch
      let batch = await tx.stockBatch.findFirst({
        where: {
          branchId: targetBranchId,
          medicineId,
          batchNumber: batchNumber.trim(),
        },
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
