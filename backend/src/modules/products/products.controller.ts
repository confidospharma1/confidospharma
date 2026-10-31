import { Request, Response } from 'express';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';
import { generateUniqueMedicineCode } from '../../utils/codeGenerator';
import { extractOrPreserveStrength } from '../../utils/productMatcher';

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { search, barcode, form, prescriptionType, page = '1', limit = '50', branchId } = req.query;

    const targetBranchId = (branchId as string) || req.user?.branchId || undefined;

    const whereClause: any = { isActive: true };

    if (search) {
      const q = (search as string).trim();
      whereClause.OR = [
        { brandName: { contains: q, mode: 'insensitive' } },
        { genericName: { contains: q, mode: 'insensitive' } },
        { strength: { contains: q, mode: 'insensitive' } },
        { internalCode: { contains: q, mode: 'insensitive' } },
        { manufacturer: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (barcode) {
      whereClause.barcode = (barcode as string).trim();
    }

    if (form) {
      whereClause.dosageForm = form as string;
    }

    if (prescriptionType) {
      whereClause.prescriptionType = prescriptionType as string;
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [total, products] = await Promise.all([
      prisma.medicineProduct.count({ where: whereClause }),
      prisma.medicineProduct.findMany({
        where: whereClause,
        include: {
          batches: {
            where: {
              ...(targetBranchId ? { branchId: targetBranchId } : {}),
              status: 'ACTIVE',
              availableQuantity: { gt: 0 },
              expiryDate: { gt: new Date() }, // Non-expired only
            },
            orderBy: { expiryDate: 'asc' }, // FEFO order
            select: {
              id: true,
              branchId: true,
              batchNumber: true,
              expiryDate: true,
              availableQuantity: true,
              mrp: true,
              sellingPrice: true,
              status: true,
            },
          },
        },
        skip,
        take,
        orderBy: { brandName: 'asc' },
      }),
    ]);

    // Format products with total available quantity for the active branch
    const mapped = products.map((p) => {
      const branchBatches = targetBranchId ? p.batches.filter((b) => b.branchId === targetBranchId) : p.batches;
      const totalAvailableStock = branchBatches.reduce((acc, b) => acc + b.availableQuantity, 0);
      return {
        ...p,
        totalAvailableStock,
        activeBatches: branchBatches,
      };
    });

    return res.json({
      total,
      page: parseInt(page as string),
      limit: take,
      totalPages: Math.ceil(total / take),
      products: mapped,
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ message: 'Failed to fetch products' });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const product = await prisma.medicineProduct.findUnique({
      where: { id },
      include: {
        batches: {
          include: {
            branch: { select: { id: true, code: true, name: true } },
            supplier: { select: { id: true, name: true } },
          },
          orderBy: { expiryDate: 'asc' },
        },
      },
    });

    if (!product) return res.status(404).json({ message: 'Product not found' });
    return res.json(product);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch product details' });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users are not permitted to add catalogue medicines.' });
    }

    const {
      internalCode,
      brandName,
      genericName,
      strength,
      dosageForm,
      manufacturer,
      packSize,
      baseUnit = 'Strip',
      packageUnit = 'Box',
      conversionFactor = 1,
      hsnCode,
      gstRate,
      mrp,
      defaultPurchaseRate,
      defaultSellingRate,
      reorderLevel,
      barcode,
      prescriptionType = 'OTC',
      storageNotes,
      // Initial Stock entry fields
      quantity,
      initialQuantity,
      freeQuantity,
      quantityUnit,
      batchNumber,
      expiryDate,
      branchId,
    } = req.body;

    const effectiveBrandName = brandName ? String(brandName).trim() : '';
    const effectiveGeneric = genericName && String(genericName).trim() ? String(genericName).trim() : effectiveBrandName;
    const effectiveDosageForm = dosageForm && String(dosageForm).trim() ? String(dosageForm).trim() : 'Tablet';
    const effectivePackSize = packSize && String(packSize).trim() ? String(packSize).trim() : '1 Unit';
    const effectivePrescriptionType = prescriptionType || 'OTC';

    const missingFields: string[] = [];
    const missingKeys: string[] = [];
    if (!effectiveBrandName) { missingFields.push('Brand Name'); missingKeys.push('brandName'); }
    if (!manufacturer || !String(manufacturer).trim()) { missingFields.push('Manufacturer'); missingKeys.push('manufacturer'); }
    if (gstRate === undefined || gstRate === null || String(gstRate).trim() === '') { missingFields.push('GST Rate'); missingKeys.push('gstRate'); }
    if (mrp === undefined || mrp === null || String(mrp).trim() === '' || isNaN(Number(mrp))) { missingFields.push('Maximum Retail Price (MRP)'); missingKeys.push('mrp'); }

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Please complete all required fields before saving the medicine: ${missingFields.join(', ')}.`,
        missingFields: missingKeys,
        missingFieldLabels: missingFields,
      });
    }

    if (Number(mrp) < 0) {
      return res.status(400).json({
        message: 'Maximum Retail Price (MRP) cannot be negative.',
        missingFields: ['mrp'],
      });
    }

    // Safely extract or preserve strength
    const { genericName: resolvedGeneric, strength: resolvedStrength } = extractOrPreserveStrength(effectiveGeneric, strength);

    // Duplicate detection check (PRD Section 4.3)
    const duplicate = await prisma.medicineProduct.findFirst({
      where: {
        brandName: { equals: effectiveBrandName, mode: 'insensitive' },
        isActive: true,
      },
    });

    if (duplicate) {
      return res.status(409).json({
        message: `Likely duplicate product detected: '${duplicate.brandName}' already exists with code ${duplicate.internalCode}.`,
        duplicateId: duplicate.id,
      });
    }

    // Generate unique internalCode if not provided, or validate supplied code
    const isAutoGenerated = !internalCode || !internalCode.trim();
    let code = isAutoGenerated ? await generateUniqueMedicineCode() : internalCode.trim().toUpperCase();

    if (!isAutoGenerated) {
      const existingWithCode = await prisma.medicineProduct.findUnique({ where: { internalCode: code } });
      if (existingWithCode) {
        return res.status(409).json({
          message: `A medicine with internal code '${code}' already exists. Please choose a different code or leave blank to auto-generate.`,
        });
      }
    }

    // Validate initial stock quantity & free quantity if provided
    const rawQty = quantity !== undefined && quantity !== null && quantity !== '' ? quantity : initialQuantity;
    const parsedInitialQty = rawQty !== undefined && rawQty !== null && rawQty !== '' ? parseInt(String(rawQty)) : 0;
    const parsedFreeQty = freeQuantity !== undefined && freeQuantity !== null && freeQuantity !== '' ? parseInt(String(freeQuantity)) : 0;

    if (parsedInitialQty < 0 || parsedFreeQty < 0) {
      return res.status(400).json({ message: 'Quantity cannot be negative.' });
    }

    const totalOpeningQty = parsedInitialQty + parsedFreeQty;

    let targetBranchId: string | null = null;
    if (req.user.role === 'SUPER_ADMIN') {
      targetBranchId = (branchId as string) || (req.user.branchId as string) || null;
      if (!targetBranchId && totalOpeningQty > 0) {
        const firstBranch = await prisma.branch.findFirst({ select: { id: true } });
        targetBranchId = firstBranch ? firstBranch.id : null;
      }
    } else {
      targetBranchId = req.user.branchId || null;
    }

    if (totalOpeningQty > 0 && !targetBranchId) {
      return res.status(400).json({ message: 'A valid branch is required to record initial stock.' });
    }

    if (totalOpeningQty > 0 && targetBranchId) {
      const branchExists = await prisma.branch.findUnique({ where: { id: targetBranchId } });
      if (!branchExists) {
        return res.status(400).json({ message: 'Target branch does not exist.' });
      }
    }

    const factor = conversionFactor !== undefined && conversionFactor !== null && !isNaN(parseInt(String(conversionFactor)))
      ? Math.max(1, parseInt(String(conversionFactor)))
      : 1;
    const isPackageUnit = quantityUnit && packageUnit && quantityUnit.trim().toLowerCase() === packageUnit.trim().toLowerCase();
    const baseQuantity = isPackageUnit ? totalOpeningQty * factor : totalOpeningQty;

    const batchNum = batchNumber && String(batchNumber).trim()
      ? String(batchNumber).trim().toUpperCase()
      : `OPN-${Date.now().toString().slice(-6)}`;

    let expDate: Date;
    if (expiryDate) {
      expDate = new Date(expiryDate);
      if (isNaN(expDate.getTime())) {
        return res.status(400).json({ message: 'Invalid expiry date format for initial stock batch.' });
      }
    } else {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 2);
      expDate = d;
    }

    const numMrp = parseFloat(String(mrp));
    const numPurchaseRate = defaultPurchaseRate !== undefined && defaultPurchaseRate !== null && defaultPurchaseRate !== ''
      ? parseFloat(String(defaultPurchaseRate))
      : (numMrp * 0.7);
    const numSellingRate = defaultSellingRate !== undefined && defaultSellingRate !== null && defaultSellingRate !== ''
      ? parseFloat(String(defaultSellingRate))
      : numMrp;

    const basePurchaseRate = isPackageUnit ? parseFloat((numPurchaseRate / factor).toFixed(4)) : numPurchaseRate;
    const baseMrp = isPackageUnit ? parseFloat((numMrp / factor).toFixed(4)) : numMrp;
    const baseSellingPrice = isPackageUnit ? parseFloat((numSellingRate / factor).toFixed(4)) : numSellingRate;

    // Atomic database transaction ensuring medicine and initial stock batch succeed or rollback together
    const newProduct = await prisma.$transaction(async (tx) => {
      let createdProduct = null;
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        try {
          createdProduct = await tx.medicineProduct.create({
            data: {
              internalCode: code,
              brandName: brandName.trim(),
              genericName: resolvedGeneric.trim(),
              strength: resolvedStrength.trim(),
              dosageForm: dosageForm.trim(),
              manufacturer: manufacturer.trim(),
              packSize: packSize ? packSize.trim() : `${factor} ${baseUnit}s`,
              baseUnit: baseUnit ? baseUnit.trim() : 'Strip',
              packageUnit: packageUnit ? packageUnit.trim() : 'Box',
              conversionFactor: factor,
              hsnCode: hsnCode ? hsnCode.trim() : null,
              gstRate: parseFloat(String(gstRate)),
              mrp: numMrp,
              defaultPurchaseRate: defaultPurchaseRate !== undefined && defaultPurchaseRate !== null && defaultPurchaseRate !== '' ? parseFloat(String(defaultPurchaseRate)) : null,
              defaultSellingRate: defaultSellingRate !== undefined && defaultSellingRate !== null && defaultSellingRate !== '' ? parseFloat(String(defaultSellingRate)) : null,
              reorderLevel: reorderLevel !== undefined && reorderLevel !== null && reorderLevel !== '' ? parseInt(String(reorderLevel)) : 10,
              barcode: barcode ? barcode.trim() : null,
              prescriptionType: effectivePrescriptionType,
              storageNotes: storageNotes ? storageNotes.trim() : null,
            },
          });
          break;
        } catch (err: any) {
          if (err.code === 'P2002' && isAutoGenerated) {
            attempts++;
            code = await generateUniqueMedicineCode(tx);
            if (attempts >= maxAttempts) throw err;
          } else {
            throw err;
          }
        }
      }

      if (!createdProduct) {
        throw new Error('Unable to save this medicine. Please verify the details and try again.');
      }

      // If positive initial quantity was specified, persist batch and stock movement atomically
      if (baseQuantity > 0 && targetBranchId) {
        let batch = await tx.stockBatch.findFirst({
          where: {
            branchId: targetBranchId,
            medicineId: createdProduct.id,
            batchNumber: batchNum,
          },
        });

        if (batch) {
          batch = await tx.stockBatch.update({
            where: { id: batch.id },
            data: {
              quantityReceived: batch.quantityReceived + baseQuantity,
              availableQuantity: batch.availableQuantity + baseQuantity,
              purchaseRate: basePurchaseRate,
              mrp: baseMrp,
              sellingPrice: baseSellingPrice,
              status: 'ACTIVE',
            },
          });
        } else {
          batch = await tx.stockBatch.create({
            data: {
              branchId: targetBranchId,
              medicineId: createdProduct.id,
              batchNumber: batchNum,
              expiryDate: expDate,
              quantityReceived: baseQuantity,
              availableQuantity: baseQuantity,
              purchaseRate: basePurchaseRate,
              mrp: baseMrp,
              sellingPrice: baseSellingPrice,
              status: 'ACTIVE',
            },
          });
        }

        await tx.stockMovement.create({
          data: {
            branchId: targetBranchId,
            medicineId: createdProduct.id,
            batchId: batch.id,
            movementType: 'STOCK_CORRECTION',
            quantityDelta: baseQuantity,
            unitPrice: basePurchaseRate,
            referenceDocType: 'INITIAL_STOCK',
            referenceDocId: batch.id,
            reason: 'Initial opening stock upon catalogue entry',
            performedByUserId: req.user!.id,
          },
        });
      }

      return createdProduct;
    }, {
      maxWait: 10000,
      timeout: 30000,
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: targetBranchId || undefined,
      action: 'PRODUCT_CREATE',
      targetEntity: 'MEDICINE_PRODUCT',
      entityId: newProduct.id,
      details: {
        internalCode: newProduct.internalCode,
        brandName: newProduct.brandName,
        initialQuantity: baseQuantity,
        branchId: targetBranchId,
      },
      req,
    });

    return res.status(201).json({
      ...newProduct,
      totalAvailableStock: baseQuantity,
    });
  } catch (error: any) {
    console.error('Create product error:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({
        message: 'A record with this internal code already exists. Please verify the details and try again.',
      });
    }
    return res.status(error.status || 500).json({ message: error.message || 'Unable to save this medicine. Please verify the details and try again.' });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'You do not have permission to modify this record. Please contact the Super Admin for assistance.' });
    }

    const id = req.params.id as string;
    const {
      brandName,
      genericName,
      strength,
      dosageForm,
      manufacturer,
      packSize,
      baseUnit,
      packageUnit,
      conversionFactor,
      hsnCode,
      gstRate,
      mrp,
      defaultPurchaseRate,
      defaultSellingRate,
      reorderLevel,
      barcode,
      prescriptionType,
      storageNotes,
      isActive,
    } = req.body;

    // Safely extract or preserve strength from genericName if updated
    const { genericName: resolvedGen, strength: resolvedStr } = genericName
      ? extractOrPreserveStrength(genericName, strength)
      : { genericName: undefined, strength: strength?.trim() };

    const updated = await prisma.medicineProduct.update({
      where: { id },
      data: {
        ...(brandName && { brandName: brandName.trim() }),
        ...(resolvedGen && { genericName: resolvedGen.trim() }),
        ...(strength ? { strength: strength.trim() } : (resolvedStr && resolvedStr !== 'Standard' ? { strength: resolvedStr } : {})),
        ...(dosageForm && { dosageForm: dosageForm.trim() }),
        ...(manufacturer && { manufacturer: manufacturer.trim() }),
        ...(packSize && { packSize: packSize.trim() }),
        ...(baseUnit && { baseUnit: baseUnit.trim() }),
        ...(packageUnit !== undefined && { packageUnit: packageUnit ? packageUnit.trim() : null }),
        ...(conversionFactor !== undefined && { conversionFactor: conversionFactor !== null && !isNaN(parseInt(conversionFactor)) ? Math.max(1, parseInt(conversionFactor)) : 10 }),
        ...(hsnCode !== undefined && { hsnCode: hsnCode ? hsnCode.trim() : null }),
        ...(gstRate !== undefined && { gstRate: parseFloat(gstRate) }),
        ...(mrp !== undefined && { mrp: parseFloat(mrp) }),
        ...(defaultPurchaseRate !== undefined && { defaultPurchaseRate: defaultPurchaseRate !== null && defaultPurchaseRate !== '' ? parseFloat(defaultPurchaseRate) : null }),
        ...(defaultSellingRate !== undefined && { defaultSellingRate: defaultSellingRate !== null && defaultSellingRate !== '' ? parseFloat(defaultSellingRate) : null }),
        ...(reorderLevel !== undefined && { reorderLevel: reorderLevel !== null && reorderLevel !== '' ? parseInt(reorderLevel) : 10 }),
        ...(barcode !== undefined && { barcode: barcode ? barcode.trim() : null }),
        ...(prescriptionType && { prescriptionType }),
        ...(storageNotes !== undefined && { storageNotes: storageNotes ? storageNotes.trim() : null }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      action: 'PRODUCT_UPDATE',
      targetEntity: 'MEDICINE_PRODUCT',
      entityId: updated.id,
      details: { brandName: updated.brandName },
      req,
    });

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ message: 'Unable to update this medicine. Please verify the details and try again.' });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'You do not have permission to modify this record. Please contact the Super Admin for assistance.' });
    }

    const id = req.params.id as string;
    const product = await prisma.medicineProduct.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            batches: true,
            salesLines: true,
            purchaseLines: true,
            movements: true,
            adjustments: true,
            purchaseReturnLines: true,
            purchaseIndentItems: true,
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const hasHistory =
      product._count.batches > 0 ||
      product._count.salesLines > 0 ||
      product._count.purchaseLines > 0 ||
      product._count.movements > 0 ||
      product._count.adjustments > 0 ||
      product._count.purchaseReturnLines > 0 ||
      product._count.purchaseIndentItems > 0;

    if (hasHistory) {
      // Soft-delete to preserve inventory batches and billing ledger auditability
      const archived = await prisma.medicineProduct.update({
        where: { id },
        data: { isActive: false },
      });

      await logAuditEvent({
        userId: req.user.id,
        action: 'PRODUCT_ARCHIVE',
        targetEntity: 'MEDICINE_PRODUCT',
        entityId: archived.id,
        details: { brandName: archived.brandName, reason: 'Archived due to historical stock batches or sales history' },
        req,
      });

      return res.json({
        message: `Medicine '${product.brandName}' has been archived from active catalogue.`,
        product: archived,
        archived: true,
      });
    }

    await prisma.medicineProduct.delete({ where: { id } });

    await logAuditEvent({
      userId: req.user.id,
      action: 'PRODUCT_DELETE',
      targetEntity: 'MEDICINE_PRODUCT',
      entityId: id,
      details: { brandName: product.brandName },
      req,
    });

    return res.json({
      message: `Medicine '${product.brandName}' deleted permanently.`,
      deleted: true,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to delete product' });
  }
};

export const bulkDeleteProducts = async (req: Request, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        message: 'You do not have permission to delete these records. Please contact the Super Admin for assistance.',
      });
    }

    const rawIds = req.body.ids || req.body.productIds;
    if (!rawIds || !Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ message: 'No product IDs provided' });
    }

    // De-duplicate product IDs
    const uniqueIds = Array.from(
      new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    );

    if (uniqueIds.length === 0) {
      return res.status(400).json({ message: 'No valid product IDs provided' });
    }

    const MAX_BULK_DELETE_LIMIT = 100;
    if (uniqueIds.length > MAX_BULK_DELETE_LIMIT) {
      return res.status(400).json({
        message: `Bulk delete request exceeds the maximum limit of ${MAX_BULK_DELETE_LIMIT} products per operation.`,
      });
    }

    const outcome = await prisma.$transaction(
      async (tx) => {
        // Query target products with reference counts in a single efficient batch query
        const products = await tx.medicineProduct.findMany({
          where: { id: { in: uniqueIds } },
          include: {
            _count: {
              select: {
                batches: true,
                salesLines: true,
                purchaseLines: true,
                movements: true,
                adjustments: true,
                purchaseReturnLines: true,
                purchaseIndentItems: true,
              },
            },
          },
        });

        const foundProductMap = new Map(products.map((p) => [p.id, p]));
        const toArchiveIds: string[] = [];
        const toArchiveNames: string[] = [];
        const toDeleteIds: string[] = [];
        const toDeleteNames: string[] = [];
        const failed: { id: string; reason: string }[] = [];

        for (const id of uniqueIds) {
          const product = foundProductMap.get(id);
          if (!product) {
            failed.push({ id, reason: 'Product not found' });
            continue;
          }

          const totalReferences =
            product._count.batches +
            product._count.salesLines +
            product._count.purchaseLines +
            product._count.movements +
            product._count.adjustments +
            product._count.purchaseReturnLines +
            product._count.purchaseIndentItems;

          if (totalReferences > 0) {
            toArchiveIds.push(product.id);
            toArchiveNames.push(product.brandName);
          } else {
            toDeleteIds.push(product.id);
            toDeleteNames.push(product.brandName);
          }
        }

        // Safe bulk archive to preserve historical billing, purchase, and inventory batch records
        if (toArchiveIds.length > 0) {
          await tx.medicineProduct.updateMany({
            where: { id: { in: toArchiveIds } },
            data: { isActive: false },
          });
        }

        // Permanent delete when completely unreferenced
        if (toDeleteIds.length > 0) {
          await tx.medicineProduct.deleteMany({
            where: { id: { in: toDeleteIds } },
          });
        }

        return {
          deleted: toDeleteNames,
          archived: toArchiveNames,
          failed,
        };
      },
      {
        maxWait: 5000,
        timeout: 15000,
      }
    );

    await logAuditEvent({
      userId: req.user.id,
      action: 'PRODUCT_BULK_DELETE',
      targetEntity: 'MEDICINE_PRODUCT',
      details: {
        totalRequested: uniqueIds.length,
        deletedCount: outcome.deleted.length,
        archivedCount: outcome.archived.length,
        failedCount: outcome.failed.length,
      },
      req,
    });

    const totalSuccess = outcome.deleted.length + outcome.archived.length;
    return res.json({
      message: `Processed ${totalSuccess} products (${outcome.deleted.length} permanently deleted, ${outcome.archived.length} safely archived to preserve ledger integrity)`,
      deleted: outcome.deleted,
      archived: outcome.archived,
      failed: outcome.failed,
      totalProcessed: totalSuccess,
    });
  } catch (error: any) {
    console.error('[BulkDeleteProducts] Error executing bulk deletion:', error);

    if (error?.code === 'P2003') {
      return res.status(409).json({
        message: 'Some products could not be deleted because they are referenced by active database records.',
      });
    }

    const isPrismaError = error?.code?.startsWith?.('P') || error?.name?.includes('Prisma');
    const safeMessage = isPrismaError
      ? 'A database error occurred while processing bulk product deletion. No records were corrupted.'
      : (error.message || 'Bulk delete failed');

    return res.status(500).json({ message: safeMessage });
  }
};


