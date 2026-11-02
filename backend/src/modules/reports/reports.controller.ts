import { Request, Response } from 'express';
import Decimal from 'decimal.js';
import * as xlsx from 'xlsx';
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

export const getProfitLossReport = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing cashiers are not authorized to view Profit & Loss reports.' });
    }

    const { branchId, startDate, endDate } = req.query;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    let start: Date;
    let end: Date;

    if (startDate) {
      start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
    } else {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    if (endDate) {
      end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
    } else {
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }

    const branchFilter = targetBranchId ? { branchId: targetBranchId } : {};

    const [salesInvoices, cancelledInvoices, purchaseReturns, expenses, purchases] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: {
          ...branchFilter,
          status: 'COMPLETED',
          createdAt: { gte: start, lte: end },
        },
        include: {
          lines: {
            include: {
              medicine: { select: { id: true, brandName: true, genericName: true, defaultPurchaseRate: true } },
            },
          },
        },
      }),
      prisma.salesInvoice.findMany({
        where: {
          ...branchFilter,
          status: 'CANCELLED',
          cancelledAt: { gte: start, lte: end },
        },
      }),
      prisma.purchaseReturn.findMany({
        where: {
          ...branchFilter,
          returnDate: { gte: start, lte: end },
        },
      }),
      prisma.expense.findMany({
        where: {
          ...branchFilter,
          expenseDate: { gte: start, lte: end },
        },
      }),
      prisma.purchaseInvoice.findMany({
        where: {
          ...branchFilter,
          status: 'RECEIVED',
          invoiceDate: { gte: start, lte: end },
        },
        include: {
          lines: true,
        },
      }),
    ]);

    let grossSalesDec = new Decimal(0);
    let totalSalesDiscountsDec = new Decimal(0);
    let totalSalesTaxDec = new Decimal(0);
    let cogsDec = new Decimal(0);
    let missingCostLinesCount = 0;

    const paymentBreakdown: Record<string, number> = { CASH: 0, UPI: 0, CARD: 0, MIXED: 0, CREDIT: 0 };
    const productProfitMap: Record<string, { brandName: string; quantitySold: number; revenue: Decimal; cogs: Decimal }> = {};

    for (const inv of salesInvoices) {
      let invGross = new Decimal(0);
      for (const line of inv.lines) {
        const lineGross = new Decimal(line.unitMrp).times(line.quantity);
        invGross = invGross.plus(lineGross);

        let unitCost = line.purchaseRate;
        if (unitCost === null || unitCost === undefined) {
          if (line.medicine?.defaultPurchaseRate) {
            unitCost = line.medicine.defaultPurchaseRate;
          } else {
            missingCostLinesCount++;
            unitCost = 0;
          }
        }

        const lineCogs = new Decimal(unitCost).times(line.quantity);
        cogsDec = cogsDec.plus(lineCogs);

        const pKey = line.medicineId;
        if (!productProfitMap[pKey]) {
          productProfitMap[pKey] = {
            brandName: line.medicineName,
            quantitySold: 0,
            revenue: new Decimal(0),
            cogs: new Decimal(0),
          };
        }
        productProfitMap[pKey].quantitySold += line.quantity;
        productProfitMap[pKey].revenue = productProfitMap[pKey].revenue.plus(line.lineTotal);
        productProfitMap[pKey].cogs = productProfitMap[pKey].cogs.plus(lineCogs);
      }

      grossSalesDec = grossSalesDec.plus(invGross);
      totalSalesDiscountsDec = totalSalesDiscountsDec.plus(inv.discountTotal);
      totalSalesTaxDec = totalSalesTaxDec.plus(inv.taxTotal);

      paymentBreakdown[inv.paymentMethod] = (paymentBreakdown[inv.paymentMethod] || 0) + inv.grandTotal;
    }

    const topProducts = Object.values(productProfitMap)
      .map((p) => ({
        brandName: p.brandName,
        quantitySold: p.quantitySold,
        revenue: p.revenue.toDecimalPlaces(2).toNumber(),
        cogs: p.cogs.toDecimalPlaces(2).toNumber(),
        grossProfit: p.revenue.minus(p.cogs).toDecimalPlaces(2).toNumber(),
        marginPercent: p.revenue.greaterThan(0)
          ? p.revenue.minus(p.cogs).dividedBy(p.revenue).times(100).toDecimalPlaces(1).toNumber()
          : 0,
      }))
      .sort((a, b) => b.grossProfit - a.grossProfit)
      .slice(0, 10);

    let salesReturnsDec = new Decimal(0);
    for (const cinv of cancelledInvoices) {
      salesReturnsDec = salesReturnsDec.plus(cinv.grandTotal);
    }

    const netBilledSalesDec = salesInvoices.reduce((acc, inv) => acc.plus(inv.grandTotal), new Decimal(0));
    const netSalesDec = netBilledSalesDec.minus(salesReturnsDec);

    const grossProfitDec = netSalesDec.minus(cogsDec);
    const grossMarginPct = netSalesDec.greaterThan(0)
      ? grossProfitDec.dividedBy(netSalesDec).times(100).toDecimalPlaces(2).toNumber()
      : 0;

    let totalOperatingExpensesDec = new Decimal(0);
    const expenseBreakdown: Record<string, number> = {};

    for (const exp of expenses) {
      const expAmt = new Decimal(exp.amount);
      totalOperatingExpensesDec = totalOperatingExpensesDec.plus(expAmt);
      expenseBreakdown[exp.category] = (expenseBreakdown[exp.category] || 0) + exp.amount;
    }

    const netProfitDec = grossProfitDec.minus(totalOperatingExpensesDec);
    const netProfitMarginPct = netSalesDec.greaterThan(0)
      ? netProfitDec.dividedBy(netSalesDec).times(100).toDecimalPlaces(2).toNumber()
      : 0;

    let totalPurchasesPeriodDec = new Decimal(0);
    let totalPurchaseDiscountsPeriodDec = new Decimal(0);
    let totalPurchaseTaxPeriodDec = new Decimal(0);
    let totalPurchasePaidDec = new Decimal(0);
    let totalPurchaseOutstandingDec = new Decimal(0);

    for (const pur of purchases) {
      totalPurchasesPeriodDec = totalPurchasesPeriodDec.plus(pur.grandTotal);
      totalPurchaseDiscountsPeriodDec = totalPurchaseDiscountsPeriodDec.plus(pur.discountTotal || 0);
      totalPurchaseTaxPeriodDec = totalPurchaseTaxPeriodDec.plus(pur.taxTotal);
      totalPurchasePaidDec = totalPurchasePaidDec.plus(pur.paidAmount || 0);
      totalPurchaseOutstandingDec = totalPurchaseOutstandingDec.plus(pur.outstandingAmount || 0);
    }

    let totalPurchaseReturnsPeriodDec = new Decimal(0);
    for (const pret of purchaseReturns) {
      totalPurchaseReturnsPeriodDec = totalPurchaseReturnsPeriodDec.plus(pret.grandTotal);
    }

    return res.json({
      period: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      },
      summary: {
        grossSales: grossSalesDec.toDecimalPlaces(2).toNumber(),
        salesDiscounts: totalSalesDiscountsDec.toDecimalPlaces(2).toNumber(),
        salesReturns: salesReturnsDec.toDecimalPlaces(2).toNumber(),
        netSales: netSalesDec.toDecimalPlaces(2).toNumber(),
        costOfGoodsSold: cogsDec.toDecimalPlaces(2).toNumber(),
        grossProfit: grossProfitDec.toDecimalPlaces(2).toNumber(),
        grossMarginPercent: grossMarginPct,
        operatingExpenses: totalOperatingExpensesDec.toDecimalPlaces(2).toNumber(),
        netProfit: netProfitDec.toDecimalPlaces(2).toNumber(),
        netProfitMarginPercent: netProfitMarginPct,
      },
      inventoryPurchasesSummary: {
        totalPurchases: totalPurchasesPeriodDec.toDecimalPlaces(2).toNumber(),
        purchaseDiscounts: totalPurchaseDiscountsPeriodDec.toDecimalPlaces(2).toNumber(),
        purchaseTaxes: totalPurchaseTaxPeriodDec.toDecimalPlaces(2).toNumber(),
        purchaseReturns: totalPurchaseReturnsPeriodDec.toDecimalPlaces(2).toNumber(),
        paidAmount: totalPurchasePaidDec.toDecimalPlaces(2).toNumber(),
        outstandingAmount: totalPurchaseOutstandingDec.toDecimalPlaces(2).toNumber(),
        note: 'Purchases represent stock asset acquisitions, not Cost of Goods Sold. COGS accounts strictly for inventory sold.',
      },
      expenseBreakdown,
      paymentBreakdown,
      topProducts,
      counts: {
        completedInvoices: salesInvoices.length,
        cancelledInvoices: cancelledInvoices.length,
        purchasesCount: purchases.length,
        expensesCount: expenses.length,
        missingCostLinesCount,
      },
    });
  } catch (error: any) {
    console.error('Profit & Loss calculation error:', error);
    return res.status(500).json({ message: error.message || 'Failed to generate Profit & Loss report' });
  }
};

