import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { BarChart3, Download, Calendar, Filter, Receipt, Boxes, AlertTriangle, Search, X } from 'lucide-react';
import { Badge } from '../components/Badge';
import { FilterButton } from '../components/FilterButton';
import { FilterField, FilterSelect, FilterInput } from '../components/FilterControls';

export const ReportsPage: React.FC = () => {
  const { currentBranch, selectedBranchId } = useAuth();

  const [activeReport, setActiveReport] = useState<'DAILY_SALES' | 'VALUATION' | 'GST' | 'EXPIRY'>('DAILY_SALES');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);

  // Daily Sales Filters
  const [salesSearch, setSalesSearch] = useState('');
  const [salesPaymentFilter, setSalesPaymentFilter] = useState('');
  const [salesMinAmount, setSalesMinAmount] = useState('');
  const [salesMaxAmount, setSalesMaxAmount] = useState('');

  const activeSalesFilterCount = [salesPaymentFilter, salesMinAmount, salesMaxAmount].filter(Boolean).length;
  const resetSalesFilters = () => {
    setSalesPaymentFilter('');
    setSalesMinAmount('');
    setSalesMaxAmount('');
  };

  // Stock Valuation Filters
  const [valuationSearch, setValuationSearch] = useState('');
  const [valuationStockFilter, setValuationStockFilter] = useState('');
  const [valuationMinMrp, setValuationMinMrp] = useState('');
  const [valuationMaxMrp, setValuationMaxMrp] = useState('');

  const activeValuationFilterCount = [valuationStockFilter, valuationMinMrp, valuationMaxMrp].filter(Boolean).length;
  const resetValuationFilters = () => {
    setValuationStockFilter('');
    setValuationMinMrp('');
    setValuationMaxMrp('');
  };

  // GST Summary Filters
  const [gstSearch, setGstSearch] = useState('');
  const [gstRateFilter, setGstRateFilter] = useState('');

  const activeGstFilterCount = [gstRateFilter].filter(Boolean).length;
  const resetGstFilters = () => {
    setGstRateFilter('');
  };

  // Expiry Risk Filters
  const [expirySearch, setExpirySearch] = useState('');
  const [expiryStatusFilter, setExpiryStatusFilter] = useState('');

  const activeExpiryFilterCount = [expiryStatusFilter].filter(Boolean).length;
  const resetExpiryFilters = () => {
    setExpiryStatusFilter('');
  };

  const handleTabChange = (tab: 'DAILY_SALES' | 'VALUATION' | 'GST' | 'EXPIRY') => {
    if (tab === activeReport) return;
    setReportData(null);
    setError(null);
    setActiveReport(tab);
  };

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeReport === 'DAILY_SALES') {
        const data = await api.getDailySales(selectedBranchId, dateFilter);
        setReportData(data);
      } else if (activeReport === 'VALUATION') {
        const data = await api.getStockValuation(selectedBranchId);
        setReportData(data);
      } else if (activeReport === 'GST') {
        const data = await api.getGSTSummary(selectedBranchId);
        setReportData(data);
      } else if (activeReport === 'EXPIRY') {
        const data = await api.getExpiryAlerts(selectedBranchId, 90);
        setReportData(data);
      }
    } catch (err: any) {
      console.error('Report load error:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to generate report data. Please check branch connection.');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [activeReport, selectedBranchId, dateFilter]);

  // Export sanitized CSV
  const exportToCSV = () => {
    if (!reportData) return;

    let rows: any[] = [];
    let filename = `confidos_${activeReport.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;

    if (activeReport === 'DAILY_SALES' && Array.isArray(reportData.invoices)) {
      rows = reportData.invoices.map((inv: any) => ({
        InvoiceNumber: inv.invoiceNumber,
        Customer: inv.customerName || 'Retail Customer',
        PaymentMode: inv.paymentMethod,
        TaxableValue: inv.subtotal,
        Discount: inv.discountTotal,
        TaxGST: inv.taxTotal,
        GrandTotal: inv.grandTotal,
        Date: inv.createdAt,
      }));
    } else if (activeReport === 'VALUATION' && Array.isArray(reportData.items)) {
      rows = reportData.items.map((i: any) => ({
        Medicine: i.medicineName,
        Generic: i.genericName,
        Batch: i.batchNumber,
        AvailableQty: i.quantity,
        PurchaseRate: i.purchaseRate,
        MRP: i.mrp,
        TotalPurchaseCost: i.purchaseValue,
        TotalMRPValue: i.mrpValue,
      }));
    } else if (activeReport === 'GST' && Array.isArray(reportData.hsnRecords)) {
      rows = reportData.hsnRecords.map((h: any) => ({
        HSNCode: h.hsnCode,
        GSTRate: `${h.gstRate}%`,
        TaxableValue: h.taxableAmount,
        CGST: h.cgstAmount,
        SGST: h.sgstAmount,
        TotalTax: h.totalTax,
        TotalInvoiceAmount: h.totalAmount,
      }));
    } else if (activeReport === 'EXPIRY' && Array.isArray(reportData.nearExpiry)) {
      rows = [...reportData.nearExpiry, ...(reportData.expired || [])].map((e: any) => ({
        Medicine: e.medicineName,
        Batch: e.batchNumber,
        ExpiryDate: e.expiryDate,
        DaysRemaining: e.daysRemaining,
        Quantity: e.quantity,
        Status: e.status,
      }));
    }

    if (rows.length === 0) return;

    // Excel formula injection sanitization (PRD Section 21.2)
    const sanitizeValue = (val: any) => {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (['=', '+', '-', '@'].includes(trimmed[0])) {
          return `'${trimmed}`;
        }
      }
      return val;
    };

    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((h) => {
            const val = sanitizeValue(row[h]);
            return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered rows for each report tab
  const filteredSalesInvoices = (reportData?.invoices || []).filter((inv: any) => {
    if (salesSearch.trim()) {
      const q = salesSearch.toLowerCase();
      const matchNum = inv.invoiceNumber?.toLowerCase().includes(q);
      const matchCust = inv.customerName?.toLowerCase().includes(q);
      if (!matchNum && !matchCust) return false;
    }
    if (salesPaymentFilter && inv.paymentMethod !== salesPaymentFilter) {
      return false;
    }
    if (salesMinAmount && inv.grandTotal < parseFloat(salesMinAmount)) {
      return false;
    }
    if (salesMaxAmount && inv.grandTotal > parseFloat(salesMaxAmount)) {
      return false;
    }
    return true;
  });

  const filteredValuationItems = (reportData?.items || []).filter((item: any) => {
    if (valuationSearch.trim()) {
      const q = valuationSearch.toLowerCase();
      const matchMed = item.medicineName?.toLowerCase().includes(q);
      const matchGen = item.genericName?.toLowerCase().includes(q);
      const matchBatch = item.batchNumber?.toLowerCase().includes(q);
      if (!matchMed && !matchGen && !matchBatch) return false;
    }
    if (valuationStockFilter === 'LOW_STOCK' && item.quantity > 10) return false;
    if (valuationStockFilter === 'IN_STOCK' && item.quantity <= 0) return false;
    if (valuationStockFilter === 'OUT_OF_STOCK' && item.quantity > 0) return false;
    if (valuationMinMrp && item.mrp < parseFloat(valuationMinMrp)) return false;
    if (valuationMaxMrp && item.mrp > parseFloat(valuationMaxMrp)) return false;
    return true;
  });

  const filteredHsnRecords = (reportData?.hsnRecords || []).filter((h: any) => {
    if (gstSearch.trim()) {
      const q = gstSearch.toLowerCase();
      if (!h.hsnCode?.toLowerCase().includes(q)) return false;
    }
    if (gstRateFilter && String(h.gstRate) !== String(gstRateFilter)) {
      return false;
    }
    return true;
  });

  const allExpiryRecords = [...(reportData?.nearExpiry || []), ...(reportData?.expired || [])];
  const filteredExpiryRecords = allExpiryRecords.filter((e: any) => {
    if (expirySearch.trim()) {
      const q = expirySearch.toLowerCase();
      const matchMed = e.medicineName?.toLowerCase().includes(q);
      const matchBatch = e.batchNumber?.toLowerCase().includes(q);
      if (!matchMed && !matchBatch) return false;
    }
    if (expiryStatusFilter && e.status !== expiryStatusFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Reports & Tax Analytics</h1>
            <Badge variant="neutral" size="sm">
              {currentBranch?.name} ({currentBranch?.code})
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Branch-scoped financial reconciliation, GST summary, stock valuation, and expiry alerts.
          </p>
        </div>

        <button
          onClick={exportToCSV}
          disabled={!reportData}
          className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 shadow-xs transition-colors self-start"
        >
          <Download className="w-4 h-4 text-slate-500" />
          Export Report (CSV)
        </button>
      </div>

      {/* Report Selector Tabs */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => handleTabChange('DAILY_SALES')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeReport === 'DAILY_SALES' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Daily Sales Register
          </button>
          <button
            onClick={() => handleTabChange('VALUATION')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeReport === 'VALUATION' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Stock Valuation & Margin
          </button>
          <button
            onClick={() => handleTabChange('GST')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeReport === 'GST' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            GST Tax Summary (HSN)
          </button>
          <button
            onClick={() => handleTabChange('EXPIRY')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeReport === 'EXPIRY' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Expiry Risk Report (90d)
          </button>
        </div>

        {activeReport === 'DAILY_SALES' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Date:</span>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
            />
          </div>
        )}
      </div>

      {/* Report Content Panels */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-sm">
          Generating report data...
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <p className="font-bold text-sm">Unable to Load Report Data</p>
              <p className="text-xs text-rose-600 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            onClick={loadReport}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs shrink-0"
          >
            Retry Report
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Daily Sales Panel */}
          {activeReport === 'DAILY_SALES' && reportData && Array.isArray(reportData.invoices) && (
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Total Sales</span>
                  <p className="text-2xl font-black font-mono text-brand-900 mt-1">₹{(reportData.totalSales ?? 0).toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">GST Tax Collected</span>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">₹{(reportData.totalTax ?? 0).toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Discounts Granted</span>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">₹{(reportData.totalDiscount ?? 0).toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Invoices Issued</span>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">{reportData.totalInvoices ?? 0}</p>
                </div>
              </div>

              {/* Invoices List */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Daily Sales Invoices Register</h2>
                    <p className="text-[10px] text-slate-500">
                      Showing {filteredSalesInvoices.length} of {reportData.invoices?.length || 0} registered sales
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search invoice #, customer..."
                        value={salesSearch}
                        onChange={(e) => setSalesSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-52 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition-colors"
                      />
                    </div>

                    <FilterButton
                      activeFilterCount={activeSalesFilterCount}
                      onReset={resetSalesFilters}
                      buttonLabel="Filter Invoices"
                      popoverWidth="w-72"
                      align="right"
                    >
                      <div className="space-y-3">
                        <FilterField label="Payment Method">
                          <FilterSelect
                            value={salesPaymentFilter}
                            onChange={(e) => setSalesPaymentFilter(e.target.value)}
                            options={[
                              { label: 'All Payment Methods', value: '' },
                              { label: 'Cash Counter', value: 'CASH' },
                              { label: 'UPI / Digital', value: 'UPI' },
                              { label: 'Card Payment', value: 'CARD' },
                            ]}
                          />
                        </FilterField>

                        <FilterField label="Grand Total (₹)">
                          <div className="grid grid-cols-2 gap-2">
                            <FilterInput
                              type="number"
                              placeholder="Min ₹"
                              value={salesMinAmount}
                              onChange={(e) => setSalesMinAmount(e.target.value)}
                            />
                            <FilterInput
                              type="number"
                              placeholder="Max ₹"
                              value={salesMaxAmount}
                              onChange={(e) => setSalesMaxAmount(e.target.value)}
                            />
                          </div>
                        </FilterField>
                      </div>
                    </FilterButton>
                  </div>
                </div>

                {/* Active Sales Filter Badges */}
                {(activeSalesFilterCount > 0 || salesSearch) && (
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center flex-wrap gap-2 text-xs">
                    <span className="text-slate-500 font-medium text-[11px]">Filtered by:</span>
                    {salesSearch && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 text-[11px]">
                        Search: "{salesSearch}"
                        <button onClick={() => setSalesSearch('')} className="hover:text-rose-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {salesPaymentFilter && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-[11px]">
                        Payment: {salesPaymentFilter}
                        <button onClick={() => setSalesPaymentFilter('')} className="hover:text-rose-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {(salesMinAmount || salesMaxAmount) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-[11px]">
                        Amount: ₹{salesMinAmount || '0'} - ₹{salesMaxAmount || '∞'}
                        <button
                          onClick={() => {
                            setSalesMinAmount('');
                            setSalesMaxAmount('');
                          }}
                          className="hover:text-rose-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setSalesSearch('');
                        resetSalesFilters();
                      }}
                      className="text-[11px] text-brand-600 hover:text-brand-800 font-semibold underline ml-1"
                    >
                      Clear All
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Invoice #</th>
                        <th className="py-3 px-3">Patient / Customer</th>
                        <th className="py-3 px-3 text-center">Payment Mode</th>
                        <th className="py-3 px-3 text-right">Taxable</th>
                        <th className="py-3 px-3 text-right">Tax (GST)</th>
                        <th className="py-3 px-4 text-right">Grand Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredSalesInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            No sales invoices match the selected criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredSalesInvoices.map((inv: any) => (
                          <tr key={inv.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                            <td className="py-2.5 px-3 text-slate-700">{inv.customerName || 'Retail Customer'}</td>
                            <td className="py-2.5 px-3 text-center">
                              <Badge variant="neutral" size="sm">
                                {inv.paymentMethod}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">₹{(inv.subtotal ?? 0).toFixed(2)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">₹{(inv.taxTotal ?? 0).toFixed(2)}</td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-brand-900">₹{(inv.grandTotal ?? 0).toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Stock Valuation Panel */}
          {activeReport === 'VALUATION' && reportData && Array.isArray(reportData.items) && (
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Total Available Units</span>
                  <p className="text-2xl font-black font-mono text-slate-900 mt-1">{reportData.totalUnits ?? 0}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Valuation at Cost</span>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">₹{(reportData.totalPurchaseValue ?? 0).toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Valuation at MRP</span>
                  <p className="text-2xl font-black font-mono text-brand-900 mt-1">₹{(reportData.totalMrpValue ?? 0).toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Potential Retail Margin</span>
                  <p className="text-2xl font-black font-mono text-pharmagreen-700 mt-1">₹{(reportData.potentialMargin ?? 0).toFixed(2)}</p>
                </div>
              </div>

              {/* Items Breakdown Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Stock Valuation Ledger</h2>
                    <p className="text-[10px] text-slate-500">
                      Showing {filteredValuationItems.length} of {reportData.items?.length || 0} inventory batches
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search medicine, batch..."
                        value={valuationSearch}
                        onChange={(e) => setValuationSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-52 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition-colors"
                      />
                    </div>

                    <FilterButton
                      activeFilterCount={activeValuationFilterCount}
                      onReset={resetValuationFilters}
                      buttonLabel="Filter Valuation"
                      popoverWidth="w-72"
                      align="right"
                    >
                      <div className="space-y-3">
                        <FilterField label="Stock Status">
                          <FilterSelect
                            value={valuationStockFilter}
                            onChange={(e) => setValuationStockFilter(e.target.value)}
                            options={[
                              { label: 'All Stock Levels', value: '' },
                              { label: 'In Stock (> 0 units)', value: 'IN_STOCK' },
                              { label: 'Low Stock (≤ 10 units)', value: 'LOW_STOCK' },
                              { label: 'Out of Stock (0 units)', value: 'OUT_OF_STOCK' },
                            ]}
                          />
                        </FilterField>

                        <FilterField label="MRP Range (₹)">
                          <div className="grid grid-cols-2 gap-2">
                            <FilterInput
                              type="number"
                              placeholder="Min ₹"
                              value={valuationMinMrp}
                              onChange={(e) => setValuationMinMrp(e.target.value)}
                            />
                            <FilterInput
                              type="number"
                              placeholder="Max ₹"
                              value={valuationMaxMrp}
                              onChange={(e) => setValuationMaxMrp(e.target.value)}
                            />
                          </div>
                        </FilterField>
                      </div>
                    </FilterButton>
                  </div>
                </div>

                {/* Active Valuation Filter Badges */}
                {(activeValuationFilterCount > 0 || valuationSearch) && (
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center flex-wrap gap-2 text-xs">
                    <span className="text-slate-500 font-medium text-[11px]">Filtered by:</span>
                    {valuationSearch && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 text-[11px]">
                        Search: "{valuationSearch}"
                        <button onClick={() => setValuationSearch('')} className="hover:text-rose-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {valuationStockFilter && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-[11px]">
                        Status: {valuationStockFilter}
                        <button onClick={() => setValuationStockFilter('')} className="hover:text-rose-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {(valuationMinMrp || valuationMaxMrp) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-[11px]">
                        MRP: ₹{valuationMinMrp || '0'} - ₹{valuationMaxMrp || '∞'}
                        <button
                          onClick={() => {
                            setValuationMinMrp('');
                            setValuationMaxMrp('');
                          }}
                          className="hover:text-rose-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setValuationSearch('');
                        resetValuationFilters();
                      }}
                      className="text-[11px] text-brand-600 hover:text-brand-800 font-semibold underline ml-1"
                    >
                      Clear All
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Medicine Name</th>
                        <th className="py-3 px-3">Batch Number</th>
                        <th className="py-3 px-3 text-right">Available Qty</th>
                        <th className="py-3 px-3 text-right">Purchase Rate</th>
                        <th className="py-3 px-3 text-right">MRP</th>
                        <th className="py-3 px-3 text-right">Total Cost</th>
                        <th className="py-3 px-4 text-right">Total MRP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredValuationItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            No inventory items match the selected criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredValuationItems.map((item: any) => (
                          <tr key={item.batchId} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-4 font-bold text-slate-900">{item.medicineName}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-700">{item.batchNumber}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{item.quantity}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">₹{(item.purchaseRate ?? 0).toFixed(2)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-800">₹{(item.mrp ?? 0).toFixed(2)}</td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">₹{(item.purchaseValue ?? 0).toFixed(2)}</td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-brand-900">₹{(item.mrpValue ?? 0).toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* GST Summary Panel */}
          {activeReport === 'GST' && reportData && Array.isArray(reportData.hsnRecords) && (
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Taxable Value</span>
                  <p className="text-2xl font-black font-mono text-slate-900 mt-1">₹{(reportData.totalTaxable ?? 0).toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Central GST (CGST)</span>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">₹{(reportData.totalCgst ?? 0).toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">State GST (SGST)</span>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">₹{(reportData.totalSgst ?? 0).toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Total Tax Amount</span>
                  <p className="text-2xl font-black font-mono text-brand-900 mt-1">₹{(reportData.totalTax ?? 0).toFixed(2)}</p>
                </div>
              </div>

              {/* HSN Summary Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">HSN Tax Breakdown</h2>
                    <p className="text-[10px] text-slate-500">
                      Showing {filteredHsnRecords.length} of {reportData.hsnRecords?.length || 0} HSN categories
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search HSN code..."
                        value={gstSearch}
                        onChange={(e) => setGstSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition-colors"
                      />
                    </div>

                    <FilterButton
                      activeFilterCount={activeGstFilterCount}
                      onReset={resetGstFilters}
                      buttonLabel="Filter HSN"
                      popoverWidth="w-64"
                      align="right"
                    >
                      <div className="space-y-3">
                        <FilterField label="GST Tax Slab">
                          <FilterSelect
                            value={gstRateFilter}
                            onChange={(e) => setGstRateFilter(e.target.value)}
                            options={[
                              { label: 'All Tax Rates', value: '' },
                              { label: '0% Exemption', value: '0' },
                              { label: '5% Standard Pharma', value: '5' },
                              { label: '12% Healthcare', value: '12' },
                              { label: '18% Standard GST', value: '18' },
                              { label: '28% Luxury / High', value: '28' },
                            ]}
                          />
                        </FilterField>
                      </div>
                    </FilterButton>
                  </div>
                </div>

                {/* Active GST Filter Badges */}
                {(activeGstFilterCount > 0 || gstSearch) && (
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center flex-wrap gap-2 text-xs">
                    <span className="text-slate-500 font-medium text-[11px]">Filtered by:</span>
                    {gstSearch && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 text-[11px]">
                        HSN: "{gstSearch}"
                        <button onClick={() => setGstSearch('')} className="hover:text-rose-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {gstRateFilter && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-[11px]">
                        Rate: {gstRateFilter}%
                        <button onClick={() => setGstRateFilter('')} className="hover:text-rose-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setGstSearch('');
                        resetGstFilters();
                      }}
                      className="text-[11px] text-brand-600 hover:text-brand-800 font-semibold underline ml-1"
                    >
                      Clear All
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">HSN Code</th>
                        <th className="py-3 px-3 text-center">GST Rate</th>
                        <th className="py-3 px-3 text-right">Taxable Value</th>
                        <th className="py-3 px-3 text-right">CGST</th>
                        <th className="py-3 px-3 text-right">SGST</th>
                        <th className="py-3 px-3 text-right">Total GST</th>
                        <th className="py-3 px-4 text-right">Total Invoice Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredHsnRecords.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            No HSN tax records match the selected criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredHsnRecords.map((h: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3 px-4 font-mono font-bold text-slate-900">{h.hsnCode}</td>
                            <td className="py-3 px-3 text-center font-bold">{h.gstRate}%</td>
                            <td className="py-3 px-3 text-right font-mono text-slate-700">₹{(h.taxableAmount ?? 0).toFixed(2)}</td>
                            <td className="py-3 px-3 text-right font-mono text-slate-600">₹{(h.cgstAmount ?? 0).toFixed(2)}</td>
                            <td className="py-3 px-3 text-right font-mono text-slate-600">₹{(h.sgstAmount ?? 0).toFixed(2)}</td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-brand-900">₹{(h.totalTax ?? 0).toFixed(2)}</td>
                            <td className="py-3 px-4 text-right font-mono font-black text-slate-900">₹{(h.totalAmount ?? 0).toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Expiry Risk Panel */}
          {activeReport === 'EXPIRY' && reportData && (Array.isArray(reportData.nearExpiry) || Array.isArray(reportData.expired)) && (
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs bg-amber-50/20">
                  <span className="text-[11px] font-bold text-amber-800 uppercase">Near Expiry Batches (&lt;90 Days)</span>
                  <p className="text-2xl font-black font-mono text-amber-700 mt-1">{reportData.totalNearExpiry ?? 0}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs bg-rose-50/20">
                  <span className="text-[11px] font-bold text-rose-800 uppercase">Expired Batches (Blocked)</span>
                  <p className="text-2xl font-black font-mono text-rose-700 mt-1">{reportData.totalExpired ?? 0}</p>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">FEFO Expiry Risk Ledger</h2>
                    <p className="text-[10px] text-slate-500">
                      Showing {filteredExpiryRecords.length} of {allExpiryRecords.length} high-risk batches
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search medicine, batch..."
                        value={expirySearch}
                        onChange={(e) => setExpirySearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-52 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition-colors"
                      />
                    </div>

                    <FilterButton
                      activeFilterCount={activeExpiryFilterCount}
                      onReset={resetExpiryFilters}
                      buttonLabel="Filter Expiry"
                      popoverWidth="w-64"
                      align="right"
                    >
                      <div className="space-y-3">
                        <FilterField label="Expiry Status">
                          <FilterSelect
                            value={expiryStatusFilter}
                            onChange={(e) => setExpiryStatusFilter(e.target.value)}
                            options={[
                              { label: 'All Risk Categories', value: '' },
                              { label: 'Near Expiry (< 90 Days)', value: 'NEAR_EXPIRY' },
                              { label: 'Expired (Blocked from Sale)', value: 'EXPIRED' },
                            ]}
                          />
                        </FilterField>
                      </div>
                    </FilterButton>
                  </div>
                </div>

                {/* Active Expiry Filter Badges */}
                {(activeExpiryFilterCount > 0 || expirySearch) && (
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center flex-wrap gap-2 text-xs">
                    <span className="text-slate-500 font-medium text-[11px]">Filtered by:</span>
                    {expirySearch && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 text-[11px]">
                        Search: "{expirySearch}"
                        <button onClick={() => setExpirySearch('')} className="hover:text-rose-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {expiryStatusFilter && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-[11px]">
                        Status: {expiryStatusFilter}
                        <button onClick={() => setExpiryStatusFilter('')} className="hover:text-rose-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setExpirySearch('');
                        resetExpiryFilters();
                      }}
                      className="text-[11px] text-brand-600 hover:text-brand-800 font-semibold underline ml-1"
                    >
                      Clear All
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Medicine Name</th>
                        <th className="py-3 px-3">Batch Number</th>
                        <th className="py-3 px-3 text-center">Expiry Date</th>
                        <th className="py-3 px-3 text-center">Days Left</th>
                        <th className="py-3 px-3 text-right">Stock Qty</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredExpiryRecords.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            No batches match the selected criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredExpiryRecords.map((e: any) => (
                          <tr key={e.id} className="hover:bg-slate-50/50">
                            <td className="py-3 px-4 font-bold text-slate-900">{e.medicineName}</td>
                            <td className="py-3 px-3 font-mono text-slate-700">{e.batchNumber}</td>
                            <td className="py-3 px-3 text-center font-mono">
                              {new Date(e.expiryDate).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </td>
                            <td className="py-3 px-3 text-center font-bold font-mono">
                              <span className={e.daysRemaining <= 0 ? 'text-rose-600' : 'text-amber-700'}>
                                {e.daysRemaining <= 0 ? 'EXPIRED' : `${e.daysRemaining} days`}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">{e.quantity}</td>
                            <td className="py-3 px-4 text-center">
                              <Badge variant={e.status === 'EXPIRED' ? 'danger' : 'warning'} size="sm">
                                {e.status}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Empty state fallback */}
          {!reportData && (
            <div className="p-12 text-center text-slate-400 text-sm bg-white rounded-xl border border-slate-200 shadow-xs">
              No report data available for the selected criteria.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
