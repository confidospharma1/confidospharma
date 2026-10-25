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
          supplier: { select: { id: true, name: true, phone: true, gstin: true } },
          branch: { select: { id: true, code: true, name: true } },
          lines: {
            include: {
              medicine: { select: { id: true, internalCode: true, brandName: true, genericName: true } },
            },
          },
          _count: { select: { lines: true, returns: true } },
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
      invoiceDiscountPercent = 0,
      invoiceDiscountAmount = 0,
      additionalCharges = 0,
      paymentMode = 'CASH',
      paidAmount,
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
      let lineDiscountsTotalDec = new Decimal(0);

      const count = await tx.purchaseInvoice.count({ where: { branchId: targetBranchId } });
      const invoiceNumber = `PUR-${branch.code.replace('B-', '')}-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

      const processedLines: any[] = [];

      for (const line of lines) {
        const {
          medicineId,
          batchNumber,
          expiryDate,
          quantity,
          freeQuantity = 0,
          purchaseRate,
          sellingRate,
          mrp,
          discountPercent = 0,
          discountAmount = 0,
          gstRate,
        } = line;

        const qty = parseInt(quantity);
        if (isNaN(qty) || qty <= 0) {
          throw new Error('Quantity must be an integer greater than zero.');
        }

        const freeQty = parseInt(freeQuantity || 0);
        if (isNaN(freeQty) || freeQty < 0) {
          throw new Error('Free/scheme quantity cannot be negative.');
        }

        const rateDec = new Decimal(purchaseRate);
        if (rateDec.isNegative()) {
          throw new Error('Purchase rate cannot be negative.');
        }

        const mrpDec = new Decimal(mrp);
        if (mrpDec.isNegative()) {
          throw new Error('MRP cannot be negative.');
        }

        // Selling rate entered by user, falls back to MRP if omitted
        const sellingRateDec = sellingRate !== undefined && sellingRate !== null && sellingRate !== ''
          ? new Decimal(sellingRate)
          : mrpDec;

        if (sellingRateDec.isNegative()) {
          throw new Error('Selling rate cannot be negative.');
        }

        const gstDec = new Decimal(gstRate || 0);

        // Gross line value = Quantity * Purchase Rate (scheme free units not charged in line gross)
        const grossLine = rateDec.times(qty);

        // Calculate line discount
        let lineDisc = new Decimal(0);
        const discPct = new Decimal(discountPercent || 0);
        if (discPct.greaterThan(0)) {
          if (discPct.greaterThan(100)) {
            throw new Error('Line discount percentage cannot exceed 100%.');
          }
          lineDisc = grossLine.times(discPct).dividedBy(100);
        } else if (discountAmount && new Decimal(discountAmount).greaterThan(0)) {
          lineDisc = new Decimal(discountAmount);
        }

        if (lineDisc.greaterThan(grossLine)) {
          throw new Error(`Discount on batch ${batchNumber} cannot exceed gross purchase value.`);
        }

        const lineTaxable = grossLine.minus(lineDisc);
        const lineTax = lineTaxable.times(gstDec).dividedBy(100);
        const lineTotal = lineTaxable.plus(lineTax);

        subtotalDec = subtotalDec.plus(lineTaxable);
        taxTotalDec = taxTotalDec.plus(lineTax);
        lineDiscountsTotalDec = lineDiscountsTotalDec.plus(lineDisc);

        const parsedExpiry = new Date(expiryDate);
        if (isNaN(parsedExpiry.getTime())) {
          throw new Error(`Invalid expiry date format for batch ${batchNumber}`);
        }

        const totalBatchQty = qty + freeQty;

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
              quantityReceived: batch.quantityReceived + totalBatchQty,
              availableQuantity: batch.availableQuantity + totalBatchQty,
              purchaseRate: rateDec.toNumber(),
              sellingPrice: sellingRateDec.toNumber(),
              mrp: mrpDec.toNumber(),
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
              quantityReceived: totalBatchQty,
              availableQuantity: totalBatchQty,
              purchaseRate: rateDec.toNumber(),
              sellingPrice: sellingRateDec.toNumber(),
              mrp: mrpDec.toNumber(),
              supplierId,
              purchaseInvoiceRef: supplierInvoiceNumber.trim(),
              status: 'ACTIVE',
            },
          });
        }

        // Record stock movement (includes free/scheme quantity added to inventory)
        await tx.stockMovement.create({
          data: {
            branchId: targetBranchId,
            medicineId,
            batchId: batch.id,
            movementType: 'PURCHASE_RECEIPT',
            quantityDelta: totalBatchQty,
            unitPrice: rateDec.toNumber(),
            referenceDocType: 'PURCHASE_INVOICE',
            referenceDocId: invoiceNumber,
            reason: `Supplier purchase from invoice ${supplierInvoiceNumber}${freeQty > 0 ? ` (+${freeQty} free)` : ''}`,
            performedByUserId: req.user!.id,
          },
        });

        processedLines.push({
          medicineId,
          batchNumber: batchNumber.trim(),
          expiryDate: parsedExpiry,
          quantity: qty,
          freeQuantity: freeQty,
          purchaseRate: rateDec.toNumber(),
          sellingRate: sellingRateDec.toNumber(),
          mrp: mrpDec.toNumber(),
          discountPercent: discPct.toNumber(),
          discountAmount: lineDisc.toDecimalPlaces(2).toNumber(),
          gstRate: gstDec.toNumber(),
          taxAmount: lineTax.toDecimalPlaces(2).toNumber(),
          lineTotal: lineTotal.toDecimalPlaces(2).toNumber(),
        });
      }

      // Invoice-level discount calculation
      let invDiscDec = new Decimal(0);
      const invDiscPct = new Decimal(invoiceDiscountPercent || 0);
      if (invDiscPct.greaterThan(0)) {
        if (invDiscPct.greaterThan(100)) throw new Error('Invoice discount percentage cannot exceed 100%.');
        invDiscDec = subtotalDec.times(invDiscPct).dividedBy(100);
      } else if (invoiceDiscountAmount && new Decimal(invoiceDiscountAmount).greaterThan(0)) {
        invDiscDec = new Decimal(invoiceDiscountAmount);
      }

      if (invDiscDec.greaterThan(subtotalDec)) {
        throw new Error('Invoice discount cannot exceed subtotal amount.');
      }

      const totalDiscountDec = lineDiscountsTotalDec.plus(invDiscDec);
      const chargesDec = new Decimal(additionalCharges || 0);
      const grandTotalDec = subtotalDec.minus(invDiscDec).plus(taxTotalDec).plus(chargesDec);

      // Paid and outstanding calculation
      let paidDec = new Decimal(0);
      if (paidAmount !== undefined && paidAmount !== null && paidAmount !== '') {
        paidDec = new Decimal(paidAmount);
      } else {
        // If cash/UPI/card default paid is full, if CREDIT default is 0
        paidDec = paymentMode === 'CREDIT' ? new Decimal(0) : grandTotalDec;
      }

      let outstandingDec = grandTotalDec.minus(paidDec);
      if (outstandingDec.isNegative()) outstandingDec = new Decimal(0);

      const purchaseInvoice = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber,
          supplierInvoiceNumber: supplierInvoiceNumber.trim(),
          supplierId,
          branchId: targetBranchId,
          invoiceDate: new Date(invoiceDate || Date.now()),
          subtotal: subtotalDec.toDecimalPlaces(2).toNumber(),
          discountTotal: totalDiscountDec.toDecimalPlaces(2).toNumber(),
          taxTotal: taxTotalDec.toDecimalPlaces(2).toNumber(),
          additionalCharges: chargesDec.toDecimalPlaces(2).toNumber(),
          grandTotal: grandTotalDec.toDecimalPlaces(2).toNumber(),
          paymentMode,
          paidAmount: paidDec.toDecimalPlaces(2).toNumber(),
          outstandingAmount: outstandingDec.toDecimalPlaces(2).toNumber(),
          status: 'RECEIVED',
          receivedByUserId: req.user!.id,
          notes: notes ? notes.trim() : null,
          lines: {
            create: processedLines,
          },
        },
        include: {
          lines: {
            include: {
              medicine: true,
            },
          },
          supplier: true,
          branch: true,
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
      details: {
        invoiceNumber: result.invoiceNumber,
        supplierInvoiceNumber,
        grandTotal: result.grandTotal,
        paymentMode,
        outstandingAmount: result.outstandingAmount,
      },
      req,
    });

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Purchase error:', error);
    return res.status(400).json({ message: error.message || 'Failed to record purchase' });
  }
};

export const createPurchaseReturn = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot process purchase returns' });
    }

    const {
      branchId,
      supplierId,
      purchaseInvoiceId,
      reason,
      items,
    } = req.body;

    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId || req.user.branchId) : req.user.branchId;

    if (!targetBranchId || !supplierId || !reason || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Branch ID, supplier, return reason, and items are required.' });
    }

    const branch = await prisma.branch.findUnique({ where: { id: targetBranchId } });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    const result = await prisma.$transaction(async (tx) => {
      let subtotalDec = new Decimal(0);
      let taxTotalDec = new Decimal(0);

      const count = await tx.purchaseReturn.count({ where: { branchId: targetBranchId } });
      const returnNumber = `PRT-${branch.code.replace('B-', '')}-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

      const processedLines: any[] = [];

      for (const item of items) {
        const { medicineId, batchId, batchNumber, quantity, purchaseRate, gstRate } = item;

        const qty = parseInt(quantity);
        if (isNaN(qty) || qty <= 0) {
          throw new Error('Return quantity must be greater than zero.');
        }

        // Find batch in branch
        let batch;
        if (batchId) {
          batch = await tx.stockBatch.findUnique({ where: { id: batchId } });
        } else {
          batch = await tx.stockBatch.findFirst({
            where: {
              branchId: targetBranchId,
              medicineId,
              batchNumber: batchNumber.trim(),
            },
          });
        }

        if (!batch) {
          throw new Error(`Stock batch ${batchNumber} not found in this branch.`);
        }

        if (batch.availableQuantity < qty) {
          throw new Error(`Cannot return ${qty} units of batch ${batch.batchNumber}. Available in branch: ${batch.availableQuantity}`);
        }

        const rateDec = new Decimal(purchaseRate !== undefined ? purchaseRate : batch.purchaseRate);
        const gstDec = new Decimal(gstRate !== undefined ? gstRate : 12);

        const lineSubtotal = rateDec.times(qty);
        const lineTax = lineSubtotal.times(gstDec).dividedBy(100);
        const lineTotal = lineSubtotal.plus(lineTax);

        subtotalDec = subtotalDec.plus(lineSubtotal);
        taxTotalDec = taxTotalDec.plus(lineTax);

        // Deduct available quantity from stock batch
        const updatedAvailable = batch.availableQuantity - qty;
        await tx.stockBatch.update({
          where: { id: batch.id },
          data: {
            availableQuantity: updatedAvailable,
            status: updatedAvailable === 0 ? 'DEPLETED' : batch.status,
          },
        });

        // Record stock movement (SUPPLIER_RETURN)
        await tx.stockMovement.create({
          data: {
            branchId: targetBranchId,
            medicineId,
            batchId: batch.id,
            movementType: 'SUPPLIER_RETURN',
            quantityDelta: -qty,
            unitPrice: rateDec.toNumber(),
            referenceDocType: 'PURCHASE_RETURN',
            referenceDocId: returnNumber,
            reason: `Return to supplier: ${reason.trim()}`,
            performedByUserId: req.user!.id,
          },
        });

        processedLines.push({
          medicineId,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          quantity: qty,
          purchaseRate: rateDec.toNumber(),
          gstRate: gstDec.toNumber(),
          taxAmount: lineTax.toDecimalPlaces(2).toNumber(),
          lineTotal: lineTotal.toDecimalPlaces(2).toNumber(),
        });
      }

      const grandTotalDec = subtotalDec.plus(taxTotalDec);

      const purchaseReturn = await tx.purchaseReturn.create({
        data: {
          returnNumber,
          purchaseInvoiceId: purchaseInvoiceId || null,
          supplierId,
          branchId: targetBranchId,
          returnDate: new Date(),
          subtotal: subtotalDec.toDecimalPlaces(2).toNumber(),
          taxTotal: taxTotalDec.toDecimalPlaces(2).toNumber(),
          grandTotal: grandTotalDec.toDecimalPlaces(2).toNumber(),
          reason: reason.trim(),
          status: 'COMPLETED',
          createdById: req.user!.id,
          lines: {
            create: processedLines,
          },
        },
        include: {
          lines: {
            include: { medicine: true },
          },
          supplier: true,
          branch: true,
        },
      });

      return purchaseReturn;
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: targetBranchId,
      action: 'PURCHASE_RETURN',
      targetEntity: 'PURCHASE_RETURN',
      entityId: result.id,
      details: {
        returnNumber: result.returnNumber,
        grandTotal: result.grandTotal,
        reason,
      },
      req,
    });

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Purchase return error:', error);
    return res.status(400).json({ message: error.message || 'Failed to process purchase return' });
  }
};

export const getPurchaseReturns = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId, page = '1', limit = '50' } = req.query;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    const whereClause: any = {};
    if (targetBranchId) whereClause.branchId = targetBranchId;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [total, returns] = await Promise.all([
      prisma.purchaseReturn.count({ where: whereClause }),
      prisma.purchaseReturn.findMany({
        where: whereClause,
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, code: true, name: true } },
          lines: {
            include: {
              medicine: { select: { id: true, internalCode: true, brandName: true } },
            },
          },
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
      returns,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch purchase returns' });
  }
};
