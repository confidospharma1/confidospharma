import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { BarChart3, Download, Calendar, Filter, Receipt, Boxes, AlertTriangle } from 'lucide-react';
import { Badge } from '../components/Badge';

export const ReportsPage: React.FC = () => {
  const { currentBranch, selectedBranchId } = useAuth();

  const [activeReport, setActiveReport] = useState<'DAILY_SALES' | 'VALUATION' | 'GST' | 'EXPIRY'>('DAILY_SALES');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);

  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);

  const loadReport = async () => {
    setLoading(true);
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
    } catch (err) {
      console.error('Report load error:', err);
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

    if (activeReport === 'DAILY_SALES' && reportData.invoices) {
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
    } else if (activeReport === 'VALUATION' && reportData.items) {
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
    } else if (activeReport === 'GST' && reportData.hsnRecords) {
      rows = reportData.hsnRecords.map((h: any) => ({
        HSNCode: h.hsnCode,
        GSTRate: `${h.gstRate}%`,
        TaxableValue: h.taxableAmount,
        CGST: h.cgstAmount,
        SGST: h.sgstAmount,
        TotalTax: h.totalTax,
        TotalInvoiceAmount: h.totalAmount,
      }));
    } else if (activeReport === 'EXPIRY' && reportData.nearExpiry) {
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
            onClick={() => setActiveReport('DAILY_SALES')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeReport === 'DAILY_SALES' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Daily Sales Register
          </button>
          <button
            onClick={() => setActiveReport('VALUATION')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeReport === 'VALUATION' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Stock Valuation & Margin
          </button>
          <button
            onClick={() => setActiveReport('GST')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeReport === 'GST' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            GST Tax Summary (HSN)
          </button>
          <button
            onClick={() => setActiveReport('EXPIRY')}
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
      ) : (
        <div className="space-y-6">
          {/* Daily Sales Panel */}
          {activeReport === 'DAILY_SALES' && reportData && (
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Total Sales</span>
                  <p className="text-2xl font-black font-mono text-emerald-700 mt-1">₹{reportData.totalSales.toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">GST Tax Collected</span>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">₹{reportData.totalTax.toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Discounts Granted</span>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">₹{reportData.totalDiscount.toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Invoices Issued</span>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">{reportData.totalInvoices}</p>
                </div>
              </div>

              {/* Invoices List */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
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
                      {reportData.invoices?.map((inv: any) => (
                        <tr key={inv.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                          <td className="py-2.5 px-3 text-slate-700">{inv.customerName || 'Retail Customer'}</td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge variant="neutral" size="sm">
                              {inv.paymentMethod}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">₹{inv.subtotal.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">₹{inv.taxTotal.toFixed(2)}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">₹{inv.grandTotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Stock Valuation Panel */}
          {activeReport === 'VALUATION' && reportData && (
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Total Available Units</span>
                  <p className="text-2xl font-black font-mono text-slate-900 mt-1">{reportData.totalUnits}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Valuation at Cost</span>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">₹{reportData.totalPurchaseValue.toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Valuation at MRP</span>
                  <p className="text-2xl font-black font-mono text-emerald-700 mt-1">₹{reportData.totalMrpValue.toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Potential Retail Margin</span>
                  <p className="text-2xl font-black font-mono text-indigo-600 mt-1">₹{reportData.potentialMargin.toFixed(2)}</p>
                </div>
              </div>

              {/* Items Breakdown Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
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
                      {reportData.items?.map((item: any) => (
                        <tr key={item.batchId} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-4 font-bold text-slate-900">{item.medicineName}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">{item.batchNumber}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{item.quantity}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">₹{item.purchaseRate.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-800">₹{item.mrp.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">₹{item.purchaseValue.toFixed(2)}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">₹{item.mrpValue.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* GST Summary Panel */}
          {activeReport === 'GST' && reportData && (
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Taxable Value</span>
                  <p className="text-2xl font-black font-mono text-slate-900 mt-1">₹{reportData.totalTaxable.toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Central GST (CGST)</span>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">₹{reportData.totalCgst.toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">State GST (SGST)</span>
                  <p className="text-2xl font-black font-mono text-slate-800 mt-1">₹{reportData.totalSgst.toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Total Tax Amount</span>
                  <p className="text-2xl font-black font-mono text-emerald-700 mt-1">₹{reportData.totalTax.toFixed(2)}</p>
                </div>
              </div>

              {/* HSN Summary Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
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
                      {reportData.hsnRecords?.map((h: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{h.hsnCode}</td>
                          <td className="py-3 px-3 text-center font-bold">{h.gstRate}%</td>
                          <td className="py-3 px-3 text-right font-mono text-slate-700">₹{h.taxableAmount.toFixed(2)}</td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">₹{h.cgstAmount.toFixed(2)}</td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">₹{h.sgstAmount.toFixed(2)}</td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700">₹{h.totalTax.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-mono font-black text-slate-900">₹{h.totalAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Expiry Risk Panel */}
          {activeReport === 'EXPIRY' && reportData && (
            <div className="space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs bg-amber-50/20">
                  <span className="text-[11px] font-bold text-amber-800 uppercase">Near Expiry Batches (&lt;90 Days)</span>
                  <p className="text-2xl font-black font-mono text-amber-700 mt-1">{reportData.totalNearExpiry}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-xs bg-rose-50/20">
                  <span className="text-[11px] font-bold text-rose-800 uppercase">Expired Batches (Blocked)</span>
                  <p className="text-2xl font-black font-mono text-rose-700 mt-1">{reportData.totalExpired}</p>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
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
                      {[...(reportData.nearExpiry || []), ...(reportData.expired || [])].map((e: any) => (
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
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
