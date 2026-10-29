import { Request, Response } from 'express';
import Decimal from 'decimal.js';
import prisma from '../../database/prisma';

export interface PackConversionDisplay {
  baseQuantity: number;
  baseUnit: string;
  packageUnit: string;
  conversionFactor: number;
  equivalentPacksText: string;
  fullPacks: number;
  remainderUnits: number;
}

export function formatPackConversion(
  quantity: number,
  baseUnit: string = 'Strip',
  packageUnit: string = 'Box',
  conversionFactor: number = 10
): PackConversionDisplay {
  const factor = conversionFactor > 0 ? conversionFactor : 1;
  const fullPacks = Math.floor(quantity / factor);
  const remainderUnits = quantity % factor;

  let equivalentPacksText = '';
  if (fullPacks > 0 && remainderUnits > 0) {
    equivalentPacksText = `${fullPacks} ${packageUnit}${fullPacks > 1 ? 'es' : ''} + ${remainderUnits} ${baseUnit}${remainderUnits > 1 ? 's' : ''}`;
  } else if (fullPacks > 0 && remainderUnits === 0) {
    equivalentPacksText = `${fullPacks} ${packageUnit}${fullPacks > 1 ? 'es' : ''}`;
  } else {
    equivalentPacksText = `${quantity} ${baseUnit}${quantity !== 1 ? 's' : ''}`;
  }

  return {
    baseQuantity: quantity,
    baseUnit,
    packageUnit,
    conversionFactor: factor,
    equivalentPacksText,
    fullPacks,
    remainderUnits,
  };
}

/**
 * Strict Read-Only Stock Monitoring Controller
 * Enforces branch scoping, tenant isolation, and non-mutating operations.
 */
