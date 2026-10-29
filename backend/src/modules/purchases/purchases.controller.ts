import { Request, Response } from 'express';
import Decimal from 'decimal.js';
import * as xlsx from 'xlsx';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';
import { generateUniqueMedicineCode } from '../../utils/codeGenerator';
import {
  buildHeaderMapping,
  extractMappedRow,
  parseExpiryDate,
  parseCleanNumber,
  parseCleanInt,
  resolveProductAndBrandNames,
} from '../imports/imports.mapper';
import { matchProduct, CandidateProduct } from '../../utils/productMatcher';
import { buildProductUnitConfig, convertToBaseQuantity } from '../../utils/unitConverter';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const getPurchases = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId, search, page = '1', limit = '50' } = req.query;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    const whereClause: any = {};
    if (targetBranchId) whereClause.branchId = targetBranchId;

    if (search) {
      const q = (search as string).trim();
      whereClause.OR = [
        { invoiceNumber: { contains: q, mode: 'insensitive' } },
        { supplierInvoiceNumber: { contains: q, mode: 'insensitive' } },
        { supplier: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [total, purchases] = await Promise.all([
      prisma.purchaseInvoice.count({ where: whereClause }),
      prisma.purchaseInvoice.findMany({
        where: whereClause,
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              contactPerson: true,
              phone: true,
              email: true,
              gstin: true,
              address: true,
            },
          },
          branch: { select: { id: true, code: true, name: true } },
          lines: {
            include: {
              medicine: {
                select: {
                  id: true,
                  internalCode: true,
                  brandName: true,
                  genericName: true,
                  strength: true,
                  dosageForm: true,
                  hsnCode: true,
                },
              },
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

export const getPurchaseById = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const id = req.params.id as string;
    const purchase = await prisma.purchaseInvoice.findUnique({
      where: { id },
      include: {
        supplier: true,
        branch: true,
        lines: {
          include: {
            medicine: true,
          },
        },
        returns: {
          include: {
            lines: true,
          },
        },
      },
    });

    if (!purchase) {
      return res.status(404).json({ message: 'Purchase invoice not found' });
    }

    if (req.user.role !== 'SUPER_ADMIN' && purchase.branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied: Invoice belongs to another branch' });
    }

    return res.json(purchase);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to fetch purchase invoice details' });
  }
};

export const createPurchase = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot record purchases' });
    }

    let {
      supplierId,
      newSupplier,
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

    let targetBranchId: string | null = null;
    if (req.user.role === 'SUPER_ADMIN') {
      targetBranchId = (branchId && typeof branchId === 'string' && branchId.trim()) ? branchId.trim() : (req.user.branchId || null);
    } else {
      if (branchId && typeof branchId === 'string' && branchId.trim() && branchId.trim() !== req.user.branchId) {
        return res.status(403).json({ message: 'You are not authorized to record purchases for another branch' });
      }
      targetBranchId = req.user.branchId || null;
    }

    if (!targetBranchId) {
      return res.status(400).json({ message: 'Target branch is required.' });
    }

    if (!supplierInvoiceNumber || !supplierInvoiceNumber.trim()) {
      return res.status(400).json({ message: 'Supplier invoice number is required.' });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: 'At least one medicine line item is required.' });
    }

    const branch = await prisma.branch.findUnique({ where: { id: targetBranchId } });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    if (!branch.isActive) return res.status(400).json({ message: 'Target branch is inactive' });

    const result = await prisma.$transaction(async (tx) => {
      // 1. Resolve or Create Supplier
      let resolvedSupplierId = supplierId;

      if ((!resolvedSupplierId || resolvedSupplierId === 'NEW') && newSupplier) {
        if (!newSupplier.name || !newSupplier.phone) {
          throw new Error('New supplier requires name and phone number.');
        }

        const trimmedSupName = newSupplier.name.trim();
        const trimmedSupPhone = newSupplier.phone.trim();
        const trimmedSupEmail = newSupplier.email ? newSupplier.email.trim() : null;

        if (trimmedSupEmail && !EMAIL_REGEX.test(trimmedSupEmail)) {
          throw new Error('Invalid supplier email format. Please provide a valid email.');
        }

        // Check if supplier already exists by name or phone
        let existingSup = await tx.supplier.findFirst({
          where: {
            OR: [
              { name: trimmedSupName },
              { phone: trimmedSupPhone },
            ],
          },
        });

        if (existingSup) {
          resolvedSupplierId = existingSup.id;
          // Update email or contact person if previously missing
          if (trimmedSupEmail && !existingSup.email) {
            await tx.supplier.update({
              where: { id: existingSup.id },
              data: { email: trimmedSupEmail },
            });
          }
        } else {
          const createdSup = await tx.supplier.create({
            data: {
              name: trimmedSupName,
              phone: trimmedSupPhone,
              email: trimmedSupEmail,
              contactPerson: newSupplier.contactPerson ? newSupplier.contactPerson.trim() : null,
              gstin: newSupplier.gstin ? newSupplier.gstin.toUpperCase().trim() : null,
              address: newSupplier.address ? newSupplier.address.trim() : null,
              dlNumber: newSupplier.dlNumber ? newSupplier.dlNumber.trim() : null,
              isActive: true,
            },
          });
          resolvedSupplierId = createdSup.id;
        }
      }

      if (!resolvedSupplierId) {
        throw new Error('Please select an existing supplier or provide new supplier details.');
      }

      // Check duplicate supplier invoice
      const existing = await tx.purchaseInvoice.findFirst({
        where: {
          supplierId: resolvedSupplierId,
          supplierInvoiceNumber: supplierInvoiceNumber.trim(),
          branchId: targetBranchId,
          status: { not: 'CANCELLED' },
        },
      });

      if (existing) {
        throw new Error(`Duplicate invoice: Supplier Invoice '${supplierInvoiceNumber}' from this supplier has already been recorded (Invoice: ${existing.invoiceNumber}).`);
      }

      let subtotalDec = new Decimal(0);
      let taxTotalDec = new Decimal(0);
      let lineDiscountsTotalDec = new Decimal(0);

      const count = await tx.purchaseInvoice.count({ where: { branchId: targetBranchId } });
      const invoiceNumber = `PUR-${branch.code.replace('B-', '')}-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

      const processedLines: any[] = [];

      for (const line of lines) {
        let {
          medicineId,
          newMedicine,
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

        // Inline Medicine Creation Support if medicineId not given or set to 'NEW'
        if ((!medicineId || medicineId === 'NEW') && newMedicine) {
          if (!newMedicine.brandName || !newMedicine.genericName) {
            throw new Error('Brand name and generic name are required to register a new medicine.');
          }

          const existingMed = await tx.medicineProduct.findFirst({
            where: {
              brandName: newMedicine.brandName.trim(),
              strength: newMedicine.strength ? newMedicine.strength.trim() : '',
            },
          });

          if (existingMed) {
            medicineId = existingMed.id;
          } else {
            const internalCode = await generateUniqueMedicineCode(tx);
            const createdMed = await tx.medicineProduct.create({
              data: {
                internalCode,
                brandName: newMedicine.brandName.trim(),
                genericName: newMedicine.genericName.trim(),
                strength: newMedicine.strength ? newMedicine.strength.trim() : 'Standard',
                dosageForm: newMedicine.dosageForm || 'Tablet',
                manufacturer: newMedicine.manufacturer ? newMedicine.manufacturer.trim() : 'Generic / Pharma',
                packSize: newMedicine.packSize || '10 Strips',
                baseUnit: newMedicine.baseUnit || 'Strip',
                hsnCode: newMedicine.hsnCode ? newMedicine.hsnCode.trim() : '30049099',
                gstRate: parseFloat(newMedicine.gstRate || gstRate || 5.0),
                mrp: parseFloat(newMedicine.mrp || mrp || 100),
                defaultPurchaseRate: parseFloat(purchaseRate || 70),
                defaultSellingRate: parseFloat(sellingRate || mrp || 100),
                prescriptionType: newMedicine.prescriptionType || 'Schedule H',
                storageNotes: newMedicine.storageNotes ? newMedicine.storageNotes.trim() : undefined,
                packageUnit: newMedicine.packageUnit || 'Box',
                conversionFactor: parseInt(newMedicine.conversionFactor || 10),
                isActive: true,
              },
            });
            medicineId = createdMed.id;
          }
        }

        if (!medicineId) {
          throw new Error('Valid medicine selection or new medicine creation is required for each line.');
        }

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

        const sellingRateDec = sellingRate !== undefined && sellingRate !== null && sellingRate !== ''
          ? new Decimal(sellingRate)
          : mrpDec;

        if (sellingRateDec.isNegative()) {
          throw new Error('Selling rate cannot be negative.');
        }

        if (sellingRateDec.greaterThan(mrpDec)) {
          throw new Error(`Selling rate cannot exceed printed MRP (MRP: ${mrpDec.toNumber()}, Selling Rate: ${sellingRateDec.toNumber()}).`);
        }

        const gstDec = new Decimal(gstRate !== undefined ? gstRate : 5.0);

        // Gross line value = Quantity * Purchase Rate
        const grossLine = rateDec.times(qty);

        // Line discount calculation (Max 20%, reject negative)
        let lineDisc = new Decimal(0);
        const discPct = new Decimal(discountPercent || 0);
        if (discPct.isNegative() || discPct.greaterThan(20)) {
          throw new Error('Purchase discount percentage cannot exceed 20% policy limit and cannot be negative.');
        }
        if (discPct.greaterThan(0)) {
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

        if (line.conversionFactor !== undefined && line.conversionFactor !== null && line.conversionFactor !== '') {
          const parsedFactor = parseInt(line.conversionFactor);
          if (isNaN(parsedFactor) || parsedFactor <= 0) {
            throw new Error(`Conversion factor (Units/Pk) for batch ${batchNumber} must be an integer greater than zero.`);
          }
        }

        const factor = (line.conversionFactor && parseInt(line.conversionFactor) > 0)
          ? parseInt(line.conversionFactor)
          : 1;
        const lineUnit = line.unit || 'Strip';
        const totalBatchQty = (qty + freeQty) * factor;

        // Base unit pricing normalization for inventory batch
        const basePurchaseRate = rateDec.dividedBy(factor).toDecimalPlaces(4).toNumber();
        const baseSellingPrice = sellingRateDec.dividedBy(factor).toDecimalPlaces(4).toNumber();
        const baseMrp = mrpDec.dividedBy(factor).toDecimalPlaces(4).toNumber();

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
              purchaseRate: basePurchaseRate,
              sellingPrice: baseSellingPrice,
              mrp: baseMrp,
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
              purchaseRate: basePurchaseRate,
              sellingPrice: baseSellingPrice,
              mrp: baseMrp,
              supplierId: resolvedSupplierId,
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
            quantityDelta: totalBatchQty,
            unitPrice: basePurchaseRate,
            referenceDocType: 'PURCHASE_INVOICE',
            referenceDocId: invoiceNumber,
            reason: `Supplier purchase invoice ${supplierInvoiceNumber.trim()}${freeQty > 0 ? ` (+${freeQty} free scheme)` : ''}`,
            performedByUserId: req.user!.id,
          },
        });

        processedLines.push({
          medicineId,
          batchNumber: batchNumber.trim(),
          expiryDate: parsedExpiry,
          quantity: qty,
          freeQuantity: freeQty,
          unit: lineUnit,
          conversionFactor: factor,
          baseQuantity: totalBatchQty,
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
        paidDec = paymentMode === 'CREDIT' ? new Decimal(0) : grandTotalDec;
      }

      let outstandingDec = grandTotalDec.minus(paidDec);
      if (outstandingDec.isNegative()) outstandingDec = new Decimal(0);

      const purchaseInvoice = await tx.purchaseInvoice.create({
        data: {
          invoiceNumber,
          supplierInvoiceNumber: supplierInvoiceNumber.trim(),
          supplierId: resolvedSupplierId,
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
    }, { maxWait: 10000, timeout: 25000 });

    await logAuditEvent({
      userId: req.user.id,
      branchId: targetBranchId,
      action: 'PURCHASE_RECEIVE',
      targetEntity: 'PURCHASE_INVOICE',
      entityId: result.id,
      details: {
        invoiceNumber: result.invoiceNumber,
        supplierInvoiceNumber: result.supplierInvoiceNumber,
        grandTotal: result.grandTotal,
        paymentMode: result.paymentMode,
      },
      req,
    });

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Purchase error:', error);
    return res.status(400).json({ message: error.message || 'Failed to record purchase' });
  }
};

export const updatePurchase = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot modify purchases' });
    }

    const id = req.params.id as string;
    const {
      supplierId,
      supplierInvoiceNumber,
      invoiceDate,
      lines,
      invoiceDiscountPercent = 0,
      invoiceDiscountAmount = 0,
      additionalCharges = 0,
      paymentMode = 'CASH',
      paidAmount,
      notes,
    } = req.body;

    const existingInvoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
      include: { lines: true, supplier: true, branch: true },
    });

    if (!existingInvoice) {
      return res.status(404).json({ message: 'Purchase invoice not found' });
    }

    if (req.user.role !== 'SUPER_ADMIN' && existingInvoice.branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied to invoice from another branch' });
    }

    if (existingInvoice.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Cannot edit a cancelled purchase invoice.' });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: 'At least one line item is required' });
    }

    const targetBranchId = existingInvoice.branchId;

    // Check duplicate supplier invoice if number changed
    if (supplierInvoiceNumber && supplierInvoiceNumber.trim() !== existingInvoice.supplierInvoiceNumber) {
      const duplicate = await prisma.purchaseInvoice.findFirst({
        where: {
          id: { not: id },
          supplierId: supplierId || existingInvoice.supplierId,
          supplierInvoiceNumber: supplierInvoiceNumber.trim(),
          branchId: targetBranchId,
          status: { not: 'CANCELLED' },
        },
      });
      if (duplicate) {
        return res.status(409).json({
          message: `Another invoice '${supplierInvoiceNumber}' already exists for this supplier in this branch.`,
        });
      }
    }

    // Atomic Stock Reconciliation & Financial Recalculation
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // Build a map of old lines by batchNumber
      const oldBatchMap = new Map<string, { qty: number; freeQty: number; total: number; line: any }>();
      for (const oldLine of existingInvoice.lines) {
        const key = `${oldLine.medicineId}_${oldLine.batchNumber.trim()}`;
        const total = (oldLine.baseQuantity && oldLine.baseQuantity > 0)
          ? oldLine.baseQuantity
          : ((oldLine.quantity + oldLine.freeQuantity) * (oldLine.conversionFactor || 1));
        oldBatchMap.set(key, { qty: oldLine.quantity, freeQty: oldLine.freeQuantity, total, line: oldLine });
      }

      // Build map of new lines
      const newBatchMap = new Map<string, { qty: number; freeQty: number; total: number }>();
      for (const newLine of lines) {
        const key = `${newLine.medicineId}_${newLine.batchNumber.trim()}`;
        const qty = parseInt(newLine.quantity);
        const freeQty = parseInt(newLine.freeQuantity || 0);
        const factor = (newLine.conversionFactor && parseInt(newLine.conversionFactor) > 0)
          ? parseInt(newLine.conversionFactor)
          : 1;
        newBatchMap.set(key, { qty, freeQty, total: (qty + freeQty) * factor });
      }

      // 1. Reconcile batches removed completely
      for (const [key, oldData] of oldBatchMap.entries()) {
        if (!newBatchMap.has(key)) {
          // Entire line was removed: deduct old units from batch
          const batch = await tx.stockBatch.findFirst({
            where: {
              branchId: targetBranchId,
              medicineId: oldData.line.medicineId,
              batchNumber: oldData.line.batchNumber.trim(),
            },
          });

          if (batch) {
            if (batch.availableQuantity < oldData.total) {
              throw new Error(
                `Cannot remove batch ${oldData.line.batchNumber} from invoice: ${oldData.total} units were originally added, but only ${batch.availableQuantity} units remain in inventory (remaining units have been sold).`
              );
            }
            const updatedAvailable = batch.availableQuantity - oldData.total;
            const updatedReceived = Math.max(0, batch.quantityReceived - oldData.total);
            await tx.stockBatch.update({
              where: { id: batch.id },
              data: {
                availableQuantity: updatedAvailable,
                quantityReceived: updatedReceived,
                status: updatedAvailable === 0 ? 'DEPLETED' : batch.status,
              },
            });

            await tx.stockMovement.create({
              data: {
                branchId: targetBranchId,
                medicineId: oldData.line.medicineId,
                batchId: batch.id,
                movementType: 'STOCK_CORRECTION',
                quantityDelta: -oldData.total,
                unitPrice: oldData.line.purchaseRate,
                referenceDocType: 'PURCHASE_INVOICE',
                referenceDocId: existingInvoice.invoiceNumber,
                reason: `Line removed during purchase invoice edit (${existingInvoice.invoiceNumber})`,
                performedByUserId: req.user!.id,
              },
            });
          }
        }
      }

      // 2. Reconcile batches updated or newly added
      let subtotalDec = new Decimal(0);
      let taxTotalDec = new Decimal(0);
      let lineDiscountsTotalDec = new Decimal(0);
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
          throw new Error('Quantity must be greater than zero.');
        }

        const freeQty = parseInt(freeQuantity || 0);
        if (isNaN(freeQty) || freeQty < 0) {
          throw new Error('Free quantity cannot be negative.');
        }

        const rateDec = new Decimal(purchaseRate);
        const mrpDec = new Decimal(mrp);
        const sellingRateDec = sellingRate !== undefined && sellingRate !== null && sellingRate !== ''
          ? new Decimal(sellingRate)
          : mrpDec;

        if (sellingRateDec.isNegative()) {
          throw new Error('Selling rate cannot be negative.');
        }

        if (sellingRateDec.greaterThan(mrpDec)) {
          throw new Error(`Selling rate cannot exceed printed MRP (MRP: ${mrpDec.toNumber()}, Selling Rate: ${sellingRateDec.toNumber()}).`);
        }

        const gstDec = new Decimal(gstRate !== undefined ? gstRate : 5.0);

        const grossLine = rateDec.times(qty);
        let lineDisc = new Decimal(0);
        const discPct = new Decimal(discountPercent || 0);
        if (discPct.isNegative() || discPct.greaterThan(20)) {
          throw new Error('Purchase discount percentage cannot exceed 20% policy limit and cannot be negative.');
        }
        if (discPct.greaterThan(0)) {
          lineDisc = grossLine.times(discPct).dividedBy(100);
        } else if (discountAmount && new Decimal(discountAmount).greaterThan(0)) {
          lineDisc = new Decimal(discountAmount);
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

        if (line.conversionFactor !== undefined && line.conversionFactor !== null && line.conversionFactor !== '') {
          const parsedFactor = parseInt(line.conversionFactor);
          if (isNaN(parsedFactor) || parsedFactor <= 0) {
            throw new Error(`Conversion factor (Units/Pk) for batch ${batchNumber} must be an integer greater than zero.`);
          }
        }

        const factor = (line.conversionFactor && parseInt(line.conversionFactor) > 0)
          ? parseInt(line.conversionFactor)
          : 1;
        const lineUnit = line.unit || 'Strip';
        const totalNewQty = (qty + freeQty) * factor;

        // Base rates
        const basePurchaseRate = rateDec.dividedBy(factor).toDecimalPlaces(4).toNumber();
        const baseSellingPrice = sellingRateDec.dividedBy(factor).toDecimalPlaces(4).toNumber();
        const baseMrp = mrpDec.dividedBy(factor).toDecimalPlaces(4).toNumber();

        const key = `${medicineId}_${batchNumber.trim()}`;
        const oldData = oldBatchMap.get(key);
        const oldTotal = oldData ? oldData.total : 0;
        const delta = totalNewQty - oldTotal;

        let batch = await tx.stockBatch.findFirst({
          where: {
            branchId: targetBranchId,
            medicineId,
            batchNumber: batchNumber.trim(),
          },
        });

        if (batch) {
          if (delta < 0) {
            const reduction = Math.abs(delta);
            if (batch.availableQuantity < reduction) {
              throw new Error(
                `Cannot reduce batch ${batchNumber} by ${reduction} units: only ${batch.availableQuantity} units remain in stock (units have been sold at retail counter).`
              );
            }
          }

          const newAvailable = batch.availableQuantity + delta;
          const newReceived = batch.quantityReceived + delta;

          batch = await tx.stockBatch.update({
            where: { id: batch.id },
            data: {
              availableQuantity: newAvailable,
              quantityReceived: Math.max(0, newReceived),
              purchaseRate: basePurchaseRate,
              sellingPrice: baseSellingPrice,
              mrp: baseMrp,
              status: newAvailable === 0 ? 'DEPLETED' : 'ACTIVE',
            },
          });
        } else {
          // Brand new batch added in edit
          batch = await tx.stockBatch.create({
            data: {
              branchId: targetBranchId,
              medicineId,
              batchNumber: batchNumber.trim(),
              expiryDate: parsedExpiry,
              quantityReceived: totalNewQty,
              availableQuantity: totalNewQty,
              purchaseRate: basePurchaseRate,
              sellingPrice: baseSellingPrice,
              mrp: baseMrp,
              supplierId: supplierId || existingInvoice.supplierId,
              purchaseInvoiceRef: (supplierInvoiceNumber || existingInvoice.supplierInvoiceNumber).trim(),
              status: 'ACTIVE',
            },
          });
        }

        // Record stock movement for delta change if non-zero
        if (delta !== 0) {
          await tx.stockMovement.create({
            data: {
              branchId: targetBranchId,
              medicineId,
              batchId: batch.id,
              movementType: delta > 0 ? 'PURCHASE_RECEIPT' : 'STOCK_CORRECTION',
              quantityDelta: delta,
              unitPrice: basePurchaseRate,
              referenceDocType: 'PURCHASE_INVOICE',
              referenceDocId: existingInvoice.invoiceNumber,
              reason: `Invoice reconciliation (${existingInvoice.invoiceNumber}): ${delta > 0 ? `+${delta} units added` : `${delta} units adjusted`}`,
              performedByUserId: req.user!.id,
            },
          });
        }

        processedLines.push({
          medicineId,
          batchNumber: batchNumber.trim(),
          expiryDate: parsedExpiry,
          quantity: qty,
          freeQuantity: freeQty,
          unit: lineUnit,
          conversionFactor: factor,
          baseQuantity: totalNewQty,
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

      // Invoice-level discount
      let invDiscDec = new Decimal(0);
      const invDiscPct = new Decimal(invoiceDiscountPercent || 0);
      if (invDiscPct.greaterThan(0)) {
        invDiscDec = subtotalDec.times(invDiscPct).dividedBy(100);
      } else if (invoiceDiscountAmount && new Decimal(invoiceDiscountAmount).greaterThan(0)) {
        invDiscDec = new Decimal(invoiceDiscountAmount);
      }

      const totalDiscountDec = lineDiscountsTotalDec.plus(invDiscDec);
      const chargesDec = new Decimal(additionalCharges || 0);
      const grandTotalDec = subtotalDec.minus(invDiscDec).plus(taxTotalDec).plus(chargesDec);

      let paidDec = new Decimal(0);
      if (paidAmount !== undefined && paidAmount !== null && paidAmount !== '') {
        paidDec = new Decimal(paidAmount);
      } else {
        paidDec = paymentMode === 'CREDIT' ? new Decimal(0) : grandTotalDec;
      }

      let outstandingDec = grandTotalDec.minus(paidDec);
      if (outstandingDec.isNegative()) outstandingDec = new Decimal(0);

      // Delete existing lines and re-create atomically
      await tx.purchaseInvoiceLine.deleteMany({
        where: { purchaseInvoiceId: id },
      });

      const updated = await tx.purchaseInvoice.update({
        where: { id },
        data: {
          supplierId: supplierId || existingInvoice.supplierId,
          supplierInvoiceNumber: supplierInvoiceNumber ? supplierInvoiceNumber.trim() : existingInvoice.supplierInvoiceNumber,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : existingInvoice.invoiceDate,
          subtotal: subtotalDec.toDecimalPlaces(2).toNumber(),
          discountTotal: totalDiscountDec.toDecimalPlaces(2).toNumber(),
          taxTotal: taxTotalDec.toDecimalPlaces(2).toNumber(),
          additionalCharges: chargesDec.toDecimalPlaces(2).toNumber(),
          grandTotal: grandTotalDec.toDecimalPlaces(2).toNumber(),
          paymentMode: paymentMode || existingInvoice.paymentMode,
          paidAmount: paidDec.toDecimalPlaces(2).toNumber(),
          outstandingAmount: outstandingDec.toDecimalPlaces(2).toNumber(),
          notes: notes !== undefined ? (notes ? notes.trim() : null) : existingInvoice.notes,
          lines: {
            create: processedLines,
          },
        },
        include: {
          lines: { include: { medicine: true } },
          supplier: true,
          branch: true,
        },
      });

      return updated;
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: targetBranchId,
      action: 'PURCHASE_UPDATE',
      targetEntity: 'PURCHASE_INVOICE',
      entityId: updatedInvoice.id,
      details: {
        invoiceNumber: updatedInvoice.invoiceNumber,
        grandTotal: updatedInvoice.grandTotal,
        paymentMode: updatedInvoice.paymentMode,
      },
      req,
    });

    return res.json(updatedInvoice);
  } catch (error: any) {
    console.error('Update purchase error:', error);
    return res.status(400).json({ message: error.message || 'Failed to update purchase invoice' });
  }
};

export const cancelPurchase = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'BRANCH_ADMIN') {
      return res.status(403).json({ message: 'Only administrators can cancel purchase invoices' });
    }

    const id = req.params.id as string;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Cancellation reason is strictly required for financial compliance.' });
    }

    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id },
      include: { lines: true, supplier: true, branch: true },
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Purchase invoice not found' });
    }

    if (req.user.role !== 'SUPER_ADMIN' && invoice.branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied: Invoice belongs to another branch' });
    }

    if (invoice.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Purchase invoice has already been cancelled.' });
    }

    // Atomic transaction: verify stock availability, deduct received quantities, mark CANCELLED
    await prisma.$transaction(async (tx) => {
      // First pass: Verify all batches have enough available inventory
      for (const line of invoice.lines) {
        const batch = await tx.stockBatch.findFirst({
          where: {
            branchId: invoice.branchId,
            medicineId: line.medicineId,
            batchNumber: line.batchNumber.trim(),
          },
        });

        const totalLineQty = line.quantity + line.freeQuantity;
        if (batch) {
          if (batch.availableQuantity < totalLineQty) {
            throw new Error(
              `Cannot cancel invoice ${invoice.invoiceNumber}: ${totalLineQty} units of batch ${line.batchNumber} were received, but only ${batch.availableQuantity} units remain in stock (units may have already been sold or returned).`
            );
          }
        }
      }

      // Second pass: Deduct stock and record movement
      for (const line of invoice.lines) {
        const batch = await tx.stockBatch.findFirst({
          where: {
            branchId: invoice.branchId,
            medicineId: line.medicineId,
            batchNumber: line.batchNumber.trim(),
          },
        });

        const totalLineQty = line.quantity + line.freeQuantity;
        if (batch) {
          const newAvailable = batch.availableQuantity - totalLineQty;
          const newReceived = Math.max(0, batch.quantityReceived - totalLineQty);

          await tx.stockBatch.update({
            where: { id: batch.id },
            data: {
              availableQuantity: newAvailable,
              quantityReceived: newReceived,
              status: newAvailable === 0 ? 'DEPLETED' : batch.status,
            },
          });

          await tx.stockMovement.create({
            data: {
              branchId: invoice.branchId,
              medicineId: line.medicineId,
              batchId: batch.id,
              movementType: 'STOCK_CORRECTION',
              quantityDelta: -totalLineQty,
              unitPrice: line.purchaseRate,
              referenceDocType: 'PURCHASE_INVOICE',
              referenceDocId: invoice.invoiceNumber,
              reason: `Purchase invoice cancelled: ${reason.trim()}`,
              performedByUserId: req.user!.id,
            },
          });
        }
      }

      // Mark invoice CANCELLED
      await tx.purchaseInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'CANCELLED',
          notes: invoice.notes ? `${invoice.notes} | CANCELLED: ${reason.trim()}` : `CANCELLED: ${reason.trim()}`,
        },
      });
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: invoice.branchId,
      action: 'PURCHASE_CANCEL',
      targetEntity: 'PURCHASE_INVOICE',
      entityId: invoice.id,
      details: { invoiceNumber: invoice.invoiceNumber, reason: reason.trim() },
      req,
    });

    return res.json({
      message: `Purchase invoice ${invoice.invoiceNumber} cancelled successfully and inwards inventory reconciled.`,
    });
  } catch (error: any) {
    console.error('Cancel purchase error:', error);
    return res.status(400).json({ message: error.message || 'Failed to cancel purchase invoice' });
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
        const gstDec = new Decimal(gstRate !== undefined ? gstRate : 5.0);

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

/**
 * Preview Purchase Import from Excel / CSV (Phase 3 & 4)
 */
export const previewPurchaseImport = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot import purchases' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an Excel (.xlsx) or CSV (.csv) file' });
    }

    const { branchId, supplierId } = req.body;
    let targetBranchId: string | null = null;

    if (req.user.role === 'SUPER_ADMIN') {
      targetBranchId = (branchId && typeof branchId === 'string' && branchId.trim()) ? branchId.trim() : (req.user.branchId || null);
    } else {
      if (branchId && typeof branchId === 'string' && branchId.trim() && branchId.trim() !== req.user.branchId) {
        return res.status(403).json({ message: 'You are not authorized to import purchases into another branch' });
      }
      targetBranchId = req.user.branchId || null;
    }

    if (!targetBranchId) {
      return res.status(400).json({ message: 'Target branch is required for purchase import' });
    }

    const targetBranch = await prisma.branch.findUnique({
      where: { id: targetBranchId },
    });

    if (!targetBranch) {
      return res.status(404).json({ message: 'Target branch not found' });
    }

    if (!targetBranch.isActive) {
      return res.status(400).json({ message: 'Target branch is inactive' });
    }

    // Read workbook with xlsx (handles xlsx, xls, and csv buffers)
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return res.status(400).json({ message: 'Uploaded file contains no sheets' });
    }

    const rawRows = xlsx.utils.sheet_to_json<any>(workbook.Sheets[firstSheetName], { defval: '' });
    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ message: 'Uploaded file contains zero data rows' });
    }

    const rawHeaders = Object.keys(rawRows[0] || {});
    const { headerMap, duplicateHeaders, conflictingColumns } = buildHeaderMapping(rawHeaders, 'PURCHASE_INVOICE');

    if (duplicateHeaders.length > 0) {
      return res.status(400).json({
        message: `Duplicate column headers detected: ${duplicateHeaders.join('; ')}`,
      });
    }

    if (conflictingColumns.length > 0) {
      return res.status(400).json({
        message: `Conflicting column mappings detected: ${conflictingColumns.join('; ')}`,
      });
    }

    // Load active catalogue products & existing batches for target branch
    const [catalogue, branchBatches] = await Promise.all([
      prisma.medicineProduct.findMany({
        where: { isActive: true },
        select: {
          id: true,
          internalCode: true,
          brandName: true,
          genericName: true,
          strength: true,
          dosageForm: true,
          manufacturer: true,
          mrp: true,
          hsnCode: true,
          gstRate: true,
          baseUnit: true,
          packageUnit: true,
          conversionFactor: true,
          unitConfig: true,
        },
      }),
      prisma.stockBatch.findMany({
        where: { branchId: targetBranchId },
        select: { id: true, medicineId: true, batchNumber: true, availableQuantity: true },
      }),
    ]);

    let validRowsCount = 0;
    let errorRowsCount = 0;
    let warningRowsCount = 0;
    let newProductsCount = 0;
    let existingProductsCount = 0;
    let newBatchesCount = 0;
    let existingBatchesCount = 0;
    let totalQuantity = 0;

    let totalGrossDec = new Decimal(0);
    let totalDiscountDec = new Decimal(0);
    let totalTaxableDec = new Decimal(0);
    let totalTaxDec = new Decimal(0);
    let totalGrandDec = new Decimal(0);

    const validatedRows: any[] = [];
    const seenBatchKeys = new Set<string>();

    rawRows.forEach((row, idx) => {
      const rowIndex = idx + 2; // 1-based, row 1 is header
      const errors: string[] = [];
      const warnings: string[] = [];
      const mapped = extractMappedRow(row, headerMap);

      const rawProductName = (mapped.productName || '').toString().trim();
      const rawBrandName = (mapped.brandName || '').toString().trim();

      const {
        effectiveBrandName,
        effectiveProductName,
        warning: nameWarning,
        error: nameError,
      } = resolveProductAndBrandNames(rawProductName, rawBrandName);

      if (nameError) {
        errors.push(nameError);
      }
      if (nameWarning) {
        warnings.push(nameWarning);
      }

      const brandName = effectiveBrandName;
      const productName = effectiveProductName;
      const genericName = (mapped.genericName || '').toString().trim();
      const strength = (mapped.strength || '').toString().trim();
      const dosageForm = (mapped.dosageForm || 'Tablet').toString().trim();
      const manufacturer = (mapped.manufacturer || '').toString().trim();
      const hsnCode = (mapped.hsnCode || '').toString().trim() || null;
      const batchNumber = (mapped.batchNumber || '').toString().trim();
      const expiryRaw = mapped.expiryDate;
      const purchaseUnit = (mapped.purchaseUnit || 'Strip').toString().trim();
      const sellingUnit = (mapped.sellingUnit || 'Tablet').toString().trim();
      const quantity = parseCleanInt(mapped.quantity, 0);
      const freeQuantity = parseCleanInt(mapped.freeQuantity, 0);
      const unitsPerPack = parseCleanInt(mapped.unitsPerPack, 10);
      const purchaseRate = parseCleanNumber(mapped.purchaseRate, 0);
      const mrp = parseCleanNumber(mapped.mrp, 0);
      const sellingRate = parseCleanNumber(mapped.sellingRate, mrp);
      const gstRate = parseCleanNumber(mapped.gstRate, 5.0);
      const discountPercent = parseCleanNumber(mapped.discountPercent, 0);

      // Validation
      if (!brandName && !productName) {
        errors.push('Product / Brand Name is required');
      }
      if (!batchNumber) {
        errors.push('Batch Number is required');
      }
      if (isNaN(quantity) || quantity <= 0) {
        errors.push('Quantity is required and must be greater than zero');
      }
      if (isNaN(freeQuantity) || freeQuantity < 0) {
        errors.push('Free quantity cannot be negative');
      }
      if (isNaN(purchaseRate) || purchaseRate < 0) {
        errors.push('Purchase rate is required and cannot be negative');
      }
      if (isNaN(mrp) || mrp < purchaseRate) {
        errors.push('MRP must be greater than or equal to purchase rate');
      }
      if (!isNaN(sellingRate) && sellingRate > mrp) {
        errors.push('Selling rate cannot exceed printed MRP');
      }
      if (isNaN(discountPercent) || discountPercent < 0 || discountPercent > 20) {
        errors.push('Discount % must be between 0% and 20%');
      }
      if (isNaN(gstRate) || gstRate < 0) {
        errors.push('Valid GST Rate is required');
      }

      // Safe expiry parsing
      const { date: expDate, isoString: expDateIso, error: expError } = parseExpiryDate(expiryRaw);
      if (expError) {
        errors.push(expError);
      } else if (expDate && expDate <= new Date()) {
        errors.push('Batch is already expired. Expired stock cannot be accepted into inventory.');
      }

      // Phase 6 Product Matching
      const matchResult = matchProduct(
        {
          brandName: effectiveBrandName,
          productName: effectiveProductName,
          genericName,
          strength,
          dosageForm,
          manufacturer,
        },
        catalogue as CandidateProduct[]
      );

      const matchedProd = matchResult.matchedProduct;
      const isNewProd = matchResult.isNewProduct;

      if (isNewProd) {
        newProductsCount++;
        warnings.push('New medicine: will be registered in catalogue upon confirmation');
      } else {
        existingProductsCount++;
      }

      // Check batch uniqueness within file & in branch
      const batchKey = `${(matchedProd?.id || brandName).toLowerCase()}_${batchNumber.toLowerCase()}`;
      if (seenBatchKeys.has(batchKey)) {
        warnings.push('Duplicate batch entry for same medicine in this spreadsheet');
      } else {
        seenBatchKeys.add(batchKey);
      }

      const existingBatch = branchBatches.find(
        (b) =>
          b.batchNumber.toLowerCase() === batchNumber.toLowerCase() &&
          (!matchedProd || b.medicineId === matchedProd.id)
      );

      const isNewBatch = !existingBatch;
      if (isNewBatch) {
        newBatchesCount++;
      } else {
        existingBatchesCount++;
        warnings.push(`Existing batch: will add stock to current inventory (${existingBatch.availableQuantity} units)`);
      }

      // Unit conversion
      const unitConfig = buildProductUnitConfig(
        matchedProd?.baseUnit || sellingUnit,
        matchedProd?.packageUnit || purchaseUnit,
        matchedProd?.conversionFactor || unitsPerPack,
        dosageForm
      );

      const conversionFactor = unitsPerPack > 0 ? unitsPerPack : (unitConfig.conversionFactor || 1);
      const totalUnits = (quantity + freeQuantity) * conversionFactor;

      // Derived financial amounts
      const lineGrossDec = new Decimal(isNaN(quantity) ? 0 : quantity).times(isNaN(purchaseRate) ? 0 : purchaseRate);
      const lineDiscDec = lineGrossDec.times(isNaN(discountPercent) ? 0 : discountPercent).dividedBy(100);
      const lineTaxableDec = lineGrossDec.minus(lineDiscDec);
      const lineTaxDec = lineTaxableDec.times(isNaN(gstRate) ? 0 : gstRate).dividedBy(100);
      const lineTotalDec = lineTaxableDec.plus(lineTaxDec);

      if (errors.length === 0) {
        validRowsCount++;
        totalQuantity += (quantity + freeQuantity);
        totalGrossDec = totalGrossDec.plus(lineGrossDec);
        totalDiscountDec = totalDiscountDec.plus(lineDiscDec);
        totalTaxableDec = totalTaxableDec.plus(lineTaxableDec);
        totalTaxDec = totalTaxDec.plus(lineTaxDec);
        totalGrandDec = totalGrandDec.plus(lineTotalDec);
      } else {
        errorRowsCount++;
      }

      if (warnings.length > 0) warningRowsCount++;

      validatedRows.push({
        rowIndex,
        rowNumber: rowIndex,
        valid: errors.length === 0,
        medicineId: matchedProd?.id || (isNewProd ? 'NEW' : null),
        matchedProductId: matchedProd?.id || null,
        productName: effectiveProductName,
        brandName: effectiveBrandName,
        genericName: genericName || matchedProd?.genericName || '',
        strength: strength || matchedProd?.strength || '',
        dosageForm: dosageForm || matchedProd?.dosageForm || 'Tablet',
        manufacturer: manufacturer || matchedProd?.manufacturer || 'Standard Pharma',
        hsnCode: hsnCode || matchedProd?.hsnCode || '30049099',
        batchNumber,
        expiryDate: expDateIso || (expiryRaw ? String(expiryRaw) : ''),
        unit: purchaseUnit,
        purchaseUnit,
        sellingUnit: matchedProd?.baseUnit || sellingUnit,
        quantity,
        freeQuantity,
        unitsPerPack: conversionFactor,
        conversionFactor,
        totalUnits,
        purchaseRate,
        sellingRate,
        mrp,
        gstRate,
        discountPercent,
        discountAmount: lineDiscDec.toDecimalPlaces(2).toNumber(),
        taxableAmount: lineTaxableDec.toDecimalPlaces(2).toNumber(),
        taxAmount: lineTaxDec.toDecimalPlaces(2).toNumber(),
        lineTotal: lineTotalDec.toDecimalPlaces(2).toNumber(),
        effectiveBaseUnitCost: totalUnits > 0 ? lineTaxableDec.dividedBy(totalUnits).toDecimalPlaces(4).toNumber() : (conversionFactor > 0 ? new Decimal(purchaseRate).dividedBy(conversionFactor).toDecimalPlaces(4).toNumber() : purchaseRate),
        basePurchaseRate: conversionFactor > 0 ? new Decimal(purchaseRate).dividedBy(conversionFactor).toDecimalPlaces(4).toNumber() : purchaseRate,
        baseMrp: conversionFactor > 0 ? new Decimal(mrp).dividedBy(conversionFactor).toDecimalPlaces(4).toNumber() : mrp,
        baseSellingRate: conversionFactor > 0 ? new Decimal(sellingRate).dividedBy(conversionFactor).toDecimalPlaces(4).toNumber() : sellingRate,
        status: errors.length > 0 ? 'ERROR' : 'READY',
        errors,
        warnings,
        isNewProduct: isNewProd,
        isNewBatch,
        potentialCandidates: matchResult.potentialCandidates || [],
        newMedicine: isNewProd
          ? {
              brandName: effectiveBrandName,
              genericName: genericName || 'Generic Formulation',
              strength: strength || 'Standard',
              dosageForm: dosageForm || 'Tablet',
              manufacturer: manufacturer || 'Standard Pharma',
              hsnCode: hsnCode || '30049099',
              gstRate,
              mrp,
              defaultPurchaseRate: purchaseRate,
              defaultSellingRate: sellingRate,
              baseUnit: sellingUnit,
              packageUnit: purchaseUnit,
              conversionFactor,
              storageNotes:
                rawProductName && rawBrandName && rawProductName !== rawBrandName
                  ? `Imported Product Name: ${rawProductName} | Brand: ${rawBrandName}`
                  : undefined,
            }
          : undefined,
      });
    });

    const metrics = {
      totalRows: rawRows.length,
      validRows: validRowsCount,
      errorRows: errorRowsCount,
      warningRows: warningRowsCount,
      newProducts: newProductsCount,
      newProductsCount,
      existingProducts: existingProductsCount,
      existingProductsCount,
      newBatches: newBatchesCount,
      newBatchesCount,
      existingBatches: existingBatchesCount,
      existingBatchesCount,
      totalQuantity,
      estimatedGross: totalGrossDec.toDecimalPlaces(2).toNumber(),
      estimatedDiscount: totalDiscountDec.toDecimalPlaces(2).toNumber(),
      estimatedTaxable: totalTaxableDec.toDecimalPlaces(2).toNumber(),
      estimatedTax: totalTaxDec.toDecimalPlaces(2).toNumber(),
      estimatedGrandTotal: totalGrandDec.toDecimalPlaces(2).toNumber(),
    };

    return res.json({
      targetBranchId: targetBranch.id,
      branchName: targetBranch.name,
      branchCode: targetBranch.code,
      fileName: req.file.originalname,
      totalRows: rawRows.length,
      validRows: validRowsCount,
      errorRows: errorRowsCount,
      warningRows: warningRowsCount,
      metrics,
      summary: metrics,
      items: validatedRows,
      rows: validatedRows,
    });
  } catch (error: any) {
    console.error('Purchase import preview error:', error);
    return res.status(500).json({ message: error.message || 'Failed to process purchase import' });
  }
};

/**
 * Download Excel / CSV Template for Purchase Inwards (Phase 4.1 & 7.2)
 */
export const downloadPurchaseTemplate = async (req: Request, res: Response) => {
  try {
    const { format = 'csv' } = req.query;

    const templateRows = [
      {
        'Product Name': 'Dolo 650',
        'Brand Name': 'Dolo 650',
        'Generic Name': 'Paracetamol',
        'Strength': '650mg',
        'Dosage Form': 'Tablet',
        'Manufacturer': 'Micro Labs Ltd',
        'HSN Code': '30049099',
        'Batch Number': 'DL-2026-X1',
        'Expiry Date': '2028-12-31',
        'Purchase Unit': 'Strip',
        'Quantity': 50,
        'Free Quantity': 5,
        'Units Per Pack': 15,
        'Purchase Rate': 24.50,
        'MRP': 35.00,
        'GST Rate': 12,
        'Discount': 10,
        'Selling Unit': 'Tablet',
      },
      {
        'Product Name': 'Azithral 500',
        'Brand Name': 'Azithral 500',
        'Generic Name': 'Azithromycin',
        'Strength': '500mg',
        'Dosage Form': 'Tablet',
        'Manufacturer': 'Alembic Pharmaceuticals',
        'HSN Code': '30049099',
        'Batch Number': 'AZ-2026-B9',
        'Expiry Date': '2028-06-30',
        'Purchase Unit': 'Strip',
        'Quantity': 30,
        'Free Quantity': 0,
        'Units Per Pack': 5,
        'Purchase Rate': 85.00,
        'MRP': 125.00,
        'GST Rate': 12,
        'Discount': 5,
        'Selling Unit': 'Tablet',
      },
      {
        'Product Name': 'Benadryl Cough Syrup',
        'Brand Name': 'Benadryl Cough Formula',
        'Generic Name': 'Diphenhydramine + Ammonium Chloride',
        'Strength': '100ml',
        'Dosage Form': 'Syrup',
        'Manufacturer': 'Johnson & Johnson',
        'HSN Code': '30049099',
        'Batch Number': 'BN-2026-S3',
        'Expiry Date': '2027-11-30',
        'Purchase Unit': 'Bottle',
        'Quantity': 20,
        'Free Quantity': 2,
        'Units Per Pack': 1,
        'Purchase Rate': 95.00,
        'MRP': 140.00,
        'GST Rate': 12,
        'Discount': 0,
        'Selling Unit': 'Bottle',
      },
    ];

    const worksheet = xlsx.utils.json_to_sheet(templateRows);

    if (format === 'xlsx') {
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Purchase_Invoice_Template');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="confidos_purchase_invoice_template.xlsx"');
      return res.send(buffer);
    } else {
      const csv = xlsx.utils.sheet_to_csv(worksheet);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="confidos_purchase_invoice_template.csv"');
      return res.send(csv);
    }
  } catch (error) {
    return res.status(500).json({ message: 'Failed to generate template' });
  }
};

/**
 * Super Admin Bulk Deletion / Cancellation for Purchase Invoices (Phase 10)
 */
export const bulkDeletePurchases = async (req: Request, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Forbidden: Super Admin only' });
    }

    const rawIds = req.body.ids || req.body.invoiceIds;
    if (!rawIds || !Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ message: 'No invoice IDs provided' });
    }

    const uniqueIds = Array.from(
      new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    );

    if (uniqueIds.length === 0) {
      return res.status(400).json({ message: 'No valid invoice IDs provided' });
    }

    const outcome = await prisma.$transaction(async (tx) => {
      const results = {
        deleted: [] as string[],
        failed: [] as { id: string; reason: string }[],
      };

      for (const id of uniqueIds) {
        const invoice = await tx.purchaseInvoice.findUnique({
          where: { id },
          include: { returns: true },
        });

        if (!invoice) {
          results.failed.push({ id, reason: 'Invoice not found' });
          continue;
        }

        if (invoice.returns && invoice.returns.length > 0) {
          results.failed.push({
            id,
            reason: `Invoice ${invoice.invoiceNumber} has associated purchase returns and cannot be deleted`,
          });
          continue;
        }

        if (invoice.status === 'RECEIVED') {
          await tx.purchaseInvoice.update({
            where: { id },
            data: { status: 'CANCELLED' },
          });
          results.deleted.push(invoice.invoiceNumber);
        } else {
          await tx.purchaseInvoice.delete({ where: { id } });
          results.deleted.push(invoice.invoiceNumber);
        }
      }

      return results;
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: null,
      action: 'PURCHASE_BULK_DELETE',
      targetEntity: 'PURCHASE_INVOICE',
      details: {
        totalRequested: uniqueIds.length,
        processedCount: outcome.deleted.length,
        failedCount: outcome.failed.length,
      },
      req,
    });

    return res.json({
      message: `Processed ${outcome.deleted.length} purchase invoices`,
      deleted: outcome.deleted,
      failed: outcome.failed,
      totalProcessed: outcome.deleted.length,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Bulk delete failed' });
  }
};