/**
 * Product-wise Profitability & Margin Analysis (with Excel export and zero duplicates)
 * Columns: Medicine Name, Units Sold, Sales Revenue, Acquisition COGS, Gross Profit, Gross Margin %
 */
export const getProductProfitabilityReport = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users are not authorized to view margin analytics.' });
    }

    const { branchId, startDate, endDate, search, sortBy = 'grossProfit', sortOrder = 'desc', format } = req.query;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    let start: Date;
    let end: Date;

    if (startDate) {
      start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
    } else {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    if (endDate) {
      end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
    } else {
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }

    const invoiceWhere: any = {
      status: 'COMPLETED',
      createdAt: { gte: start, lte: end },
    };
    if (targetBranchId) invoiceWhere.branchId = targetBranchId;

    const invoiceLines = await prisma.salesInvoiceLine.findMany({
      where: {
        invoice: invoiceWhere,
      },
      include: {
        medicine: {
          select: {
            id: true,
            brandName: true,
            genericName: true,
            defaultPurchaseRate: true,
          },
        },
      },
    });

    // Group strictly by normalized unique Medicine Name (prevents duplicate rows)
    const productMap = new Map<string, {
      medicineName: string;
      unitsSold: number;
      revenue: Decimal;
      cogs: Decimal;
    }>();

    for (const line of invoiceLines) {
      const uniqueName = (line.medicine?.brandName || line.medicineName || 'Unknown Medicine').trim();
      const mapKey = uniqueName.toLowerCase();

      if (!productMap.has(mapKey)) {
        productMap.set(mapKey, {
          medicineName: uniqueName,
          unitsSold: 0,
          revenue: new Decimal(0),
          cogs: new Decimal(0),
        });
      }

      const item = productMap.get(mapKey)!;
      item.unitsSold += line.quantity;
      item.revenue = item.revenue.plus(line.lineTotal);

      let unitCost = line.purchaseRate;
      if (unitCost === null || unitCost === undefined) {
        unitCost = line.medicine?.defaultPurchaseRate || 0;
      }
      const lineCogs = new Decimal(unitCost).times(line.quantity);
      item.cogs = item.cogs.plus(lineCogs);
    }

    let items = Array.from(productMap.values()).map((p) => {
      const grossProfitDec = p.revenue.minus(p.cogs);
      const grossMarginPct = p.revenue.greaterThan(0)
        ? grossProfitDec.dividedBy(p.revenue).times(100).toDecimalPlaces(2).toNumber()
        : 0;

      return {
        medicineName: p.medicineName,
        unitsSold: p.unitsSold,
        salesRevenue: p.revenue.toDecimalPlaces(2).toNumber(),
        acquisitionCOGS: p.cogs.toDecimalPlaces(2).toNumber(),
        grossProfit: grossProfitDec.toDecimalPlaces(2).toNumber(),
        grossMarginPercent: grossMarginPct,
      };
    });

    // Optional text filter
    if (search) {
      const q = (search as string).toLowerCase().trim();
      items = items.filter((it) => it.medicineName.toLowerCase().includes(q));
    }

    // Dynamic sorting
    items.sort((a: any, b: any) => {
      const fieldA = a[sortBy as string] ?? a.grossProfit;
      const fieldB = b[sortBy as string] ?? b.grossProfit;
      return sortOrder === 'asc' ? fieldA - fieldB : fieldB - fieldA;
    });

    // Total summary metrics
    const totalUnitsSold = items.reduce((acc, it) => acc + it.unitsSold, 0);
    const totalRevenue = items.reduce((acc, it) => acc + it.salesRevenue, 0);
    const totalCOGS = items.reduce((acc, it) => acc + it.acquisitionCOGS, 0);
    const totalGrossProfit = totalRevenue - totalCOGS;
    const overallMarginPercent = totalRevenue > 0
      ? Number(((totalGrossProfit / totalRevenue) * 100).toFixed(2))
      : 0;

    // Excel export format
    if (format === 'xlsx') {
      const exportRows = items.map((it) => ({
        'Medicine Name': it.medicineName,
        'Units Sold': it.unitsSold,
        'Sales Revenue': it.salesRevenue,
        'Acquisition COGS': it.acquisitionCOGS,
        'Gross Profit': it.grossProfit,
        'Gross Margin %': `${it.grossMarginPercent}%`,
      }));

      const worksheet = xlsx.utils.json_to_sheet(exportRows);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Product_Profitability');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="confidos_product_profitability_${new Date().toISOString().split('T')[0]}.xlsx"`);
      return res.send(buffer);
    }

    return res.json({
      summary: {
        totalUnitsSold,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalCOGS: Number(totalCOGS.toFixed(2)),
        totalGrossProfit: Number(totalGrossProfit.toFixed(2)),
        overallMarginPercent,
        uniqueProductsCount: items.length,
      },
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      items,
    });
  } catch (error: any) {
    console.error('Product profitability report error:', error);
    return res.status(500).json({ message: error.message || 'Failed to generate product profitability report' });
  }
};

