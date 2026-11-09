import { Request, Response } from 'express';
import Decimal from 'decimal.js';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';
import { buildProductUnitConfig, determineDefaultSellingUnit } from '../../utils/unitConverter';

export const createInvoice = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const {
      branchId,
      customerName,
      customerPhone,
      doctorName,
      items,
      paymentMethod = 'CASH',
      notes,
    } = req.body;

    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId || req.user.branchId) : req.user.branchId;

    if (!targetBranchId) {
      return res.status(400).json({ message: 'Branch ID is required for invoice generation' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Invoice must contain at least one medicine item' });
    }

    const branch = await prisma.branch.findUnique({ where: { id: targetBranchId } });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    // Use Prisma transaction to atomically validate stock, deduct, and write invoice
    const result = await prisma.$transaction(async (tx) => {
      let subtotalDec = new Decimal(0);
      let discountTotalDec = new Decimal(0);
      let taxTotalDec = new Decimal(0);
      let cgstTotalDec = new Decimal(0);
      let sgstTotalDec = new Decimal(0);

      // Determine maximum allowed POS counter discount percentage from system settings
      const maxDiscountSetting = await tx.systemSetting.findUnique({
        where: { key: 'MAX_DISCOUNT_PERCENT' },
      });
      const maxAllowedDiscount = maxDiscountSetting
        ? parseFloat(maxDiscountSetting.value) || 100.0
        : 100.0;
      const effectiveMaxDiscount = Math.max(50.0, maxAllowedDiscount);

      const processedLines: any[] = [];
      const now = new Date();

      for (const item of items) {
        const { medicineId, batchId, quantity, unit, discountPercent = 0 } = item;

        const qty = parseInt(quantity);
        if (!qty || qty <= 0) {
          throw new Error('Quantity for each item must be greater than zero.');
        }

        const discPct = new Decimal(discountPercent || 0);
        if (discPct.isNegative() || discPct.greaterThan(effectiveMaxDiscount)) {
          throw new Error(`Discount percentage cannot exceed ${effectiveMaxDiscount}% policy limit.`);
        }

        // Fetch medicine
        const medicine = await tx.medicineProduct.findUnique({ where: { id: medicineId } });
        if (!medicine || !medicine.isActive) {
          throw new Error(`Medicine product with ID ${medicineId} is not active or not found.`);
        }

        // Build product unit configuration to determine multiplier to base inventory unit
        const unitConfig = buildProductUnitConfig(
          medicine.baseUnit,
          medicine.packageUnit,
          medicine.conversionFactor,
          medicine.dosageForm,
          medicine.unitConfig,
          medicine.packSize
        );

        const defaultUnit = determineDefaultSellingUnit(unitConfig.supportedUnits, medicine);
        const selectedUnit = (unit && typeof unit === 'string' && unit.trim())
          ? unit.trim()
          : defaultUnit;

        const matchedUnit = unitConfig.supportedUnits.find(
          (u) => u.unit.toLowerCase() === selectedUnit.toLowerCase()
        );
        if (!matchedUnit) {
          throw new Error(`Unit '${selectedUnit}' is not a supported selling unit for ${medicine.brandName}.`);
        }
        const multiplier = matchedUnit.multiplierToBase;
        const baseQtyToDeduct = qty * multiplier;

        // Fetch batch
        let batch;
        if (batchId) {
          batch = await tx.stockBatch.findUnique({ where: { id: batchId } });
        } else {
          // Auto FEFO fallback
          batch = await tx.stockBatch.findFirst({
            where: {
              branchId: targetBranchId,
              medicineId,
              status: 'ACTIVE',
              availableQuantity: { gte: baseQtyToDeduct },
              expiryDate: { gt: now },
            },
            orderBy: { expiryDate: 'asc' },
          });
        }

        if (!batch) {
          throw new Error(`No eligible batch found for ${medicine.brandName} with sufficient quantity.`);
        }

        if (batch.branchId !== targetBranchId) {
          throw new Error(`Batch ${batch.batchNumber} does not belong to branch ${branch.name}.`);
        }

        if (batch.status !== 'ACTIVE') {
          throw new Error(`Batch ${batch.batchNumber} is currently ${batch.status} and cannot be sold.`);
        }

        if (new Date(batch.expiryDate) <= now) {
          throw new Error(`Batch ${batch.batchNumber} of ${medicine.brandName} has expired (${batch.expiryDate.toISOString().split('T')[0]}) and cannot be sold.`);
        }

        if (batch.availableQuantity < baseQtyToDeduct) {
          throw new Error(`Insufficient stock for ${medicine.brandName} (Batch: ${batch.batchNumber}). Requested: ${baseQtyToDeduct} base units (${qty} ${selectedUnit}), Available: ${batch.availableQuantity}`);
        }

        // Decimal financial calculations
        // Determine the true price per base unit:
        // If the batch rate was stored normalized to base unit (e.g. batch.sellingPrice < medicine.mrp),
        // or if medicine.baseUnit is the base unit (multiplier 1), basePrice = batch.sellingPrice.
        // If batch.sellingPrice was quoted for a pack (e.g. medicine.baseUnit was 'Strip' with multiplier > 1),
        // divide by that pack's multiplier so we never multiply a strip rate by 10.
        const rawBatchRate = new Decimal(batch.sellingPrice || batch.mrp);
        const quotedUnit = unitConfig.supportedUnits.find(
          (u) => u.unit.toLowerCase() === (medicine.baseUnit || 'Tablet').toLowerCase()
        );
        const isAlreadyBaseRate = medicine.mrp > 0 && rawBatchRate.lessThan(new Decimal(medicine.mrp));
        const quotedMultiplier = (!isAlreadyBaseRate && quotedUnit && quotedUnit.multiplierToBase > 1)
          ? quotedUnit.multiplierToBase
          : 1;
        const trueBasePrice = rawBatchRate.dividedBy(quotedMultiplier);

        let parsedConfig: any = null;
        if (medicine.unitConfig) {
          try {
            parsedConfig = JSON.parse(medicine.unitConfig);
          } catch {}
        }

        let unitMrpDec: Decimal;
        if (selectedUnit.toLowerCase() === 'strip' && parsedConfig?.stripMrpPrice) {
          unitMrpDec = new Decimal(parsedConfig.stripMrpPrice);
        } else if (selectedUnit.toLowerCase() === 'tablet' && parsedConfig?.unitSellingPrice) {
          unitMrpDec = new Decimal(parsedConfig.unitSellingPrice);
        } else {
          unitMrpDec = trueBasePrice.times(multiplier).toDecimalPlaces(2);
        }

        const grossAmount = unitMrpDec.times(qty);

        // Discount
        const lineDiscount = grossAmount.times(discPct).dividedBy(100);
        const netAfterDiscount = grossAmount.minus(lineDiscount);

        // GST calculation (Tax-inclusive reverse calculation)
        // Rate: 12% -> base = net / (1 + 0.12)
        const gstRateDec = new Decimal(medicine.gstRate);
        const taxFactor = new Decimal(1).plus(gstRateDec.dividedBy(100));
        const taxableAmount = netAfterDiscount.dividedBy(taxFactor);
        const lineTaxTotal = netAfterDiscount.minus(taxableAmount);

        // Equal split into CGST and SGST for intra-state sales
        const lineCgst = lineTaxTotal.dividedBy(2);
        const lineSgst = lineTaxTotal.dividedBy(2);

        subtotalDec = subtotalDec.plus(taxableAmount);
        discountTotalDec = discountTotalDec.plus(lineDiscount);
        taxTotalDec = taxTotalDec.plus(lineTaxTotal);
        cgstTotalDec = cgstTotalDec.plus(lineCgst);
        sgstTotalDec = sgstTotalDec.plus(lineSgst);

        // Deduct batch stock in base units
        await tx.stockBatch.update({
          where: { id: batch.id },
          data: {
            availableQuantity: batch.availableQuantity - baseQtyToDeduct,
            status: batch.availableQuantity - baseQtyToDeduct === 0 ? 'DEPLETED' : 'ACTIVE',
          },
        });

        processedLines.push({
          medicineId: medicine.id,
          batchId: batch.id,
          medicineName: medicine.brandName,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          quantity: qty,
          unit: selectedUnit,
          conversionFactor: multiplier,
          baseQuantity: baseQtyToDeduct,
          unitMrp: unitMrpDec.toDecimalPlaces(2).toNumber(),
          unitRate: taxableAmount.dividedBy(qty).toDecimalPlaces(2).toNumber(),
          discountPercent: discPct.toNumber(),
          discountAmount: lineDiscount.toDecimalPlaces(2).toNumber(),
          hsnCode: medicine.hsnCode || '30049099',
          gstRate: medicine.gstRate,
          cgstAmount: lineCgst.toDecimalPlaces(2).toNumber(),
          sgstAmount: lineSgst.toDecimalPlaces(2).toNumber(),
          lineTotal: netAfterDiscount.toDecimalPlaces(2).toNumber(),
          purchaseRate: (selectedUnit.toLowerCase() === 'strip' && parsedConfig?.stripPurchasePrice)
            ? parsedConfig.stripPurchasePrice
            : ((selectedUnit.toLowerCase() === 'tablet' && parsedConfig?.purchaseUnitPrice)
              ? parsedConfig.purchaseUnitPrice
              : new Decimal(batch.purchaseRate).dividedBy(quotedMultiplier).times(multiplier).toDecimalPlaces(2).toNumber()),
        });
      }

      // Grand total with standard rounding
      const netTotalDec = subtotalDec.plus(taxTotalDec);
      const roundedTotalDec = netTotalDec.round();
      const roundOffDec = roundedTotalDec.minus(netTotalDec);

      // Generate invoice number
      const invoiceCount = await tx.salesInvoice.count({ where: { branchId: targetBranchId } });
      const year = now.getFullYear();
      const invoiceNumber = `INV-${branch.code.replace('B-', '')}-${year}-${String(invoiceCount + 1).padStart(5, '0')}`;

      // Create SalesInvoice
      const invoice = await tx.salesInvoice.create({
        data: {
          invoiceNumber,
          branchId: targetBranchId,
          cashierId: req.user!.id,
          customerName: customerName ? customerName.trim() : null,
          customerPhone: customerPhone ? customerPhone.trim() : null,
          doctorName: doctorName ? doctorName.trim() : null,
          subtotal: subtotalDec.toDecimalPlaces(2).toNumber(),
          discountTotal: discountTotalDec.toDecimalPlaces(2).toNumber(),
          taxTotal: taxTotalDec.toDecimalPlaces(2).toNumber(),
          cgstTotal: cgstTotalDec.toDecimalPlaces(2).toNumber(),
          sgstTotal: sgstTotalDec.toDecimalPlaces(2).toNumber(),
          roundOff: roundOffDec.toDecimalPlaces(2).toNumber(),
          grandTotal: roundedTotalDec.toDecimalPlaces(2).toNumber(),
          paymentMethod,
          status: 'COMPLETED',
          notes: notes ? notes.trim() : null,
          lines: {
            create: processedLines.map((l) => ({
              medicineId: l.medicineId,
              batchId: l.batchId,
              medicineName: l.medicineName,
              batchNumber: l.batchNumber,
              expiryDate: l.expiryDate,
              quantity: l.quantity,
              unit: l.unit,
              conversionFactor: l.conversionFactor,
              baseQuantity: l.baseQuantity,
              unitMrp: l.unitMrp,
              unitRate: l.unitRate,
              discountPercent: l.discountPercent,
              discountAmount: l.discountAmount,
              hsnCode: l.hsnCode,
              gstRate: l.gstRate,
              cgstAmount: l.cgstAmount,
              sgstAmount: l.sgstAmount,
              lineTotal: l.lineTotal,
              purchaseRate: l.purchaseRate,
            })),
          },
        },
        include: {
          lines: true,
          branch: true,
        },
      });

      // Record stock movements
      for (const line of processedLines) {
        await tx.stockMovement.create({
          data: {
            branchId: targetBranchId,
            medicineId: line.medicineId,
            batchId: line.batchId,
            movementType: 'SALE',
            quantityDelta: -line.baseQuantity,
            unitPrice: line.unitMrp,
            referenceDocType: 'SALES_INVOICE',
            referenceDocId: invoice.id,
            reason: `Retail sale invoice ${invoice.invoiceNumber}`,
            performedByUserId: req.user!.id,
          },
        });
      }

      return invoice;
    }, { maxWait: 10000, timeout: 25000 });

    await logAuditEvent({
      userId: req.user.id,
      branchId: targetBranchId,
      action: 'SALE_CREATE',
      targetEntity: 'SALES_INVOICE',
      entityId: result.id,
      details: {
        invoiceNumber: result.invoiceNumber,
        grandTotal: result.grandTotal,
        itemsCount: result.lines.length,
      },
      req,
    });

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Invoice error:', error);
    return res.status(400).json({ message: error.message || 'Failed to complete sales invoice' });
  }
};