export const getStockMonitoring = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const {
      branchId,
      search,
      stockStatus = 'ALL',
      expiryStatus = 'ALL',
      dosageForm,
      manufacturer,
      genericName,
      supplierId,
      minQuantity,
      maxQuantity,
      batchNumber,
      sortBy = 'name',
      sortOrder = 'asc',
      page = '1',
      limit = '20',
    } = req.query;

    // Strict Branch Security Enforcement (Part 9)
    let targetBranchId: string | null = null;
    if (req.user.role === 'SUPER_ADMIN') {
      targetBranchId = (branchId && typeof branchId === 'string' && branchId.trim())
        ? branchId.trim()
        : (req.user.branchId || null);
    } else {
      if (branchId && typeof branchId === 'string' && branchId.trim() && branchId.trim() !== req.user.branchId) {
        return res.status(403).json({ message: 'You are not authorized to access another branch inventory' });
      }
      targetBranchId = req.user.branchId || null;
    }

    if (!targetBranchId) {
      // If super admin and no branch specified, select the first active branch
      const firstBranch = await prisma.branch.findFirst({ where: { isActive: true }, select: { id: true } });
      if (firstBranch) targetBranchId = firstBranch.id;
    }

    const branch = targetBranchId
      ? await prisma.branch.findUnique({
          where: { id: targetBranchId },
          select: { id: true, code: true, name: true, isActive: true },
        })
      : null;

    if (targetBranchId && !branch) {
      return res.status(404).json({ message: 'Selected branch not found' });
    }

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const in180Days = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

    // 1. Fetch all active medicines and branch batches in parallel (Zero N+1)
    const [medicines, branchBatches, recentMovements] = await Promise.all([
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
          packSize: true,
          baseUnit: true,
          packageUnit: true,
          conversionFactor: true,
          hsnCode: true,
          gstRate: true,
          mrp: true,
          defaultPurchaseRate: true,
          defaultSellingRate: true,
          reorderLevel: true,
        },
      }),
      targetBranchId
        ? prisma.stockBatch.findMany({
            where: { branchId: targetBranchId },
            include: {
              supplier: { select: { id: true, name: true } },
            },
            orderBy: { expiryDate: 'asc' }, // FEFO order
          })
        : Promise.resolve([]),
      targetBranchId
        ? prisma.stockMovement.findMany({
            where: { branchId: targetBranchId },
            orderBy: { createdAt: 'desc' },
            distinct: ['medicineId'],
            select: { medicineId: true, createdAt: true, movementType: true },
          })
        : Promise.resolve([]),
    ]);

    // Map recent movements by medicineId
    const lastMovementMap = new Map<string, { date: Date; type: string }>();
    recentMovements.forEach((m) => {
      lastMovementMap.set(m.medicineId, { date: m.createdAt, type: m.movementType });
    });

    // Map batches by medicineId
    const batchesByMedicine = new Map<string, typeof branchBatches>();
    branchBatches.forEach((b) => {
      const list = batchesByMedicine.get(b.medicineId) || [];
      list.push(b);
      batchesByMedicine.set(b.medicineId, list);
    });

    // 2. Aggregate each medicine's stock and status
    let totalUnitsInBranch = 0;
    let totalInventoryValueDec = new Decimal(0);

    const aggregatedMedicines = medicines.map((med) => {
      const batches = batchesByMedicine.get(med.id) || [];
      const totalAvailableStock = batches.reduce((sum, b) => {
        // Exclude depleted or blocked batches if availableQuantity <= 0
        return sum + Math.max(0, b.availableQuantity);
      }, 0);

      const positiveBatches = batches.filter((b) => b.availableQuantity > 0);
      const activeBatchesCount = positiveBatches.length;
      const totalBatchesCount = batches.length;

      // Nearest expiry among positive-stock batches (FEFO)
      const sortedPositive = [...positiveBatches].sort(
        (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
      );
      const nearestBatch = sortedPositive[0] || null;
      const nearestExpiryDate = nearestBatch ? new Date(nearestBatch.expiryDate) : null;
      const nearestExpiryDays = nearestExpiryDate
        ? Math.ceil((nearestExpiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Expiry breakdown
      const hasExpiredPositiveBatch = positiveBatches.some((b) => new Date(b.expiryDate) <= now);
      const hasExpiring30PositiveBatch = positiveBatches.some(
        (b) => new Date(b.expiryDate) > now && new Date(b.expiryDate) <= in30Days
      );
      const hasExpiring60PositiveBatch = positiveBatches.some(
        (b) => new Date(b.expiryDate) > now && new Date(b.expiryDate) <= in60Days
      );
      const hasExpiring90PositiveBatch = positiveBatches.some(
        (b) => new Date(b.expiryDate) > now && new Date(b.expiryDate) <= in90Days
      );
      const hasExpiring180PositiveBatch = positiveBatches.some(
        (b) => new Date(b.expiryDate) > now && new Date(b.expiryDate) <= in180Days
      );

      // Stock status
      const reorderLevel = med.reorderLevel ?? 10;
      let stockStatusClass: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' = 'IN_STOCK';
      if (totalAvailableStock === 0) {
        stockStatusClass = 'OUT_OF_STOCK';
      } else if (totalAvailableStock <= reorderLevel) {
        stockStatusClass = 'LOW_STOCK';
      } else {
        stockStatusClass = 'IN_STOCK';
      }

      // Expiry status
      let expiryStatusClass: 'NORMAL' | 'NEAR_EXPIRY' | 'EXPIRED' | 'NO_EXPIRY' = 'NORMAL';
      if (positiveBatches.length === 0) {
        expiryStatusClass = 'NORMAL';
      } else if (hasExpiredPositiveBatch) {
        expiryStatusClass = 'EXPIRED';
      } else if (hasExpiring60PositiveBatch) {
        expiryStatusClass = 'NEAR_EXPIRY';
      } else {
        expiryStatusClass = 'NORMAL';
      }

      // Pack conversions
      const packInfo = formatPackConversion(
        totalAvailableStock,
        med.baseUnit || 'Strip',
        med.packageUnit || 'Box',
        med.conversionFactor || 10
      );

      // Inventory valuation from batches
      batches.forEach((b) => {
        if (b.availableQuantity > 0) {
          totalUnitsInBranch += b.availableQuantity;
          totalInventoryValueDec = totalInventoryValueDec.plus(
            new Decimal(b.availableQuantity).times(b.purchaseRate || 0)
          );
        }
      });

      const lastMov = lastMovementMap.get(med.id);

      return {
        medicineId: med.id,
        internalCode: med.internalCode,
        medicineName: med.brandName,
        genericName: med.genericName,
        strength: med.strength,
        dosageForm: med.dosageForm,
        manufacturer: med.manufacturer,
        packSize: med.packSize,
        baseUnit: med.baseUnit || 'Strip',
        packageUnit: med.packageUnit || 'Box',
        conversionFactor: med.conversionFactor || 10,
        hsnCode: med.hsnCode,
        gstRate: med.gstRate,
        mrp: med.mrp,
        defaultPurchaseRate: med.defaultPurchaseRate,
        defaultSellingRate: med.defaultSellingRate,
        reorderLevel: med.reorderLevel,
        hasConfiguredReorderLevel: med.reorderLevel !== null && med.reorderLevel !== undefined,
        totalAvailableStock,
        batchCount: totalBatchesCount,
        activeBatchCount: activeBatchesCount,
        nearestExpiry: nearestExpiryDate ? nearestExpiryDate.toISOString() : null,
        nearestExpiryDays,
        stockStatus: stockStatusClass,
        expiryStatus: expiryStatusClass,
        hasExpiredPositiveBatch,
        hasExpiring30PositiveBatch,
        hasExpiring60PositiveBatch,
        hasExpiring90PositiveBatch,
        hasExpiring180PositiveBatch,
        packConversion: packInfo,
        lastStockMovement: lastMov ? lastMov.date.toISOString() : null,
        lastStockMovementType: lastMov ? lastMov.type : null,
        supplierIds: batches.map((b) => b.supplierId).filter(Boolean),
        batchNumbers: batches.map((b) => b.batchNumber),
      };
    });

    // 3. Compute Summary Dashboard Metrics (Part 3.3)
    const uniqueMedicinesWithRecords = aggregatedMedicines.filter((m) => m.batchCount > 0 || m.lastStockMovement !== null);
    const uniqueMedicinesCount = uniqueMedicinesWithRecords.length;
    const inStockMedicinesCount = uniqueMedicinesWithRecords.filter((m) => m.totalAvailableStock > 0).length;
    const outOfStockMedicinesCount = uniqueMedicinesWithRecords.filter((m) => m.totalAvailableStock === 0).length;
    const lowStockMedicinesCount = uniqueMedicinesWithRecords.filter((m) => m.stockStatus === 'LOW_STOCK').length;
    const nearExpiryMedicinesCount = uniqueMedicinesWithRecords.filter((m) => m.hasExpiring60PositiveBatch).length;
    const expiredMedicinesCount = uniqueMedicinesWithRecords.filter((m) => m.hasExpiredPositiveBatch).length;

    const metrics = {
      uniqueMedicines: uniqueMedicinesCount,
      inStockMedicines: inStockMedicinesCount,
      outOfStockMedicines: outOfStockMedicinesCount,
      lowStockMedicines: lowStockMedicinesCount,
      nearExpiryMedicines: nearExpiryMedicinesCount,
      expiredStockMedicines: expiredMedicinesCount,
      totalUnitsInStock: totalUnitsInBranch,
      totalInventoryValue: totalInventoryValueDec.toDecimalPlaces(2).toNumber(),
      selectedBranchId: targetBranchId,
      branchName: branch?.name || 'All Branches',
      branchCode: branch?.code || 'ALL',
    };

    // 4. Apply Filters (Part 5)
    // If a search query is provided, search across all catalogue medicines so users can monitor any product
    const hasSearchQuery = Boolean(search && typeof search === 'string' && search.trim());
    let filtered = hasSearchQuery ? aggregatedMedicines : uniqueMedicinesWithRecords;

    // Search query
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((m) => {
        return (
          m.medicineName.toLowerCase().includes(q) ||
          m.genericName.toLowerCase().includes(q) ||
          m.internalCode.toLowerCase().includes(q) ||
          m.manufacturer.toLowerCase().includes(q) ||
          m.strength.toLowerCase().includes(q) ||
          m.batchNumbers.some((bn) => bn.toLowerCase().includes(q))
        );
      });
    }

    // Stock Status filter
    if (stockStatus && stockStatus !== 'ALL') {
      if (stockStatus === 'IN_STOCK') {
        filtered = filtered.filter((m) => m.totalAvailableStock > 0);
      } else if (stockStatus === 'LOW_STOCK') {
        filtered = filtered.filter((m) => m.stockStatus === 'LOW_STOCK');
      } else if (stockStatus === 'OUT_OF_STOCK') {
        filtered = filtered.filter((m) => m.totalAvailableStock === 0);
      } else if (stockStatus === 'NO_REORDER') {
        filtered = filtered.filter((m) => !m.hasConfiguredReorderLevel);
      }
    }

    // Expiry Status filter
    if (expiryStatus && expiryStatus !== 'ALL') {
      if (expiryStatus === 'EXPIRING_30') {
        filtered = filtered.filter((m) => m.hasExpiring30PositiveBatch);
      } else if (expiryStatus === 'EXPIRING_60') {
        filtered = filtered.filter((m) => m.hasExpiring60PositiveBatch);
      } else if (expiryStatus === 'EXPIRING_90') {
        filtered = filtered.filter((m) => m.hasExpiring90PositiveBatch);
      } else if (expiryStatus === 'EXPIRING_180') {
        filtered = filtered.filter((m) => m.hasExpiring180PositiveBatch);
      } else if (expiryStatus === 'EXPIRED') {
        filtered = filtered.filter((m) => m.hasExpiredPositiveBatch);
      } else if (expiryStatus === 'SAFE_SHELF') {
        filtered = filtered.filter(
          (m) => m.totalAvailableStock > 0 && !m.hasExpiring180PositiveBatch && !m.hasExpiredPositiveBatch
        );
      }
    }

    // Dosage Form filter
    if (dosageForm && typeof dosageForm === 'string' && dosageForm.trim()) {
      const df = dosageForm.trim().toLowerCase();
      filtered = filtered.filter((m) => m.dosageForm.toLowerCase() === df);
    }

    // Manufacturer filter
    if (manufacturer && typeof manufacturer === 'string' && manufacturer.trim()) {
      const mfg = manufacturer.trim().toLowerCase();
      filtered = filtered.filter((m) => m.manufacturer.toLowerCase() === mfg);
    }

    // Generic Name filter
    if (genericName && typeof genericName === 'string' && genericName.trim()) {
      const gen = genericName.trim().toLowerCase();
      filtered = filtered.filter((m) => m.genericName.toLowerCase().includes(gen));
    }

    // Supplier filter
    if (supplierId && typeof supplierId === 'string' && supplierId.trim()) {
      filtered = filtered.filter((m) => m.supplierIds.includes(supplierId.trim()));
    }

    // Batch Number filter
    if (batchNumber && typeof batchNumber === 'string' && batchNumber.trim()) {
      const bn = batchNumber.trim().toLowerCase();
      filtered = filtered.filter((m) => m.batchNumbers.some((b) => b.toLowerCase().includes(bn)));
    }

    // Quantity range filters
    if (minQuantity !== undefined && minQuantity !== '') {
      const min = parseInt(minQuantity as string, 10);
      if (!isNaN(min)) filtered = filtered.filter((m) => m.totalAvailableStock >= min);
    }
    if (maxQuantity !== undefined && maxQuantity !== '') {
      const max = parseInt(maxQuantity as string, 10);
      if (!isNaN(max)) filtered = filtered.filter((m) => m.totalAvailableStock <= max);
    }

    // 5. Sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'stock':
          comparison = a.totalAvailableStock - b.totalAvailableStock;
          break;
        case 'expiry':
          const expA = a.nearestExpiry ? new Date(a.nearestExpiry).getTime() : 9999999999999;
          const expB = b.nearestExpiry ? new Date(b.nearestExpiry).getTime() : 9999999999999;
          comparison = expA - expB;
          break;
        case 'batchCount':
          comparison = a.batchCount - b.batchCount;
          break;
        case 'lastMovement':
          const movA = a.lastStockMovement ? new Date(a.lastStockMovement).getTime() : 0;
          const movB = b.lastStockMovement ? new Date(b.lastStockMovement).getTime() : 0;
          comparison = movA - movB;
          break;
        case 'name':
        default:
          comparison = a.medicineName.localeCompare(b.medicineName);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // 6. Pagination
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / limitNum) || 1;
    const paginatedItems = filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    return res.json({
      metrics,
      items: paginatedItems,
      pagination: {
        totalItems,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
      },
    });
  } catch (error: any) {
    console.error('[STOCK_MONITORING_ERROR]', error);
    return res.status(500).json({ message: 'Failed to query stock monitoring inventory' });
  }
};