export const getDateWiseStockReport = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId, startDate, endDate, search, export: isExport } = req.query;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) || undefined : req.user.branchId;

    const whereClause: any = {};
    if (targetBranchId) whereClause.branchId = targetBranchId;

    if (startDate || endDate) {
      whereClause.receiptDate = {};
      if (startDate) {
        whereClause.receiptDate.gte = new Date(String(startDate));
      }
      if (endDate) {
        const endD = new Date(String(endDate));
        endD.setHours(23, 59, 59, 999);
        whereClause.receiptDate.lte = endD;
      }
    }

    if (search && String(search).trim()) {
      const q = String(search).trim();
      whereClause.OR = [
        { batchNumber: { contains: q, mode: 'insensitive' } },
        { medicine: { brandName: { contains: q, mode: 'insensitive' } } },
        { supplier: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const batches = await prisma.stockBatch.findMany({
      where: whereClause,
      include: {
        medicine: true,
        branch: { select: { id: true, code: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { receiptDate: 'desc' },
    });

    let totalUnitsUploaded = 0;
    let totalUnitsDispensed = 0;
    let totalUnitsRemaining = 0;
    let totalUploadedCost = 0;
    let totalRemainingValue = 0;

    const items = batches.map((b) => {
      const uploaded = b.quantityReceived || 0;
      const remaining = b.availableQuantity || 0;
      const dispensed = Math.max(0, uploaded - remaining);
      const rate = b.purchaseRate || 0;
      const mrp = b.mrp || 0;
      const uploadedCost = Number((uploaded * rate).toFixed(2));
      const remainingVal = Number((remaining * rate).toFixed(2));

      totalUnitsUploaded += uploaded;
      totalUnitsDispensed += dispensed;
      totalUnitsRemaining += remaining;
      totalUploadedCost += uploadedCost;
      totalRemainingValue += remainingVal;

      return {
        id: b.id,
        receiptDate: b.receiptDate ? b.receiptDate.toISOString() : b.createdAt.toISOString(),
        dateAdded: (b.receiptDate || b.createdAt).toISOString().split('T')[0],
        medicineId: b.medicineId,
        medicineName: b.medicine?.brandName || 'Unknown Medicine',
        genericName: b.medicine?.genericName || '',
        dosageForm: b.medicine?.dosageForm || 'Tablet',
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate ? b.expiryDate.toISOString().split('T')[0] : 'N/A',
        quantityUploaded: uploaded,
        quantityDispensed: dispensed,
        quantityRemaining: remaining,
        purchaseRate: rate,
        mrp,
        uploadedCost,
        remainingValue: remainingVal,
        supplierName: b.supplier?.name || (b.purchaseInvoiceRef ? `Ref: ${b.purchaseInvoiceRef}` : 'Initial Opening Stock'),
        branchId: b.branchId,
        branchName: b.branch?.name || '',
        status: b.status,
      };
    });

    if (isExport === 'true' || isExport === 'excel') {
      const exportRows = items.map((it) => ({
        'Date Added': it.dateAdded,
        'Medicine Name': it.medicineName,
        'Batch Number': it.batchNumber,
        'Expiry Date': it.expiryDate,
        'Uploaded / Received Qty': it.quantityUploaded,
        'Dispensed Qty': it.quantityDispensed,
        'Remaining Balance Qty': it.quantityRemaining,
        'Purchase Rate (Rs)': it.purchaseRate,
        'MRP (Rs)': it.mrp,
        'Uploaded Stock Cost (Rs)': it.uploadedCost,
        'Remaining Balance Value (Rs)': it.remainingValue,
        'Supplier / Reference': it.supplierName,
        'Branch': it.branchName,
        'Status': it.status,
      }));

      const worksheet = xlsx.utils.json_to_sheet(exportRows);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'DateWise_Stock');
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="confidos_datewise_stock_${new Date().toISOString().split('T')[0]}.xlsx"`);
      return res.send(buffer);
    }

    return res.json({
      summary: {
        totalBatches: items.length,
        totalUnitsUploaded,
        totalUnitsDispensed,
        totalUnitsRemaining,
        totalUploadedCost: Number(totalUploadedCost.toFixed(2)),
        totalRemainingValue: Number(totalRemainingValue.toFixed(2)),
      },
      items,
    });
  } catch (error: any) {
    console.error('Date-wise stock report error:', error);
    return res.status(500).json({ message: error.message || 'Failed to generate date-wise stock report' });
  }
};

