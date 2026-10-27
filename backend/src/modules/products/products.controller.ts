import { Request, Response } from 'express';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';

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
      hsnCode,
      gstRate,
      mrp,
      defaultPurchaseRate,
      defaultSellingRate,
      reorderLevel,
      barcode,
      prescriptionType = 'Schedule H',
      storageNotes,
    } = req.body;

    if (!brandName || !genericName || !strength || !dosageForm || !manufacturer || gstRate === undefined || mrp === undefined) {
      return res.status(400).json({ message: 'Missing required product information.' });
    }

    // Duplicate detection check (PRD Section 4.3)
    const duplicate = await prisma.medicineProduct.findFirst({
      where: {
        brandName: { equals: brandName.trim() },
        genericName: { equals: genericName.trim() },
        strength: { equals: strength.trim() },
        dosageForm: { equals: dosageForm.trim() },
      },
    });

    if (duplicate) {
      return res.status(409).json({
        message: `Likely duplicate product detected: '${duplicate.brandName}' (${duplicate.genericName} ${duplicate.strength} ${duplicate.dosageForm}) already exists with code ${duplicate.internalCode}.`,
        duplicateId: duplicate.id,
      });
    }

    // Generate internalCode if not provided
    let code = internalCode;
    if (!code) {
      const count = await prisma.medicineProduct.count();
      code = `MED-${String(count + 1).padStart(4, '0')}`;
    }

    const newProduct = await prisma.medicineProduct.create({
      data: {
        internalCode: code.toUpperCase().trim(),
        brandName: brandName.trim(),
        genericName: genericName.trim(),
        strength: strength.trim(),
        dosageForm: dosageForm.trim(),
        manufacturer: manufacturer.trim(),
        packSize: packSize ? packSize.trim() : '10 Tablets',
        baseUnit: baseUnit.trim(),
        hsnCode: hsnCode ? hsnCode.trim() : null,
        gstRate: parseFloat(gstRate),
        mrp: parseFloat(mrp),
        defaultPurchaseRate: defaultPurchaseRate !== undefined && defaultPurchaseRate !== null && defaultPurchaseRate !== '' ? parseFloat(defaultPurchaseRate) : null,
        defaultSellingRate: defaultSellingRate !== undefined && defaultSellingRate !== null && defaultSellingRate !== '' ? parseFloat(defaultSellingRate) : null,
        reorderLevel: reorderLevel !== undefined && reorderLevel !== null && reorderLevel !== '' ? parseInt(reorderLevel) : 10,
        barcode: barcode ? barcode.trim() : null,
        prescriptionType,
        storageNotes: storageNotes ? storageNotes.trim() : null,
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      action: 'PRODUCT_CREATE',
      targetEntity: 'MEDICINE_PRODUCT',
      entityId: newProduct.id,
      details: { internalCode: newProduct.internalCode, brandName: newProduct.brandName },
      req,
    });

    return res.status(201).json(newProduct);
  } catch (error: any) {
    console.error('Create product error:', error);
    return res.status(500).json({ message: error.message || 'Failed to create product' });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot edit product catalogue' });
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

    const updated = await prisma.medicineProduct.update({
      where: { id },
      data: {
        ...(brandName && { brandName: brandName.trim() }),
        ...(genericName && { genericName: genericName.trim() }),
        ...(strength && { strength: strength.trim() }),
        ...(dosageForm && { dosageForm: dosageForm.trim() }),
        ...(manufacturer && { manufacturer: manufacturer.trim() }),
        ...(packSize && { packSize: packSize.trim() }),
        ...(baseUnit && { baseUnit: baseUnit.trim() }),
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
    return res.status(500).json({ message: error.message || 'Failed to update product' });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot delete products' });
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
          },
        },
      },
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const hasHistory = product._count.batches > 0 || product._count.salesLines > 0 || product._count.purchaseLines > 0;

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