/**
 * Detailed Batch-Level Drill-Down (Part 6)
 * Strict Read-Only endpoint returning all batches for a specific medicine in FEFO order.
 */
export const getMedicineBatches = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const medicineId = req.params.medicineId as string;
    const { branchId } = req.query;

    let targetBranchId: string | null = null;
    if (req.user.role === 'SUPER_ADMIN') {
      targetBranchId = (branchId && typeof branchId === 'string' && branchId.trim())
        ? branchId.trim()
        : (req.user.branchId || null);
    } else {
      if (branchId && typeof branchId === 'string' && branchId.trim() && branchId.trim() !== req.user.branchId) {
        return res.status(403).json({ message: 'You are not authorized to access another branch inventory' });
      }
      targetBranchId = req.user.branchId || null;
    }

    if (!targetBranchId) {
      const firstBranch = await prisma.branch.findFirst({ where: { isActive: true }, select: { id: true } });
      if (firstBranch) targetBranchId = firstBranch.id;
    }

    const [medicine, batches] = await Promise.all([
      prisma.medicineProduct.findUnique({
        where: { id: medicineId },
      }),
      prisma.stockBatch.findMany({
        where: {
          medicineId,
          ...(targetBranchId ? { branchId: targetBranchId } : {}),
        },
        include: {
          supplier: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, code: true, name: true } },
        },
        orderBy: { expiryDate: 'asc' }, // FEFO sorting
      }),
    ]);

    if (!medicine) {
      return res.status(404).json({ message: 'Medicine not found' });
    }

    const now = new Date();
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const mappedBatches = batches.map((b) => {
      const expiry = new Date(b.expiryDate);
      const isExpired = expiry <= now;
      const isNearExpiry = !isExpired && expiry <= in60Days;
      const daysToExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const packInfo = formatPackConversion(
        b.availableQuantity,
        medicine.baseUnit || 'Strip',
        medicine.packageUnit || 'Box',
        medicine.conversionFactor || 10
      );

      let expiryClassification: 'NORMAL' | 'NEAR_EXPIRY' | 'EXPIRED' = 'NORMAL';
      if (isExpired) expiryClassification = 'EXPIRED';
      else if (isNearExpiry) expiryClassification = 'NEAR_EXPIRY';

      const factor = medicine.conversionFactor && medicine.conversionFactor > 0 ? medicine.conversionFactor : 1;

      return {
        id: b.id,
        batchNumber: b.batchNumber,
        availableQuantity: b.availableQuantity,
        quantityReceived: b.quantityReceived,
        baseUnit: medicine.baseUnit || 'Strip',
        packageUnit: medicine.packageUnit || 'Box',
        conversionFactor: factor,
        equivalentPacksText: packInfo.equivalentPacksText,
        purchaseRate: b.purchaseRate,
        packPurchaseRate: new Decimal(b.purchaseRate).times(factor).toDecimalPlaces(2).toNumber(),
        mrp: b.mrp,
        packMrp: new Decimal(b.mrp).times(factor).toDecimalPlaces(2).toNumber(),
        sellingPrice: b.sellingPrice,
        receiptDate: b.receiptDate ? b.receiptDate.toISOString() : b.createdAt.toISOString(),
        expiryDate: b.expiryDate.toISOString(),
        daysToExpiry,
        status: b.status,
        stockStatus: b.availableQuantity > 0 ? 'IN_STOCK' : 'DEPLETED',
        expiryClassification,
        supplierId: b.supplierId,
        supplierName: b.supplier?.name || 'Direct Procurement / Not Specified',
        purchaseInvoiceRef: b.purchaseInvoiceRef,
        branchId: b.branchId,
        branchName: b.branch.name,
      };
    });

    const totalStock = mappedBatches.reduce((sum, b) => sum + Math.max(0, b.availableQuantity), 0);
    const summaryPack = formatPackConversion(
      totalStock,
      medicine.baseUnit || 'Strip',
      medicine.packageUnit || 'Box',
      medicine.conversionFactor || 10
    );

    return res.json({
      medicine: {
        id: medicine.id,
        internalCode: medicine.internalCode,
        brandName: medicine.brandName,
        genericName: medicine.genericName,
        strength: medicine.strength,
        dosageForm: medicine.dosageForm,
        manufacturer: medicine.manufacturer,
        packSize: medicine.packSize,
        baseUnit: medicine.baseUnit || 'Strip',
        packageUnit: medicine.packageUnit || 'Box',
        conversionFactor: medicine.conversionFactor || 10,
        mrp: medicine.mrp,
        reorderLevel: medicine.reorderLevel,
        hsnCode: medicine.hsnCode,
        gstRate: medicine.gstRate,
        totalAvailableStock: totalStock,
        equivalentPacksText: summaryPack.equivalentPacksText,
        batchCount: mappedBatches.length,
      },
      batches: mappedBatches,
    });
  } catch (error: any) {
    console.error('[MEDICINE_BATCHES_ERROR]', error);
    return res.status(500).json({ message: 'Failed to fetch batch-level stock details' });
  }
};

