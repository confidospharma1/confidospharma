import { Request, Response } from 'express';
import Decimal from 'decimal.js';
import prisma from '../../database/prisma';

export const getDailySalesReport = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId, date } = req.query;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    const queryDate = date ? new Date(date as string) : new Date();
    const startOfDay = new Date(queryDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(queryDate);
    endOfDay.setHours(23, 59, 59, 999);

    const whereClause: any = {
      createdAt: { gte: startOfDay, lte: endOfDay },
      status: 'COMPLETED',
    };
    if (targetBranchId) whereClause.branchId = targetBranchId;

    const invoices = await prisma.salesInvoice.findMany({
      where: whereClause,
      include: {
        branch: { select: { name: true, code: true } },
      },
    });

    let totalSales = new Decimal(0);
    let totalTax = new Decimal(0);
    let totalDiscount = new Decimal(0);
    const paymentBreakdown: Record<string, number> = { CASH: 0, UPI: 0, CARD: 0, MIXED: 0 };

    for (const inv of invoices) {
      totalSales = totalSales.plus(inv.grandTotal);
      totalTax = totalTax.plus(inv.taxTotal);
      totalDiscount = totalDiscount.plus(inv.discountTotal);
      paymentBreakdown[inv.paymentMethod] = (paymentBreakdown[inv.paymentMethod] || 0) + inv.grandTotal;
    }

    return res.json({
      date: queryDate.toISOString().split('T')[0],
      totalInvoices: invoices.length,
      totalSales: totalSales.toNumber(),
      totalTax: totalTax.toNumber(),
      totalDiscount: totalDiscount.toNumber(),
      paymentBreakdown,
      invoices,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to generate daily sales report' });
  }
};

export const getStockValuationReport = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId } = req.query;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    const whereClause: any = {
      status: 'ACTIVE',
      availableQuantity: { gt: 0 },
    };
    if (targetBranchId) whereClause.branchId = targetBranchId;

    const batches = await prisma.stockBatch.findMany({
      where: whereClause,
      include: {
        medicine: true,
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    let totalPurchaseValue = new Decimal(0);
    let totalMrpValue = new Decimal(0);
    let totalUnits = 0;

    const items = batches.map((b) => {
      const pVal = new Decimal(b.purchaseRate).times(b.availableQuantity);
      const mVal = new Decimal(b.mrp).times(b.availableQuantity);
      totalPurchaseValue = totalPurchaseValue.plus(pVal);
      totalMrpValue = totalMrpValue.plus(mVal);
      totalUnits += b.availableQuantity;

      return {
        batchId: b.id,
        branch: b.branch.name,
        medicineName: b.medicine.brandName,
        genericName: b.medicine.genericName,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        quantity: b.availableQuantity,
        purchaseRate: b.purchaseRate,
        mrp: b.mrp,
        purchaseValue: pVal.toNumber(),
        mrpValue: mVal.toNumber(),
      };
    });

    return res.json({
      totalUnits,
      totalPurchaseValue: totalPurchaseValue.toNumber(),
      totalMrpValue: totalMrpValue.toNumber(),
      potentialMargin: totalMrpValue.minus(totalPurchaseValue).toNumber(),
      batchesCount: batches.length,
      items,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to generate stock valuation report' });
  }
};

export const getExpiryAlertsReport = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId, days = '60' } = req.query;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    const daysCount = parseInt(days as string);
    const now = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(now.getDate() + daysCount);

    const whereClause: any = {
      availableQuantity: { gt: 0 },
    };
    if (targetBranchId) whereClause.branchId = targetBranchId;

    const batches = await prisma.stockBatch.findMany({
      where: whereClause,
      include: {
        medicine: true,
        branch: { select: { name: true, code: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const expired: any[] = [];
    const nearExpiry: any[] = [];

    for (const b of batches) {
      const expDate = new Date(b.expiryDate);
      const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const formatted = {
        id: b.id,
        branch: b.branch.name,
        medicineName: b.medicine.brandName,
        genericName: b.medicine.genericName,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        daysRemaining: diffDays,
        quantity: b.availableQuantity,
        mrp: b.mrp,
        status: diffDays <= 0 ? 'EXPIRED' : 'NEAR_EXPIRY',
      };

      if (diffDays <= 0) {
        expired.push(formatted);
      } else if (diffDays <= daysCount) {
        nearExpiry.push(formatted);
      }
    }

    return res.json({
      totalExpired: expired.length,
      totalNearExpiry: nearExpiry.length,
      expired,
      nearExpiry,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to generate expiry report' });
  }
};

export const getGSTSummaryReport = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId, startDate, endDate } = req.query;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    const whereClause: any = {
      invoice: { status: 'COMPLETED' },
    };
    if (targetBranchId) whereClause.invoice.branchId = targetBranchId;

    if (startDate || endDate) {
      whereClause.invoice.createdAt = {};
      if (startDate) whereClause.invoice.createdAt.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        whereClause.invoice.createdAt.lte = end;
      }
    }

    const lines = await prisma.salesInvoiceLine.findMany({
      where: whereClause,
      include: {
        invoice: { select: { invoiceNumber: true, createdAt: true, branchId: true } },
      },
    });

    // Group by HSN & GST rate
    const hsnSummary: Record<string, any> = {};

    let totalTaxable = new Decimal(0);
    let totalCgst = new Decimal(0);
    let totalSgst = new Decimal(0);
    let totalAmount = new Decimal(0);

    for (const l of lines) {
      const key = `${l.hsnCode}_${l.gstRate}`;
      if (!hsnSummary[key]) {
        hsnSummary[key] = {
          hsnCode: l.hsnCode,
          gstRate: l.gstRate,
          taxableAmount: new Decimal(0),
          cgstAmount: new Decimal(0),
          sgstAmount: new Decimal(0),
          totalAmount: new Decimal(0),
        };
      }

      const taxable = new Decimal(l.unitRate).times(l.quantity);
      hsnSummary[key].taxableAmount = hsnSummary[key].taxableAmount.plus(taxable);
      hsnSummary[key].cgstAmount = hsnSummary[key].cgstAmount.plus(l.cgstAmount);
      hsnSummary[key].sgstAmount = hsnSummary[key].sgstAmount.plus(l.sgstAmount);
      hsnSummary[key].totalAmount = hsnSummary[key].totalAmount.plus(l.lineTotal);

      totalTaxable = totalTaxable.plus(taxable);
      totalCgst = totalCgst.plus(l.cgstAmount);
      totalSgst = totalSgst.plus(l.sgstAmount);
      totalAmount = totalAmount.plus(l.lineTotal);
    }

    const items = Object.values(hsnSummary).map((h: any) => ({
      hsnCode: h.hsnCode,
      gstRate: h.gstRate,
      taxableAmount: h.taxableAmount.toNumber(),
      cgstAmount: h.cgstAmount.toNumber(),
      sgstAmount: h.sgstAmount.toNumber(),
      totalTax: h.cgstAmount.plus(h.sgstAmount).toNumber(),
      totalAmount: h.totalAmount.toNumber(),
    }));

    return res.json({
      totalTaxable: totalTaxable.toNumber(),
      totalCgst: totalCgst.toNumber(),
      totalSgst: totalSgst.toNumber(),
      totalTax: totalCgst.plus(totalSgst).toNumber(),
      totalAmount: totalAmount.toNumber(),
      hsnRecords: items,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to generate GST report' });
  }
};

export const getCompanyOverview = async (req: Request, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Forbidden: Super Admin only' });
    }

    const branches = await prisma.branch.findMany({
      include: {
        _count: {
          select: {
            batches: true,
            salesInvoices: true,
            users: true,
          },
        },
      },
    });

    const [totalProducts, totalSuppliers, allSales] = await Promise.all([
      prisma.medicineProduct.count(),
      prisma.supplier.count(),
      prisma.salesInvoice.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { grandTotal: true },
        _count: { id: true },
      }),
    ]);

    // Branch-wise sales totals
    const branchStats = await Promise.all(
      branches.map(async (b) => {
        const sales = await prisma.salesInvoice.aggregate({
          where: { branchId: b.id, status: 'COMPLETED' },
          _sum: { grandTotal: true },
        });

        const nearExpiryCount = await prisma.stockBatch.count({
          where: {
            branchId: b.id,
            status: 'ACTIVE',
            availableQuantity: { gt: 0 },
            expiryDate: { lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) },
          },
        });

        return {
          id: b.id,
          code: b.code,
          name: b.name,
          totalSales: sales._sum.grandTotal || 0,
          totalBatches: b._count.batches,
          totalInvoices: b._count.salesInvoices,
          nearExpiryCount,
          usersCount: b._count.users,
        };
      })
    );

    return res.json({
      companyTotalSales: allSales._sum.grandTotal || 0,
      totalInvoices: allSales._count.id || 0,
      totalCatalogueProducts: totalProducts,
      totalSuppliers,
      branches: branchStats,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch company overview' });
  }
};
