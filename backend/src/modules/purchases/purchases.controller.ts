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
  calculatePharmaRowUnitsAndPrices,
} from '../imports/imports.mapper';
import { matchProduct, CandidateProduct, areStrengthsCompatible, normalizeString, extractOrPreserveStrength } from '../../utils/productMatcher';
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
  let targetBranchId: string | null = null;
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
    const validatedBranchId: string = targetBranchId;

    if (!supplierInvoiceNumber || !supplierInvoiceNumber.trim()) {
      return res.status(400).json({ message: 'Supplier invoice number is required.' });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: 'At least one medicine line item is required.' });
    }

    const branch = await prisma.branch.findUnique({ where: { id: validatedBranchId } });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    if (!branch.isActive) return res.status(400).json({ message: 'Target branch is inactive' });

    const result = await prisma.$transaction(async (tx) => {
      const maxDiscountSetting = await tx.systemSetting.findUnique({
        where: { key: 'MAX_PURCHASE_DISCOUNT_PERCENT' },
      });
      const maxAllowedDiscount = maxDiscountSetting ? parseFloat(maxDiscountSetting.value) : 20.0;

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
          branchId: validatedBranchId,
          status: { not: 'CANCELLED' },
        },
      });

      if (existing) {
        throw new Error(`This purchase has already been recorded: Supplier Invoice '${supplierInvoiceNumber}' from this supplier is already recorded as Invoice ${existing.invoiceNumber}.`);
      }

      // Check idempotency key if provided
      const idempotencyKey = (req.headers['idempotency-key'] || (req.body && req.body.idempotencyKey) || '') as string;
      if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
        const idempExisting = await tx.purchaseInvoice.findFirst({
          where: {
            branchId: validatedBranchId,
            notes: { contains: `[IDEMPOTENCY:${idempotencyKey.trim()}]` },
            status: { not: 'CANCELLED' },
          },
        });
        if (idempExisting) {
          throw new Error(`This purchase has already been recorded (Duplicate submission detected).`);
        }
      }

      let subtotalDec = new Decimal(0);
      let taxTotalDec = new Decimal(0);
      let lineDiscountsTotalDec = new Decimal(0);

      const year = new Date().getFullYear();
      const prefix = `PUR-${branch.code.replace('B-', '')}-${year}-`;
      const latestInvoice = await tx.purchaseInvoice.findFirst({
        where: {
          invoiceNumber: { startsWith: prefix },
        },
        orderBy: { invoiceNumber: 'desc' },
      });
      let nextSeq = 1;
      if (latestInvoice && latestInvoice.invoiceNumber) {
        const parts = latestInvoice.invoiceNumber.split('-');
        const lastNum = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastNum)) {
          nextSeq = lastNum + 1;
        }
      }
      let invoiceNumber = `${prefix}${String(nextSeq).padStart(5, '0')}`;
      while (await tx.purchaseInvoice.findFirst({ where: { invoiceNumber } })) {
        nextSeq++;
        invoiceNumber = `${prefix}${String(nextSeq).padStart(5, '0')}`;
      }

      const processedLines: any[] = [];
      // In-transaction cache for newly created or resolved medicines to handle multiple lines with same new medicine
      const resolvedMedicineMap = new Map<string, string>();
      let lineIndex = 0;

      for (const line of lines) {
        lineIndex++;
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

        // Extract metadata if available directly on line or in newMedicine
        const lineBrandName = (newMedicine?.brandName || line.brandName || line.productName || newMedicine?.productName || '').toString().trim();
        const lineGenericName = (newMedicine?.genericName || line.genericName || '').toString().trim();
        const lineStrength = (newMedicine?.strength || line.strength || '').toString().trim();
        const lineDosageForm = (newMedicine?.dosageForm || line.dosageForm || 'Tablet').toString().trim();
        const lineManufacturer = (newMedicine?.manufacturer || line.manufacturer || '').toString().trim();
        const lineHsnCode = (newMedicine?.hsnCode || line.hsnCode || '30049099').toString().trim();
        const lineBaseUnit = (newMedicine?.baseUnit || line.sellingUnit || line.baseUnit || 'Tablet').toString().trim();
        const linePackageUnit = (newMedicine?.packageUnit || line.purchaseUnit || line.unit || 'Tablet').toString().trim();
        const lineConvFactor = parseInt(newMedicine?.conversionFactor || line.conversionFactor || line.unitsPerPack || 1, 10);

        let resolvedMed: any = null;

        // Case A1: If medicineId is a non-placeholder UUID/ID, verify it exists in DB
        if (medicineId && medicineId !== 'NEW' && typeof medicineId === 'string' && medicineId.trim() !== '') {
          resolvedMed = await tx.medicineProduct.findUnique({
            where: { id: medicineId.trim() },
          });
        }

        // Case A2: If not resolved by ID, check if this medicine was already resolved/created in this invoice transaction
        const medCacheKey = `${normalizeString(lineBrandName)}_${normalizeString(lineStrength)}_${normalizeString(lineDosageForm)}`;
        if (!resolvedMed && lineBrandName && resolvedMedicineMap.has(medCacheKey)) {
          const cachedId = resolvedMedicineMap.get(medCacheKey)!;
          resolvedMed = await tx.medicineProduct.findUnique({ where: { id: cachedId } });
        }

        // Case A3: Check if existing medicine exists in catalogue by Brand Name + Strength + Dosage Form
        if (!resolvedMed && lineBrandName) {
          const candidates = await tx.medicineProduct.findMany({
            where: {
              isActive: true,
              brandName: {
                equals: lineBrandName,
                mode: 'insensitive',
              },
            },
          });

          if (candidates.length > 0) {
            for (const cand of candidates) {
              const strengthMatch = !lineStrength || areStrengthsCompatible(cand.strength, lineStrength);
              const formMatch = !lineDosageForm || cand.dosageForm.toLowerCase() === lineDosageForm.toLowerCase();
              if (strengthMatch && formMatch) {
                resolvedMed = cand;
                break;
              }
            }
            if (!resolvedMed && candidates.length === 1 && !lineStrength) {
              resolvedMed = candidates[0];
            }
          }
        }

        // Case B: New medicine creation if not already in DB
        if (!resolvedMed && (newMedicine || line.isNewProduct || medicineId === 'NEW' || lineBrandName)) {
          if (!lineBrandName) {
            throw new Error(`Line ${lineIndex}: Brand Name or Product Name is required to register a new medicine.`);
          }

          const internalCode = await generateUniqueMedicineCode(tx);
          const parsedGst = parseFloat(newMedicine?.gstRate ?? gstRate ?? 5.0) || 5.0;
          const parsedMrp = parseFloat(newMedicine?.mrp ?? mrp ?? 100) || 100;
          const parsedPurchaseRate = parseFloat(newMedicine?.defaultPurchaseRate ?? purchaseRate ?? 70) || 70;
          const parsedSellingRate = parseFloat(newMedicine?.defaultSellingRate ?? sellingRate ?? mrp ?? 100) || 100;

          const resolvedStrObj = extractOrPreserveStrength(lineGenericName || 'Generic Formulation', lineStrength);
          resolvedMed = await tx.medicineProduct.create({
            data: {
              internalCode,
              brandName: lineBrandName,
              genericName: resolvedStrObj.genericName,
              strength: resolvedStrObj.strength,
              dosageForm: lineDosageForm || 'Tablet',
              manufacturer: lineManufacturer || 'Standard Pharma',
              packSize: newMedicine?.packSize || `${!isNaN(lineConvFactor) && lineConvFactor > 0 ? lineConvFactor : 1} ${lineBaseUnit}s`,
              baseUnit: lineBaseUnit,
              hsnCode: lineHsnCode || '30049099',
              gstRate: parsedGst,
              mrp: parsedMrp,
              defaultPurchaseRate: parsedPurchaseRate,
              defaultSellingRate: parsedSellingRate,
              prescriptionType: newMedicine?.prescriptionType || 'Schedule H',
              storageNotes: newMedicine?.storageNotes ? newMedicine.storageNotes.trim() : (line.notes ? String(line.notes).trim() : undefined),
              packageUnit: linePackageUnit,
              conversionFactor: !isNaN(lineConvFactor) && lineConvFactor > 0 ? lineConvFactor : 1,
              isActive: true,
            },
          });
        }

        if (!resolvedMed) {
          throw new Error(
            `The purchase could not be saved because a valid medicine record could not be resolved for line item ${lineIndex} ('${lineBrandName || medicineId || 'Unknown'}'). Please refresh product list or provide product details.`
          );
        }

        // Ensure medicineId is the actual verified database ID
        medicineId = resolvedMed.id;
        if (lineBrandName) {
          resolvedMedicineMap.set(medCacheKey, resolvedMed.id);
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

        // Line discount calculation (Max allowed limit, reject negative)
        let lineDisc = new Decimal(0);
        const discPct = new Decimal(discountPercent || 0);
        if (discPct.isNegative() || discPct.greaterThan(maxAllowedDiscount)) {
          throw new Error(`Purchase discount percentage cannot exceed ${maxAllowedDiscount}% policy limit and cannot be negative.`);
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

        const { date: parsedExpiry, error: expErr } = parseExpiryDate(expiryDate);
        if (expErr || !parsedExpiry) {
          throw new Error(expErr || `Invalid expiry date format for batch ${batchNumber}`);
        }

        let factor = 1;
        if (line.conversionFactor !== undefined && line.conversionFactor !== null && line.conversionFactor !== '') {
          const parsedFactor = parseInt(line.conversionFactor);
          if (isNaN(parsedFactor) || parsedFactor <= 0) {
            throw new Error(`Conversion factor (Units/Pk) for batch ${batchNumber} must be an integer greater than zero.`);
          }
          factor = parsedFactor;
        } else if (newMedicine?.conversionFactor && parseInt(newMedicine.conversionFactor) > 0) {
          factor = parseInt(newMedicine.conversionFactor);
        } else if (resolvedMed?.conversionFactor && resolvedMed.conversionFactor > 0 && line.unit && line.unit.toLowerCase() === (resolvedMed.packageUnit || '').toLowerCase()) {
          factor = resolvedMed.conversionFactor;
        }
        const lineUnit = line.unit || 'Tablet';
        const totalBatchQty = (qty + freeQty) * factor;

        // Base unit pricing normalization for inventory batch
        const basePurchaseRate = rateDec.dividedBy(factor).toDecimalPlaces(4).toNumber();
        const baseSellingPrice = sellingRateDec.dividedBy(factor).toDecimalPlaces(4).toNumber();
        const baseMrp = mrpDec.dividedBy(factor).toDecimalPlaces(4).toNumber();

        // Check/create batch in branch matching required attributes:
        // Medicine, Branch, BatchNumber, Supplier, and Expiry Date.
        const existingBatches = await tx.stockBatch.findMany({
          where: {
            branchId: validatedBranchId,
            medicineId,
            batchNumber: batchNumber.trim(),
          },
        });

        // Exact match rule: same supplier and same expiry date (YYYY-MM-DD)
        let batch = existingBatches.find((b) => {
          const supplierMatches = (!b.supplierId && !resolvedSupplierId) || (b.supplierId === resolvedSupplierId);
          const bDateStr = b.expiryDate.toISOString().slice(0, 10);
          const pDateStr = parsedExpiry.toISOString().slice(0, 10);
          return supplierMatches && bDateStr === pDateStr;
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
              branchId: validatedBranchId,
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
            branchId: validatedBranchId,
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
          branchId: validatedBranchId,
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
      branchId: validatedBranchId,
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
    console.error('[PURCHASE_CONFIRM_ERROR]', {
      message: error.message,
      code: error.code,
      stack: error.stack,
      targetBranchId,
      supplierInvoiceNumber: req.body?.supplierInvoiceNumber,
    });

    let userMessage = error.message || 'The purchase could not be completed. No stock changes were saved.';

    if (
      error.code === 'P2003' ||
      String(error.message).includes('Foreign key constraint violated') ||
      String(error.message).includes('StockBatch_medicineId_fkey')
    ) {
      userMessage = 'The purchase could not be saved because a medicine record is missing or invalid. No stock changes were saved.';
    } else if (error.code === 'P2002' || String(error.message).includes('Unique constraint failed')) {
      userMessage = 'This purchase has already been recorded. Duplicate invoice or batch constraint detected.';
    } else if (String(error.message).includes('Foreign key')) {
      userMessage = 'The purchase could not be saved because an associated branch, supplier, or medicine record could not be found.';
    } else if (String(error.message).includes('already been recorded') || String(error.message).includes('Duplicate invoice')) {
      userMessage = error.message;
    }

    return res.status(400).json({ message: userMessage });
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
      const maxDiscountSetting = await tx.systemSetting.findUnique({
        where: { key: 'MAX_PURCHASE_DISCOUNT_PERCENT' },
      });
      const maxAllowedDiscount = maxDiscountSetting ? parseFloat(maxDiscountSetting.value) : 20.0;
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
        if (discPct.isNegative() || discPct.greaterThan(maxAllowedDiscount)) {
          throw new Error(`Purchase discount percentage cannot exceed ${maxAllowedDiscount}% policy limit and cannot be negative.`);
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

        const { date: parsedExpiry, error: expErr } = parseExpiryDate(expiryDate);
        if (expErr || !parsedExpiry) {
          throw new Error(expErr || `Invalid expiry date format for batch ${batchNumber}`);
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
        const lineUnit = line.unit || 'Tablet';
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
          const verifiedMed = await tx.medicineProduct.findUnique({ where: { id: medicineId } });
          if (!verifiedMed) {
            throw new Error(`The purchase could not be updated because medicine ID '${medicineId}' was not found in the catalogue.`);
          }

          batch = await tx.stockBatch.create({
            data: {
              branchId: targetBranchId,
              medicineId: verifiedMed.id,
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

        const totalLineQty = (line.baseQuantity && line.baseQuantity > 0)
          ? line.baseQuantity
          : ((line.quantity + line.freeQuantity) * (line.conversionFactor || 1));
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

        const totalLineQty = (line.baseQuantity && line.baseQuantity > 0)
          ? line.baseQuantity
          : ((line.quantity + line.freeQuantity) * (line.conversionFactor || 1));
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

          const baseRate = (line.conversionFactor && line.conversionFactor > 1)
            ? line.purchaseRate / line.conversionFactor
            : line.purchaseRate;

          await tx.stockMovement.create({
            data: {
              branchId: invoice.branchId,
              medicineId: line.medicineId,
              batchId: batch.id,
              movementType: 'STOCK_CORRECTION',
              quantityDelta: -totalLineQty,
              unitPrice: baseRate,
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

      const pharma = calculatePharmaRowUnitsAndPrices(mapped);

      // Skip completely blank / trailing formula rows
      if (!pharma.medicineName && !pharma.batchNumber) {
        return;
      }

      const rawProductName = (mapped.productName || pharma.medicineName || '').toString().trim();
      const rawBrandName = (mapped.brandName || pharma.medicineName || '').toString().trim();

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

      const brandName = effectiveBrandName || pharma.medicineName;
      const productName = effectiveProductName || pharma.medicineName;
      const genericName = (mapped.genericName || '').toString().trim();
      const strength = (mapped.strength || '').toString().trim();
      const dosageForm = (mapped.dosageForm || 'Tablet').toString().trim();
      const manufacturer = (mapped.manufacturer || pharma.manufacturer || '').toString().trim();
      const hsnCode = (mapped.hsnCode || pharma.hsnCode || '').toString().trim() || null;
      const batchNumber = (mapped.batchNumber || pharma.batchNumber || '').toString().trim();
      const expiryRaw = mapped.expiryDate || pharma.expiryDate;

      const stripQuantityInBox = pharma.stripQuantityInBox;
      const stripUnitQuantity = pharma.stripUnitQuantity;
      const totalUnits = pharma.totalUnits;
      const pharmacyPhysicalUnits = pharma.pharmacyPhysicalUnits;
      const stripPurchasePrice = pharma.stripPurchasePrice;
      const stripMrpPrice = pharma.stripMrpPrice;
      const purchaseUnitPrice = pharma.purchaseUnitPrice;
      const unitSellingPrice = pharma.unitSellingPrice;

      const purchaseUnit = 'Strip';
      const sellingUnit = 'Tablet';
      const quantity = stripQuantityInBox;
      const freeQuantity = parseCleanInt(mapped.freeQuantity, 0);
      const unitsPerPack = stripUnitQuantity;
      const purchaseRate = stripPurchasePrice;
      const mrp = stripMrpPrice;
      const sellingRate = stripMrpPrice;
      const gstRate = parseCleanNumber(mapped.gstRate, 5.0);
      const discountPercent = parseCleanNumber(mapped.discountPercent, 0);

      // Validation
      if (!brandName && !productName) {
        errors.push('Medicine Name is required');
      }
      if (!batchNumber) {
        errors.push('Batch Number is required');
      }
      if (isNaN(stripQuantityInBox) || stripQuantityInBox <= 0) {
        errors.push('Strip Quantity in Box must be greater than zero');
      }
      if (isNaN(stripUnitQuantity) || stripUnitQuantity <= 0) {
        errors.push('Strip Unit Quantity (tablets per strip) must be greater than zero');
      }
      if (isNaN(stripPurchasePrice) || stripPurchasePrice < 0) {
        errors.push('Strip purchase price cannot be negative');
      }
      if (isNaN(stripMrpPrice) || stripMrpPrice < 0) {
        errors.push('Strip MRP price cannot be negative');
      }
      if (stripMrpPrice > 0 && stripPurchasePrice > stripMrpPrice) {
        warnings.push('Strip purchase price is higher than strip MRP price');
      }

      // Safe expiry parsing
      const { date: expDate, isoString: expDateIso, error: expError } = parseExpiryDate(expiryRaw);
      if (expError) {
        errors.push(expError);
      } else if (expDate && expDate <= new Date()) {
        errors.push('Batch is already expired. Expired stock cannot be accepted into inventory.');
      }

      // Product Matching
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

      const conversionFactor = stripUnitQuantity > 0 ? stripUnitQuantity : 1;

      // Derived financial amounts based on Strip Purchase Price * Strip Quantity
      const lineGrossDec = new Decimal(stripQuantityInBox).times(stripPurchasePrice);
      const lineDiscDec = lineGrossDec.times(isNaN(discountPercent) ? 0 : discountPercent).dividedBy(100);
      const lineTaxableDec = lineGrossDec.minus(lineDiscDec);
      const lineTaxDec = lineTaxableDec.times(isNaN(gstRate) ? 0 : gstRate).dividedBy(100);
      const lineTotalDec = lineTaxableDec.plus(lineTaxDec);

      if (errors.length === 0) {
        validRowsCount++;
        totalQuantity += totalUnits;
        totalGrossDec = totalGrossDec.plus(lineGrossDec);
        totalDiscountDec = totalDiscountDec.plus(lineDiscDec);
        totalTaxableDec = totalTaxableDec.plus(lineTaxableDec);
        totalTaxDec = totalTaxDec.plus(lineTaxDec);
        totalGrandDec = totalGrandDec.plus(lineTotalDec);
      } else {
        errorRowsCount++;
      }

      if (warnings.length > 0) warningRowsCount++;

      const unitConfigStr = JSON.stringify({
        stripQuantityInBox,
        stripUnitQuantity,
        totalUnits,
        pharmacyPhysicalUnits,
        stripPurchasePrice,
        stripMrpPrice,
        purchaseUnitPrice,
        unitSellingPrice,
        supportedUnits: [
          { unit: 'Tablet', multiplierToBase: 1, isBaseUnit: true },
          { unit: 'Strip', multiplierToBase: stripUnitQuantity },
        ],
      });

      validatedRows.push({
        rowIndex,
        rowNumber: rowIndex,
        valid: errors.length === 0,
        medicineId: matchedProd?.id || (isNewProd ? 'NEW' : null),
        matchedProductId: matchedProd?.id || null,
        productName: effectiveProductName,
        brandName: effectiveBrandName,
        medicineName: effectiveBrandName,
        genericName: genericName || matchedProd?.genericName || effectiveBrandName,
        strength: strength || matchedProd?.strength || 'Standard',
        dosageForm: dosageForm || matchedProd?.dosageForm || 'Tablet',
        manufacturer: manufacturer || matchedProd?.manufacturer || 'Standard Pharma',
        hsnCode: hsnCode || matchedProd?.hsnCode || '30049099',
        batchNumber,
        expiryDate: expDateIso || (expiryRaw ? String(expiryRaw) : ''),
        unit: 'Strip',
        purchaseUnit: 'Strip',
        sellingUnit: 'Tablet',
        quantity: stripQuantityInBox,
        freeQuantity,
        unitsPerPack: stripUnitQuantity,
        conversionFactor: stripUnitQuantity,
        stripQuantityInBox,
        stripUnitQuantity,
        totalUnits,
        pharmacyPhysicalUnits,
        stripPurchasePrice,
        stripMrpPrice,
        purchaseUnitPrice,
        unitSellingPrice,
        purchaseRate: stripPurchasePrice,
        sellingRate: stripMrpPrice,
        mrp: stripMrpPrice,
        gstRate,
        discountPercent,
        discountAmount: lineDiscDec.toDecimalPlaces(2).toNumber(),
        taxableAmount: lineTaxableDec.toDecimalPlaces(2).toNumber(),
        taxAmount: lineTaxDec.toDecimalPlaces(2).toNumber(),
        lineTotal: lineTotalDec.toDecimalPlaces(2).toNumber(),
        effectiveBaseUnitCost: purchaseUnitPrice,
        basePurchaseRate: purchaseUnitPrice,
        baseMrp: unitSellingPrice,
        baseSellingRate: unitSellingPrice,
        status: errors.length > 0 ? 'ERROR' : 'READY',
        errors,
        warnings,
        isNewProduct: isNewProd,
        isNewBatch,
        potentialCandidates: matchResult.potentialCandidates || [],
        newMedicine: isNewProd
          ? {
              brandName: effectiveBrandName,
              genericName: genericName || effectiveBrandName,
              strength: strength || 'Standard',
              dosageForm: 'Tablet',
              manufacturer: manufacturer || 'Standard Pharma',
              packSize: `${stripQuantityInBox} Strips x ${stripUnitQuantity} Tablets`,
              hsnCode: hsnCode || '30049099',
              gstRate,
              mrp: stripMrpPrice,
              defaultPurchaseRate: stripPurchasePrice,
              defaultSellingRate: stripMrpPrice,
              baseUnit: 'Tablet',
              packageUnit: 'Strip',
              conversionFactor: stripUnitQuantity,
              unitConfig: unitConfigStr,
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
        'Medicine Name': 'Dolo 650',
        'Batch No': 'DL-2028-01',
        'Expiry Date': '30-12-2028',
        'HSN No': '30049099',
        'Manufacturer': 'Micro Labs Ltd',
        'STRIP QUANTITY IN THE BOX': 10,
        'STRIP UNIT QUANTITY': 10,
        'Total Units': 100,
        'pharmacy Physical Units': 100,
        'Strip Purchase Price': 10.00,
        'Strip MRP Price': 20.00,
        'Purchase Unit Price': 1.00,
        'unit Selling Price': 2.00,
      },
      {
        'Medicine Name': 'Augmentin 625 Duo',
        'Batch No': 'AUG-2028-B2',
        'Expiry Date': '30.12.2028',
        'HSN No': '30041010',
        'Manufacturer': 'GSK Pharma',
        'STRIP QUANTITY IN THE BOX': 20,
        'STRIP UNIT QUANTITY': 20,
        'Total Units': 400,
        'pharmacy Physical Units': 400,
        'Strip Purchase Price': 20.00,
        'Strip MRP Price': 40.00,
        'Purchase Unit Price': 1.00,
        'unit Selling Price': 2.00,
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
      return res.status(403).json({
        message: 'You do not have permission to delete these records. Please contact the Super Admin for assistance.',
      });
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

    if (uniqueIds.length > 100) {
      return res.status(400).json({
        message: `Batch size of ${uniqueIds.length} exceeds the maximum limit of 100 invoices per request. Please delete in smaller batches.`,
      });
    }

    const outcome = await prisma.$transaction(
      async (tx) => {
        const results = {
          deleted: [] as string[],
          failed: [] as { id: string; reason: string }[],
        };

        const existingInvoices = await tx.purchaseInvoice.findMany({
          where: { id: { in: uniqueIds } },
          include: {
            returns: {
              select: { id: true },
            },
          },
        });

        const invoiceMap = new Map<string, (typeof existingInvoices)[0]>();
        for (const inv of existingInvoices) {
          invoiceMap.set(inv.id, inv);
        }

        const toCancelIds: string[] = [];
        const toDeleteIds: string[] = [];

        for (const id of uniqueIds) {
          const invoice = invoiceMap.get(id);

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
            toCancelIds.push(id);
            results.deleted.push(invoice.invoiceNumber);
          } else {
            toDeleteIds.push(id);
            results.deleted.push(invoice.invoiceNumber);
          }
        }

        if (toCancelIds.length > 0) {
          await tx.purchaseInvoice.updateMany({
            where: { id: { in: toCancelIds } },
            data: { status: 'CANCELLED' },
          });
        }

        if (toDeleteIds.length > 0) {
          await tx.purchaseInvoiceLine.deleteMany({
            where: { purchaseInvoiceId: { in: toDeleteIds } },
          });
          await tx.purchaseInvoice.deleteMany({
            where: { id: { in: toDeleteIds } },
          });
        }

        return results;
      },
      {
        maxWait: 5000,
        timeout: 15000,
      }
    );

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
    console.error('[BulkDeletePurchases] Error executing bulk deletion:', error);
    if (error && typeof error === 'object' && error.code === 'P2003') {
      return res.status(409).json({
        message: 'One or more invoices cannot be deleted because they are referenced by other records.',
      });
    }
    return res.status(500).json({ message: 'Failed to process bulk deletion of purchase invoices' });
  }
};