export const getInvoices = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId, invoiceNumber, status, paymentMethod, startDate, endDate, page = '1', limit = '50' } = req.query;

    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    const whereClause: any = {};
    if (targetBranchId) whereClause.branchId = targetBranchId;
    if (invoiceNumber) whereClause.invoiceNumber = { contains: (invoiceNumber as string).trim(), mode: 'insensitive' };
    if (status) whereClause.status = status as string;
    if (paymentMethod) whereClause.paymentMethod = paymentMethod as string;

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        whereClause.createdAt.lte = end;
      }
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [total, invoices] = await Promise.all([
      prisma.salesInvoice.count({ where: whereClause }),
      prisma.salesInvoice.findMany({
        where: whereClause,
        include: {
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
      invoices,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch invoices' });
  }
};

export const getInvoiceById = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const id = req.params.id as string;
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id },
      include: {
        branch: true,
        lines: {
          include: {
            medicine: true,
          },
        },
      },
    });

    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    // Isolation check
    if (req.user.role !== 'SUPER_ADMIN' && invoice.branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied: Invoice belongs to another branch' });
    }

    return res.json(invoice);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch invoice details' });
  }
};

export const cancelInvoice = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const id = req.params.id as string;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Cancellation reason is strictly required by audit compliance rules' });
    }

    const invoice = await prisma.salesInvoice.findUnique({
      where: { id },
      include: { lines: true, branch: true },
    });

    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    if (req.user.role !== 'SUPER_ADMIN' && invoice.branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied to cancel invoice from another branch' });
    }

    if (invoice.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Invoice has already been cancelled.' });
    }

    // Atomic transaction: mark invoice CANCELLED, restore stock, write movement
    await prisma.$transaction(async (tx) => {
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason.trim(),
          cancelledAt: new Date(),
          cancelledByUserId: req.user!.id,
        },
      });

      for (const line of invoice.lines) {
        if (line.batchId) {
          // Restore stock batch
          const batch = await tx.stockBatch.findUnique({ where: { id: line.batchId } });
          if (batch) {
            const qtyToRestore = (line.baseQuantity && line.baseQuantity > 0) ? line.baseQuantity : line.quantity;
            await tx.stockBatch.update({
              where: { id: batch.id },
              data: {
                availableQuantity: batch.availableQuantity + qtyToRestore,
                status: 'ACTIVE',
              },
            });

            // Record customer return / cancellation movement
            await tx.stockMovement.create({
              data: {
                branchId: invoice.branchId,
                medicineId: line.medicineId,
                batchId: batch.id,
                movementType: 'CUSTOMER_RETURN',
                quantityDelta: qtyToRestore,
                unitPrice: line.unitMrp,
                referenceDocType: 'SALES_INVOICE',
                referenceDocId: invoice.id,
                reason: `Invoice cancellation: ${reason.trim()}`,
                performedByUserId: req.user!.id,
              },
            });
          }
        }
      }
    }, { maxWait: 10000, timeout: 25000 });

    await logAuditEvent({
      userId: req.user.id,
      branchId: invoice.branchId,
      action: 'SALE_CANCEL',
      targetEntity: 'SALES_INVOICE',
      entityId: invoice.id,
      details: { invoiceNumber: invoice.invoiceNumber, reason: reason.trim() },
      req,
    });

    return res.json({ message: 'Invoice cancelled and stock restored successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to cancel invoice' });
  }
};