/**
 * Filter Options Endpoint (Part 5)
 * Dynamically returns available manufacturers, dosage forms, and suppliers for the branch.
 */
export const getStockMonitoringFilterOptions = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId } = req.query;
    let targetBranchId: string | null = null;
    if (req.user.role === 'SUPER_ADMIN') {
      targetBranchId = (branchId && typeof branchId === 'string' && branchId.trim())
        ? branchId.trim()
        : null;
    } else {
      targetBranchId = req.user.branchId || null;
    }

    const [manufacturers, dosageForms, suppliers] = await Promise.all([
      prisma.medicineProduct.findMany({
        where: { isActive: true },
        select: { manufacturer: true },
        distinct: ['manufacturer'],
      }),
      prisma.medicineProduct.findMany({
        where: { isActive: true },
        select: { dosageForm: true },
        distinct: ['dosageForm'],
      }),
      prisma.supplier.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return res.json({
      manufacturers: manufacturers.map((m) => m.manufacturer).filter(Boolean).sort(),
      dosageForms: dosageForms.map((d) => d.dosageForm).filter(Boolean).sort(),
      suppliers,
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to load filter options' });
  }
};

/**
 * Stock Alerts & Monitoring Insights (Part 7)
 * Strictly read-only alerts for out of stock, low stock, near expiry, and expired stock.
 */
export const getStockMonitoringAlerts = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId } = req.query;
    let targetBranchId: string | null = null;
    if (req.user.role === 'SUPER_ADMIN') {
      targetBranchId = (branchId && typeof branchId === 'string' && branchId.trim())
        ? branchId.trim()
        : (req.user.branchId || null);
    } else {
      if (branchId && typeof branchId === 'string' && branchId.trim() && branchId.trim() !== req.user.branchId) {
        return res.status(403).json({ message: 'You are not authorized to access another branch inventory' });
      }
      targetBranchId = req.user.branchId || null;
    }

    if (!targetBranchId) {
      const firstBranch = await prisma.branch.findFirst({ where: { isActive: true }, select: { id: true } });
      if (firstBranch) targetBranchId = firstBranch.id;
    }

    const branch = targetBranchId
      ? await prisma.branch.findUnique({ where: { id: targetBranchId }, select: { name: true } })
      : null;
    const branchName = branch?.name || 'Local Branch';

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const [medicines, branchBatches] = await Promise.all([
      prisma.medicineProduct.findMany({
        where: { isActive: true },
        select: {
          id: true,
          brandName: true,
          genericName: true,
          strength: true,
          dosageForm: true,
          baseUnit: true,
          reorderLevel: true,
        },
      }),
      targetBranchId
        ? prisma.stockBatch.findMany({
            where: { branchId: targetBranchId },
            include: { medicine: true },
            orderBy: { expiryDate: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    const batchesByMed = new Map<string, typeof branchBatches>();
    branchBatches.forEach((b) => {
      const list = batchesByMed.get(b.medicineId) || [];
      list.push(b);
      batchesByMed.set(b.medicineId, list);
    });

    const alerts: any[] = [];

    // 1. Batch-level alerts: Expired with positive stock & near expiry
    branchBatches.forEach((b) => {
      if (b.availableQuantity <= 0) return;

      const expDate = new Date(b.expiryDate);
      const daysLeft = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (expDate <= now) {
        alerts.push({
          id: `EXP-${b.id}`,
          category: 'EXPIRED_STOCK',
          severity: 'CRITICAL',
          title: 'Expired Stock in Inventory',
          medicineName: `${b.medicine.brandName} ${b.medicine.strength}`,
          medicineId: b.medicineId,
          batchNumber: b.batchNumber,
          affectedQuantity: b.availableQuantity,
          baseUnit: b.medicine.baseUnit || 'Strip',
          thresholdOrExpiry: expDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }),
          daysLeft,
          branchName,
          recommendedAction: 'Quarantine immediately. Do not dispense. Arrange supplier return or authorized biomedical destruction.',
        });
      } else if (expDate <= in30Days) {
        alerts.push({
          id: `EXP30-${b.id}`,
          category: 'NEAR_EXPIRY_30',
          severity: 'HIGH',
          title: 'Expiring Within 30 Days',
          medicineName: `${b.medicine.brandName} ${b.medicine.strength}`,
          medicineId: b.medicineId,
          batchNumber: b.batchNumber,
          affectedQuantity: b.availableQuantity,
          baseUnit: b.medicine.baseUnit || 'Strip',
          thresholdOrExpiry: expDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }),
          daysLeft,
          branchName,
          recommendedAction: 'Prioritize dispensing via FEFO counter protocols or request stock return/exchange with supplier.',
        });
      } else if (expDate <= in60Days) {
        alerts.push({
          id: `EXP60-${b.id}`,
          category: 'NEAR_EXPIRY_60',
          severity: 'MEDIUM',
          title: 'Expiring Within 60 Days',
          medicineName: `${b.medicine.brandName} ${b.medicine.strength}`,
          medicineId: b.medicineId,
          batchNumber: b.batchNumber,
          affectedQuantity: b.availableQuantity,
          baseUnit: b.medicine.baseUnit || 'Strip',
          thresholdOrExpiry: expDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }),
          daysLeft,
          branchName,
          recommendedAction: 'Monitor run-rate and adjust reorder quantities to avoid excess shelf expiration.',
        });
      } else if (expDate <= in90Days) {
        alerts.push({
          id: `EXP90-${b.id}`,
          category: 'NEAR_EXPIRY_90',
          severity: 'LOW',
          title: 'Expiring Within 90 Days',
          medicineName: `${b.medicine.brandName} ${b.medicine.strength}`,
          medicineId: b.medicineId,
          batchNumber: b.batchNumber,
          affectedQuantity: b.availableQuantity,
          baseUnit: b.medicine.baseUnit || 'Strip',
          thresholdOrExpiry: expDate.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }),
          daysLeft,
          branchName,
          recommendedAction: 'Plan promotional movement or inter-branch transfer to high-volume branches.',
        });
      }
    });

    // 2. Product-level alerts: Out of Stock & Low Stock
    medicines.forEach((med) => {
      const bList = batchesByMed.get(med.id) || [];
      const totalStock = bList.reduce((sum, b) => sum + Math.max(0, b.availableQuantity), 0);
      const reorderLevel = med.reorderLevel ?? 10;

      if (bList.length > 0 && totalStock === 0) {
        alerts.push({
          id: `OOS-${med.id}`,
          category: 'OUT_OF_STOCK',
          severity: 'HIGH',
          title: 'Out of Stock',
          medicineName: `${med.brandName} ${med.strength}`,
          medicineId: med.id,
          batchNumber: null,
          affectedQuantity: 0,
          baseUnit: med.baseUnit || 'Strip',
          thresholdOrExpiry: `Reorder Level: ${reorderLevel} ${med.baseUnit || 'Strip'}s`,
          daysLeft: null,
          branchName,
          recommendedAction: 'Create purchase indent immediately to avoid customer stock-outs at retail billing.',
        });
      } else if (totalStock > 0 && totalStock <= reorderLevel) {
        alerts.push({
          id: `LOW-${med.id}`,
          category: 'LOW_STOCK',
          severity: 'MEDIUM',
          title: 'Low Stock Threshold Reached',
          medicineName: `${med.brandName} ${med.strength}`,
          medicineId: med.id,
          batchNumber: null,
          affectedQuantity: totalStock,
          baseUnit: med.baseUnit || 'Strip',
          thresholdOrExpiry: `Threshold: ${reorderLevel} ${med.baseUnit || 'Strip'}s`,
          daysLeft: null,
          branchName,
          recommendedAction: `Current stock (${totalStock} ${med.baseUnit || 'Strip'}s) is below configured minimum (${reorderLevel}). Generate replenishment order.`,
        });
      } else if (bList.length > 0 && (med.reorderLevel === null || med.reorderLevel === undefined)) {
        alerts.push({
          id: `NOREORDER-${med.id}`,
          category: 'NO_REORDER_LEVEL',
          severity: 'INFO',
          title: 'Missing Reorder Level',
          medicineName: `${med.brandName} ${med.strength}`,
          medicineId: med.id,
          batchNumber: null,
          affectedQuantity: totalStock,
          baseUnit: med.baseUnit || 'Strip',
          thresholdOrExpiry: 'Unset',
          daysLeft: null,
          branchName,
          recommendedAction: 'Configure reorder threshold in medicine catalogue to enable automated buffer tracking.',
        });
      }
    });

    return res.json({
      totalAlerts: alerts.length,
      branchName,
      alerts,
    });
  } catch (error: any) {
    console.error('[STOCK_ALERTS_ERROR]', error);
    return res.status(500).json({ message: 'Failed to query stock monitoring alerts' });
  }
};
