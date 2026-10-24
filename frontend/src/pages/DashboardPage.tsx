import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  TrendingUp,
  Boxes,
  AlertTriangle,
  Receipt,
  Building2,
  ShoppingCart,
  Pill,
  FileSpreadsheet,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '../components/Badge';

interface DashboardPageProps {
  onNavigate: (tab: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { isSuperAdmin, selectedBranchId, currentBranch } = useAuth();
  const [loading, setLoading] = useState(true);

  // Stats
  const [dailySales, setDailySales] = useState<any>(null);
  const [stockVal, setStockVal] = useState<any>(null);
  const [expiryAlerts, setExpiryAlerts] = useState<any>(null);
  const [companyOverview, setCompanyOverview] = useState<any>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        const [daily, val, exp] = await Promise.all([
          api.getDailySales(selectedBranchId),
          api.getStockValuation(selectedBranchId),
          api.getExpiryAlerts(selectedBranchId, 60),
        ]);

        setDailySales(daily);
        setStockVal(val);
        setExpiryAlerts(exp);

        if (isSuperAdmin) {
          const comp = await api.getCompanyOverview();
          setCompanyOverview(comp);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [selectedBranchId, isSuperAdmin]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-500 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading branch operational metrics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-slate-900 to-slate-850 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="brand" size="sm">
                CONFIDOS PHARMA OS
              </Badge>
              <span className="text-xs text-emerald-300 font-mono font-medium">
                {currentBranch?.name} ({currentBranch?.code})
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight">Pharmacy Operations Center</h1>
            <p className="text-xs text-slate-300 max-w-xl mt-1">
              Real-time branch inventory, FEFO batch adherence, GST compliance, and high-speed counter billing.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('pos')}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-sm"
            >
              <ShoppingCart className="w-4 h-4" />
              Launch POS Counter
            </button>
            <button
              onClick={() => onNavigate('imports')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-xs transition-colors backdrop-blur-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Bulk Import
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Today's Sales */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Today&apos;s Branch Sales</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-slate-900">
            ₹{(dailySales?.totalSales || 0).toFixed(2)}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>Invoices today: <strong className="text-slate-800">{dailySales?.totalInvoices || 0}</strong></span>
            <span className="text-emerald-600 font-semibold">Live Real-time</span>
          </div>
        </div>

        {/* Metric 2: Stock Units & Batches */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Stock on Hand (Units)</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-slate-900">
            {stockVal?.totalUnits || 0}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>Active Batches: <strong className="text-slate-800">{stockVal?.batchesCount || 0}</strong></span>
            <button onClick={() => onNavigate('inventory')} className="text-blue-600 hover:underline font-semibold">
              Inspect &rarr;
            </button>
          </div>
        </div>

        {/* Metric 3: Stock Valuation (MRP) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Stock Valuation (MRP)</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-slate-900">
            ₹{(stockVal?.totalMrpValue || 0).toFixed(2)}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>Cost: ₹{(stockVal?.totalPurchaseValue || 0).toFixed(2)}</span>
            <span className="text-indigo-600 font-semibold">Margin: ₹{(stockVal?.potentialMargin || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Metric 4: Expiry Alerts */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Near Expiry Alert (&lt;60d)</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-amber-600">
            {expiryAlerts?.totalNearExpiry || 0}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span className="text-rose-600 font-semibold">Expired Batches: {expiryAlerts?.totalExpired || 0}</span>
            <button onClick={() => onNavigate('inventory')} className="text-amber-700 hover:underline font-semibold">
              Review &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Super Admin Company Comparison: Vijayawada, Guntur, Tenali */}
      {isSuperAdmin && companyOverview && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Company Consolidated Multi-Branch Totals
              </h2>
              <p className="text-xs text-slate-500">
                Consolidated reporting across 3 branches without mixing physical branch inventory.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 font-medium">Company Lifetime Sales:</span>
              <p className="text-lg font-black font-mono text-emerald-700">
                ₹{companyOverview.companyTotalSales.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {companyOverview.branches.map((b: any) => (
              <div
                key={b.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800">{b.name}</span>
                  <Badge variant="neutral" size="sm">
                    {b.code}
                  </Badge>
                </div>
                <div className="text-xl font-black font-mono text-slate-900 mb-2">
                  ₹{b.totalSales.toFixed(2)}
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                  <span>Batches: <strong>{b.totalBatches}</strong></span>
                  <span>Invoices: <strong>{b.totalInvoices}</strong></span>
                  <span>Staff: <strong>{b.usersCount}</strong></span>
                  <span>Near-Exp: <strong className="text-amber-600">{b.nearExpiryCount}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Invoices & Expiry Warning table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Recent Invoices */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Recent Sales Invoices
            </h3>
            <button
              onClick={() => onNavigate('invoices')}
              className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold"
            >
              View All &rarr;
            </button>
          </div>
          <div className="p-4 flex-1 overflow-x-auto">
            {dailySales?.invoices?.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No sales invoices recorded yet today.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500 font-bold border-b border-slate-100">
                  <tr>
                    <th className="pb-2">Invoice #</th>
                    <th className="pb-2">Patient / Customer</th>
                    <th className="pb-2 text-center">Mode</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {dailySales?.invoices?.slice(0, 5).map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                      <td className="py-2.5 text-slate-700">{inv.customerName || 'Retail Customer'}</td>
                      <td className="py-2.5 text-center">
                        <Badge variant="neutral" size="sm">
                          {inv.paymentMethod}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-emerald-700">
                        ₹{inv.grandTotal.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Near Expiry Batches */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Near Expiry Batches (&lt;60 Days)
              </h3>
              <Badge variant="warning" size="sm">
                FEFO Priority
              </Badge>
            </div>
            <button
              onClick={() => onNavigate('inventory')}
              className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold"
            >
              Manage &rarr;
            </button>
          </div>
          <div className="p-4 flex-1 overflow-x-auto">
            {expiryAlerts?.nearExpiry?.length === 0 ? (
              <p className="text-xs text-emerald-600 text-center py-6 font-medium">
                No batches expiring within the next 60 days. Stock is healthy!
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500 font-bold border-b border-slate-100">
                  <tr>
                    <th className="pb-2">Medicine</th>
                    <th className="pb-2">Batch</th>
                    <th className="pb-2 text-center">Days Left</th>
                    <th className="pb-2 text-right">Available Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {expiryAlerts?.nearExpiry?.slice(0, 5).map((exp: any) => (
                    <tr key={exp.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 font-bold text-slate-800">{exp.medicineName}</td>
                      <td className="py-2.5 font-mono text-slate-600">{exp.batchNumber}</td>
                      <td className="py-2.5 text-center font-bold text-amber-700">
                        {exp.daysRemaining} days
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-slate-900">
                        {exp.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
