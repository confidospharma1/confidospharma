import { Request, Response } from 'express';
import Decimal from 'decimal.js';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';
import { generateUniqueMedicineCode } from '../../utils/codeGenerator';

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

    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId || req.user.branchId) : req.user.branchId;

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

        const gstDec = new Decimal(gstRate !== undefined ? gstRate : 5.0);

        // Gross line value = Quantity * Purchase Rate
        const grossLine = rateDec.times(qty);

        // Line discount calculation
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
            unitPrice: rateDec.toNumber(),
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
    });

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
        const total = oldLine.quantity + oldLine.freeQuantity;
        oldBatchMap.set(key, { qty: oldLine.quantity, freeQty: oldLine.freeQuantity, total, line: oldLine });
      }

      // Build map of new lines
      const newBatchMap = new Map<string, { qty: number; freeQty: number; total: number }>();
      for (const newLine of lines) {
        const key = `${newLine.medicineId}_${newLine.batchNumber.trim()}`;
        const qty = parseInt(newLine.quantity);
        const freeQty = parseInt(newLine.freeQuantity || 0);
        newBatchMap.set(key, { qty, freeQty, total: qty + freeQty });
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
        const gstDec = new Decimal(gstRate !== undefined ? gstRate : 5.0);

        const grossLine = rateDec.times(qty);
        let lineDisc = new Decimal(0);
        const discPct = new Decimal(discountPercent || 0);
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
        const totalNewQty = qty + freeQty;

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
              purchaseRate: rateDec.toNumber(),
              sellingPrice: sellingRateDec.toNumber(),
              mrp: mrpDec.toNumber(),
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
              purchaseRate: rateDec.toNumber(),
              sellingPrice: sellingRateDec.toNumber(),
              mrp: mrpDec.toNumber(),
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
              unitPrice: rateDec.toNumber(),
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
