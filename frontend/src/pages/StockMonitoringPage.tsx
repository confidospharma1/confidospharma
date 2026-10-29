import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  Boxes,
  Search,
  Filter,
  X,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Calendar,
  Layers,
  Building2,
  RefreshCw,
  Eye,
  TrendingDown,
  Clock,
  Info,
  ChevronLeft,
  ChevronRight,
  Package,
  ArrowUpDown,
  SlidersHorizontal,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';

interface MetricData {
  uniqueMedicines: number;
  inStockMedicines: number;
  outOfStockMedicines: number;
  lowStockMedicines: number;
  nearExpiryMedicines: number;
  expiredStockMedicines: number;
  totalUnitsInStock: number;
  totalInventoryValue: number;
  selectedBranchId: string | null;
  branchName: string;
  branchCode: string;
}

interface StockItem {
  medicineId: string;
  internalCode: string;
  medicineName: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  packSize: string;
  baseUnit: string;
  packageUnit: string;
  conversionFactor: number;
  hsnCode?: string;
  gstRate: number;
  mrp: number;
  defaultPurchaseRate?: number;
  defaultSellingRate?: number;
  reorderLevel: number | null;
  hasConfiguredReorderLevel: boolean;
  totalAvailableStock: number;
  batchCount: number;
  activeBatchCount: number;
  nearestExpiry: string | null;
  nearestExpiryDays: number | null;
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  expiryStatus: 'NORMAL' | 'NEAR_EXPIRY' | 'EXPIRED' | 'NO_EXPIRY';
  hasExpiredPositiveBatch: boolean;
  hasExpiring30PositiveBatch: boolean;
  hasExpiring60PositiveBatch: boolean;
  hasExpiring90PositiveBatch: boolean;
  hasExpiring180PositiveBatch: boolean;
  packConversion: {
    baseQuantity: number;
    baseUnit: string;
    packageUnit: string;
    conversionFactor: number;
    equivalentPacksText: string;
    fullPacks: number;
    remainderUnits: number;
  };
  lastStockMovement: string | null;
  lastStockMovementType: string | null;
  supplierIds: string[];
  batchNumbers: string[];
}

interface BatchItem {
  id: string;
  batchNumber: string;
  availableQuantity: number;
  quantityReceived: number;
  baseUnit: string;
  packageUnit: string;
  conversionFactor: number;
  equivalentPacksText: string;
  purchaseRate: number;
  packPurchaseRate: number;
  mrp: number;
  packMrp: number;
  sellingPrice: number;
  receiptDate: string;
  expiryDate: string;
  daysToExpiry: number;
  status: string;
  stockStatus: 'IN_STOCK' | 'DEPLETED';
  expiryClassification: 'NORMAL' | 'NEAR_EXPIRY' | 'EXPIRED';
  supplierId?: string;
  supplierName: string;
  purchaseInvoiceRef?: string;
  branchName: string;
}

interface StockAlert {
  id: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  medicineName: string;
  medicineId: string;
  batchNumber: string | null;
  affectedQuantity: number;
  baseUnit: string;
  thresholdOrExpiry: string;
  daysLeft: number | null;
  branchName: string;
  recommendedAction: string;
}

const formatCurrency = (val: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(val || 0);
};

const formatDate = (isoString?: string | null): string => {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
};

export const StockMonitoringPage: React.FC = () => {
  const { currentBranch, selectedBranchId, branches, isSuperAdmin } = useAuth();

  // Selected Branch for Super Admin (Branch Admin is locked to currentBranch)
  const effectiveBranchId = isSuperAdmin ? (selectedBranchId || currentBranch?.id) : currentBranch?.id;

  // Data States
  const [metrics, setMetrics] = useState<MetricData | null>(null);
  const [items, setItems] = useState<StockItem[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stockStatus, setStockStatus] = useState<string>('ALL');
  const [expiryStatus, setExpiryStatus] = useState<string>('ALL');
  const [dosageForm, setDosageForm] = useState<string>('');
  const [manufacturer, setManufacturer] = useState<string>('');
  const [minQuantity, setMinQuantity] = useState<string>('');
  const [maxQuantity, setMaxQuantity] = useState<string>('');
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Filter options from backend
  const [dosageOptions, setDosageOptions] = useState<string[]>([]);
  const [mfgOptions, setMfgOptions] = useState<string[]>([]);

  // Batch Detail Modal
  const [selectedMedicine, setSelectedMedicine] = useState<StockItem | null>(null);
  const [batchDetails, setBatchDetails] = useState<{ medicine: any; batches: BatchItem[] } | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);

  // Alerts Toggle
  const [showAlertsSection, setShowAlertsSection] = useState(false);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Load Filter Options
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await api.getStockMonitoringFilterOptions(effectiveBranchId);
        if (res) {
          setDosageOptions(res.dosageForms || []);
          setMfgOptions(res.manufacturers || []);
        }
      } catch (err) {
        console.warn('Could not load filter options:', err);
      }
    };
    fetchOptions();
  }, [effectiveBranchId]);

  // Load Stock Monitoring Data
  const loadStockData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stockRes, alertsRes] = await Promise.all([
        api.getStockMonitoring({
          branchId: effectiveBranchId,
          search: debouncedSearch,
          stockStatus,
          expiryStatus,
          dosageForm: dosageForm || undefined,
          manufacturer: manufacturer || undefined,
          minQuantity: minQuantity || undefined,
          maxQuantity: maxQuantity || undefined,
          batchNumber: batchNumber || undefined,
          sortBy,
          sortOrder,
          page,
          limit,
        }),
        api.getStockMonitoringAlerts(effectiveBranchId),
      ]);

      if (stockRes) {
        setMetrics(stockRes.metrics);
        setItems(stockRes.items || []);
        if (stockRes.pagination) {
          setTotalItems(stockRes.pagination.totalItems);
          setTotalPages(stockRes.pagination.totalPages);
        }
      }

      if (alertsRes && Array.isArray(alertsRes.alerts)) {
        setAlerts(alertsRes.alerts);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load stock monitoring inventory.');
    } finally {
      setLoading(false);
    }
  }, [
    effectiveBranchId,
    debouncedSearch,
    stockStatus,
    expiryStatus,
    dosageForm,
    manufacturer,
    minQuantity,
    maxQuantity,
    batchNumber,
    sortBy,
    sortOrder,
    page,
    limit,
  ]);

  useEffect(() => {
    loadStockData();
  }, [loadStockData]);

  // Handle clicking a metric card to filter
  const handleMetricCardClick = (filterType: string) => {
    setPage(1);
    if (filterType === 'ALL') {
      setStockStatus('ALL');
      setExpiryStatus('ALL');
    } else if (filterType === 'IN_STOCK') {
      setStockStatus('IN_STOCK');
      setExpiryStatus('ALL');
    } else if (filterType === 'OUT_OF_STOCK') {
      setStockStatus('OUT_OF_STOCK');
      setExpiryStatus('ALL');
    } else if (filterType === 'LOW_STOCK') {
      setStockStatus('LOW_STOCK');
      setExpiryStatus('ALL');
    } else if (filterType === 'NEAR_EXPIRY') {
      setStockStatus('ALL');
      setExpiryStatus('EXPIRING_60');
    } else if (filterType === 'EXPIRED') {
      setStockStatus('ALL');
      setExpiryStatus('EXPIRED');
    }
  };

  // Reset all filters
  const handleClearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStockStatus('ALL');
    setExpiryStatus('ALL');
    setDosageForm('');
    setManufacturer('');
    setMinQuantity('');
    setMaxQuantity('');
    setBatchNumber('');
    setSortBy('name');
    setSortOrder('asc');
    setPage(1);
  };

  const activeFilterCount = [
    debouncedSearch,
    stockStatus !== 'ALL' ? stockStatus : '',
    expiryStatus !== 'ALL' ? expiryStatus : '',
    dosageForm,
    manufacturer,
    minQuantity,
    maxQuantity,
    batchNumber,
  ].filter(Boolean).length;

  // Open Batch Drill-Down Modal
  const handleViewBatches = async (item: StockItem) => {
    setSelectedMedicine(item);
    setShowBatchModal(true);
    setLoadingBatches(true);
    try {
      const res = await api.getStockMonitoringBatches(item.medicineId, effectiveBranchId);
      setBatchDetails(res);
    } catch (err) {
      console.error('Failed to load batch drill-down:', err);
    } finally {
      setLoadingBatches(false);
    }
  };

  // Critical Alerts Count
  const criticalAlertsCount = useMemo(() => {
    return alerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length;
  }, [alerts]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto text-slate-800">
      {/* 1. Header with Branch & Strict Read-Only Notice */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Stock Monitoring & Inventory Health
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider font-semibold">
                  Read-Only
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                Audited real-time pharmacy stock levels, base unit conversions, FEFO batch aging, and buffer thresholds.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Branch Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 font-medium">Branch:</span>
            <span className="font-bold text-slate-800">{metrics?.branchName || currentBranch?.name || 'Local Branch'}</span>
            <span className="text-[10px] text-slate-400 font-mono">({metrics?.branchCode || currentBranch?.code || '—'})</span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={loadStockData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
            title="Refresh current stock records from authoritative ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-brand-500' : 'text-slate-400'}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Interactive Dashboard Summary Cards (Part 3.3) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {/* Card 1: Unique Medicines */}
        <button
          type="button"
          onClick={() => handleMetricCardClick('ALL')}
          className={`p-3.5 rounded-xl border text-left transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between ${
            stockStatus === 'ALL' && expiryStatus === 'ALL'
              ? 'bg-brand-50/70 border-brand-400 ring-2 ring-brand-400/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Unique Meds</span>
            <Package className="w-4 h-4 text-brand-500" />
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-slate-900 font-mono">
              {metrics ? metrics.uniqueMedicines.toLocaleString() : '—'}
            </div>
            <p className="text-[10px] text-slate-400">Total catalogue</p>
          </div>
        </button>

        {/* Card 2: In-Stock */}
        <button
          type="button"
          onClick={() => handleMetricCardClick('IN_STOCK')}
          className={`p-3.5 rounded-xl border text-left transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between ${
            stockStatus === 'IN_STOCK'
              ? 'bg-emerald-50/70 border-emerald-400 ring-2 ring-emerald-400/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">In Stock</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-emerald-700 font-mono">
              {metrics ? metrics.inStockMedicines.toLocaleString() : '—'}
            </div>
            <p className="text-[10px] text-emerald-600/80">Available balance</p>
          </div>
        </button>

        {/* Card 3: Out of Stock */}
        <button
          type="button"
          onClick={() => handleMetricCardClick('OUT_OF_STOCK')}
          className={`p-3.5 rounded-xl border text-left transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between ${
            stockStatus === 'OUT_OF_STOCK'
              ? 'bg-rose-50/70 border-rose-400 ring-2 ring-rose-400/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Out of Stock</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-rose-700 font-mono">
              {metrics ? metrics.outOfStockMedicines.toLocaleString() : '—'}
            </div>
            <p className="text-[10px] text-rose-600/80">Zero inventory</p>
          </div>
        </button>

        {/* Card 4: Low Stock */}
        <button
          type="button"
          onClick={() => handleMetricCardClick('LOW_STOCK')}
          className={`p-3.5 rounded-xl border text-left transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between ${
            stockStatus === 'LOW_STOCK'
              ? 'bg-amber-50/70 border-amber-400 ring-2 ring-amber-400/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Low Stock</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-amber-700 font-mono">
              {metrics ? metrics.lowStockMedicines.toLocaleString() : '—'}
            </div>
            <p className="text-[10px] text-amber-600/80">≤ Reorder level</p>
          </div>
        </button>

        {/* Card 5: Near Expiry (60 Days) */}
        <button
          type="button"
          onClick={() => handleMetricCardClick('NEAR_EXPIRY')}
          className={`p-3.5 rounded-xl border text-left transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between ${
            expiryStatus === 'EXPIRING_60'
              ? 'bg-orange-50/70 border-orange-400 ring-2 ring-orange-400/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-orange-700 uppercase tracking-wider">Near Expiry</span>
            <Clock className="w-4 h-4 text-orange-500" />
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-orange-700 font-mono">
              {metrics ? metrics.nearExpiryMedicines.toLocaleString() : '—'}
            </div>
            <p className="text-[10px] text-orange-600/80">Expiring in 60d</p>
          </div>
        </button>

        {/* Card 6: Expired Stock */}
        <button
          type="button"
          onClick={() => handleMetricCardClick('EXPIRED')}
          className={`p-3.5 rounded-xl border text-left transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between ${
            expiryStatus === 'EXPIRED'
              ? 'bg-red-50/70 border-red-500 ring-2 ring-red-500/20'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-red-800 uppercase tracking-wider">Expired Stock</span>
            <ShieldAlert className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-red-800 font-mono">
              {metrics ? metrics.expiredStockMedicines.toLocaleString() : '—'}
            </div>
            <p className="text-[10px] text-red-700/80">Past expiry date</p>
          </div>
        </button>

        {/* Card 7: Total Units */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Units</span>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2">
            <div className="text-lg font-bold text-slate-900 font-mono">
              {metrics ? metrics.totalUnitsInStock.toLocaleString() : '—'}
            </div>
            <p className="text-[10px] text-slate-400">Normalized base units</p>
          </div>
        </div>

        {/* Card 8: Inventory Value */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Stock Valuation</span>
            <span className="text-xs font-bold text-slate-400 font-mono">₹</span>
          </div>
          <div className="mt-2">
            <div className="text-sm font-bold text-slate-900 font-mono truncate" title={formatCurrency(metrics?.totalInventoryValue || 0)}>
              {metrics ? formatCurrency(metrics.totalInventoryValue) : '—'}
            </div>
            <p className="text-[10px] text-slate-400">At acquisition cost</p>
          </div>
        </div>
      </div>

      {/* 3. Stock Alerts & Insights Area (Part 7) */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div
            onClick={() => setShowAlertsSection(!showAlertsSection)}
            className="px-4 py-3 bg-slate-50/80 hover:bg-slate-100/60 cursor-pointer flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-slate-800">
                Authoritative Inventory Alerts ({alerts.length})
              </span>
              {criticalAlertsCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300 text-[10px] font-bold">
                  {criticalAlertsCount} Action Required
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-brand-600 hover:text-brand-700">
              {showAlertsSection ? 'Hide Alerts' : 'Show All Alerts'}
            </span>
          </div>

          {showAlertsSection && (
            <div className="p-4 space-y-2.5 max-h-72 overflow-y-auto divide-y divide-slate-100">
              {alerts.map((alert) => (
                <div key={alert.id} className="pt-2.5 first:pt-0 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider shrink-0 mt-0.5 ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-red-100 text-red-800 border border-red-300'
                          : alert.severity === 'HIGH'
                          ? 'bg-orange-100 text-orange-800 border border-orange-300'
                          : alert.severity === 'MEDIUM'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-slate-100 text-slate-700 border border-slate-300'
                      }`}
                    >
                      {alert.category.replace(/_/g, ' ')}
                    </span>
                    <div>
                      <p className="font-bold text-slate-900">
                        {alert.medicineName}
                        {alert.batchNumber && (
                          <span className="ml-2 font-mono text-[11px] text-slate-500 font-normal">
                            Batch: <span className="font-semibold text-slate-700">{alert.batchNumber}</span>
                          </span>
                        )}
                        <span className="ml-2 text-slate-600 font-normal">
                          — Available: <span className="font-bold">{alert.affectedQuantity} {alert.baseUnit}</span>
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        <span className="font-semibold text-slate-600">Action:</span> {alert.recommendedAction}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-[11px] font-mono text-slate-500 block">
                      {alert.thresholdOrExpiry}
                    </span>
                    {alert.daysLeft !== null && (
                      <span className={`text-[10px] font-semibold ${alert.daysLeft <= 0 ? 'text-red-600 font-bold' : 'text-amber-600'}`}>
                        {alert.daysLeft <= 0 ? 'Expired' : `${alert.daysLeft} days remaining`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. Comprehensive Filter Toolbar (Part 5) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Medicine, Generic, Brand, SKU or Batch..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:bg-white text-slate-800 placeholder-slate-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filter Counts & Clear */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              Showing <span className="font-bold text-slate-800">{items.length}</span> of{' '}
              <span className="font-bold text-slate-800">{totalItems}</span> matching medicines
            </span>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 rounded-md transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Filters ({activeFilterCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* Dropdowns & Range Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-slate-100">
          {/* Stock Status */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Stock Status
            </label>
            <select
              value={stockStatus}
              onChange={(e) => {
                setStockStatus(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <option value="ALL">All Stock Levels</option>
              <option value="IN_STOCK">In Stock (Positive)</option>
              <option value="LOW_STOCK">Low Stock (≤ Reorder)</option>
              <option value="OUT_OF_STOCK">Out of Stock (Zero)</option>
              <option value="NO_REORDER">No Reorder Level Unset</option>
            </select>
          </div>

          {/* Expiry Horizon */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Expiry Horizon
            </label>
            <select
              value={expiryStatus}
              onChange={(e) => {
                setExpiryStatus(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <option value="ALL">All Expiry Windows</option>
              <option value="EXPIRING_30">Expiring in 30 Days</option>
              <option value="EXPIRING_60">Expiring in 60 Days</option>
              <option value="EXPIRING_90">Expiring in 90 Days</option>
              <option value="EXPIRING_180">Expiring in 180 Days</option>
              <option value="EXPIRED">Already Expired</option>
              <option value="SAFE_SHELF">Safe Shelf Life (&gt; 180d)</option>
            </select>
          </div>

          {/* Dosage Form */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Dosage Form
            </label>
            <select
              value={dosageForm}
              onChange={(e) => {
                setDosageForm(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-brand-500 cursor-pointer"
            >
              <option value="">All Dosage Forms</option>
              {dosageOptions.map((df) => (
                <option key={df} value={df}>
                  {df}
                </option>
              ))}
            </select>
          </div>

          {/* Manufacturer */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Manufacturer
            </label>
            <select
              value={manufacturer}
              onChange={(e) => {
                setManufacturer(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-brand-500 cursor-pointer truncate"
            >
              <option value="">All Manufacturers</option>
              {mfgOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Batch Number Search */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Batch Number
            </label>
            <input
              type="text"
              value={batchNumber}
              onChange={(e) => {
                setBatchNumber(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. DL-26J01"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-brand-500 text-slate-800"
            />
          </div>

          {/* Sort By */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Sort By
            </label>
            <div className="flex items-center gap-1">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-500 cursor-pointer"
              >
                <option value="name">Medicine Name</option>
                <option value="stock">Available Stock</option>
                <option value="expiry">Nearest Expiry</option>
                <option value="batchCount">Batch Count</option>
                <option value="lastMovement">Last Movement</option>
              </select>
              <button
                type="button"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="p-1.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-600 shrink-0"
                title={`Order: ${sortOrder.toUpperCase()}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Authoritative Stock Inventory Table (Part 4) */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mx-auto" />
            <p className="text-xs font-semibold">Aggregating branch inventory balances and pack conversions...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-rose-600 space-y-3">
            <ShieldAlert className="w-8 h-8 mx-auto text-rose-500" />
            <p className="text-xs font-semibold">{error}</p>
            <button
              onClick={loadStockData}
              className="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg text-xs font-semibold"
            >
              Retry Query
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Boxes className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">No matching medicines found for the current branch filters.</p>
            <p className="text-[11px] text-slate-400">Try clearing active filters or selecting another branch.</p>
            {activeFilterCount > 0 && (
              <button
                onClick={handleClearFilters}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4">Medicine & Generic Name</th>
                  <th className="py-3 px-3">Form & Strength</th>
                  <th className="py-3 px-3">Manufacturer</th>
                  <th className="py-3 px-3">SKU / Code</th>
                  <th className="py-3 px-3 text-right">Available Stock</th>
                  <th className="py-3 px-3">Pack Equivalent</th>
                  <th className="py-3 px-3 text-center">Batches</th>
                  <th className="py-3 px-3">Nearest Expiry</th>
                  <th className="py-3 px-3 text-center">Stock Status</th>
                  <th className="py-3 px-3 text-center">Expiry Status</th>
                  <th className="py-3 px-3 text-right">Reorder Level</th>
                  <th className="py-3 px-3">Last Movement</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr
                    key={item.medicineId}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    onClick={() => handleViewBatches(item)}
                  >
                    {/* Medicine & Generic Name */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                        {item.medicineName}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs" title={item.genericName}>
                        {item.genericName}
                      </div>
                    </td>

                    {/* Form & Strength */}
                    <td className="py-3 px-3">
                      <span className="font-semibold text-slate-700 block">{item.dosageForm}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{item.strength}</span>
                    </td>

                    {/* Manufacturer */}
                    <td className="py-3 px-3">
                      <span className="text-slate-600 truncate block max-w-[140px]" title={item.manufacturer}>
                        {item.manufacturer}
                      </span>
                    </td>

                    {/* SKU / Code */}
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                      {item.internalCode}
                    </td>

                    {/* Total Available Stock */}
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`font-mono font-bold text-sm ${
                          item.totalAvailableStock === 0
                            ? 'text-rose-600'
                            : item.totalAvailableStock <= (item.reorderLevel ?? 10)
                            ? 'text-amber-600'
                            : 'text-slate-900'
                        }`}
                      >
                        {item.totalAvailableStock.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-1 block">{item.baseUnit}s</span>
                    </td>

                    {/* Pack Equivalent */}
                    <td className="py-3 px-3 font-medium text-slate-600 text-[11px]">
                      {item.packConversion.equivalentPacksText}
                    </td>

                    {/* Batch Count */}
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-slate-100 text-slate-700 border border-slate-200">
                        {item.batchCount} {item.batchCount === 1 ? 'batch' : 'batches'}
                      </span>
                    </td>

                    {/* Nearest Expiry */}
                    <td className="py-3 px-3">
                      {item.nearestExpiry ? (
                        <div>
                          <span className="font-mono text-slate-700 font-semibold block">
                            {formatDate(item.nearestExpiry)}
                          </span>
                          <span
                            className={`text-[10px] font-semibold ${
                              (item.nearestExpiryDays ?? 999) <= 0
                                ? 'text-red-600 font-bold'
                                : (item.nearestExpiryDays ?? 999) <= 60
                                ? 'text-orange-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {(item.nearestExpiryDays ?? 999) <= 0
                              ? 'Expired'
                              : `${item.nearestExpiryDays}d remaining`}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-mono text-[11px]">No active stock</span>
                      )}
                    </td>

                    {/* Stock Status Badge */}
                    <td className="py-3 px-3 text-center">
                      {item.stockStatus === 'IN_STOCK' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          In Stock
                        </span>
                      )}
                      {item.stockStatus === 'LOW_STOCK' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Low Stock
                        </span>
                      )}
                      {item.stockStatus === 'OUT_OF_STOCK' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          Out of Stock
                        </span>
                      )}
                    </td>

                    {/* Expiry Status Badge */}
                    <td className="py-3 px-3 text-center">
                      {item.expiryStatus === 'EXPIRED' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                          Expired
                        </span>
                      )}
                      {item.expiryStatus === 'NEAR_EXPIRY' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                          Near Expiry
                        </span>
                      )}
                      {item.expiryStatus === 'NORMAL' && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-600 border border-slate-200">
                          Normal
                        </span>
                      )}
                    </td>

                    {/* Reorder Level */}
                    <td className="py-3 px-3 text-right font-mono text-[11px]">
                      {item.reorderLevel !== null ? (
                        <span className="text-slate-600">{item.reorderLevel} {item.baseUnit}</span>
                      ) : (
                        <span className="text-slate-300 italic">Unset</span>
                      )}
                    </td>

                    {/* Last Stock Movement */}
                    <td className="py-3 px-3 text-[11px] text-slate-500">
                      {item.lastStockMovement ? (
                        <div>
                          <span className="font-mono text-slate-700 block">{formatDate(item.lastStockMovement)}</span>
                          <span className="text-[10px] text-slate-400 capitalize">
                            {item.lastStockMovementType?.toLowerCase().replace(/_/g, ' ')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Action Button */}
                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleViewBatches(item)}
                        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-brand-600 transition-colors"
                        title="View FEFO Batch Breakdown"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="p-3 bg-slate-50/80 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing Page <span className="font-bold text-slate-800">{page}</span> of{' '}
            <span className="font-bold text-slate-800">{totalPages}</span> ({totalItems} total medicines)
          </div>

          <div className="flex items-center gap-2">
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1 font-semibold text-slate-700"
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>

            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-2.5 py-1 border border-slate-200 bg-white rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-700 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-2.5 py-1 border border-slate-200 bg-white rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-700 flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 6. Read-Only Batch-Level Drill-Down Modal (Part 6) */}
      {showBatchModal && selectedMedicine && (
        <Modal
          isOpen={showBatchModal}
          onClose={() => {
            setShowBatchModal(false);
            setBatchDetails(null);
          }}
          title={`Batch Inventory Breakdown: ${selectedMedicine.medicineName}`}
          maxWidth="5xl"
        >
          <div className="space-y-5">
            {/* Medicine Profile Card */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Generic Formulation</span>
                <span className="font-semibold text-slate-800">{selectedMedicine.genericName}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Form & Strength</span>
                <span className="font-semibold text-slate-800">{selectedMedicine.dosageForm} ({selectedMedicine.strength})</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Manufacturer</span>
                <span className="font-semibold text-slate-800">{selectedMedicine.manufacturer}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Packaging Hierarchy</span>
                <span className="font-semibold text-slate-800">
                  1 {selectedMedicine.packageUnit} = {selectedMedicine.conversionFactor} {selectedMedicine.baseUnit}s
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Total Available Stock</span>
                <span className="font-bold text-sm font-mono text-brand-700">
                  {selectedMedicine.totalAvailableStock.toLocaleString()} {selectedMedicine.baseUnit}s
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Equivalent Packs</span>
                <span className="font-semibold text-slate-800">{selectedMedicine.packConversion.equivalentPacksText}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Configured Reorder Level</span>
                <span className="font-semibold text-slate-800 font-mono">
                  {selectedMedicine.reorderLevel !== null ? `${selectedMedicine.reorderLevel} ${selectedMedicine.baseUnit}s` : 'Unset'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Product Code (SKU)</span>
                <span className="font-semibold text-slate-800 font-mono">{selectedMedicine.internalCode}</span>
              </div>
            </div>

            {/* Read-Only Notice */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-blue-800">
              <Info className="w-4 h-4 text-blue-500 shrink-0" />
              <span>
                Batches are automatically sorted according to <strong>FEFO (First Expiry, First Out)</strong>. This view is strictly read-only and does not modify inventory.
              </span>
            </div>

            {/* Batch Table */}
            {loadingBatches ? (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <div className="w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mx-auto" />
                <p className="text-xs">Loading FEFO batch inventory records...</p>
              </div>
            ) : batchDetails?.batches?.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <p className="text-xs font-semibold">No stock batches recorded for this medicine in this branch.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-96">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                    <tr>
                      <th className="py-2.5 px-3">Batch Number</th>
                      <th className="py-2.5 px-3 text-right">Available Stock</th>
                      <th className="py-2.5 px-3">Pack Breakdown</th>
                      <th className="py-2.5 px-3 text-right">Cost Rate</th>
                      <th className="py-2.5 px-3 text-right">MRP</th>
                      <th className="py-2.5 px-3">Expiry Date</th>
                      <th className="py-2.5 px-3 text-center">Shelf Life</th>
                      <th className="py-2.5 px-3 text-center">Batch Status</th>
                      <th className="py-2.5 px-3">Supplier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batchDetails?.batches.map((batch) => (
                      <tr key={batch.id} className="hover:bg-slate-50">
                        {/* Batch Number */}
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {batch.batchNumber}
                        </td>

                        {/* Available Stock */}
                        <td className="py-2.5 px-3 text-right">
                          <span className={`font-mono font-bold ${batch.availableQuantity === 0 ? 'text-slate-400' : 'text-slate-900'}`}>
                            {batch.availableQuantity.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-1">{batch.baseUnit}s</span>
                        </td>

                        {/* Pack Breakdown */}
                        <td className="py-2.5 px-3 text-[11px] text-slate-600 font-medium">
                          {batch.equivalentPacksText}
                        </td>

                        {/* Cost Rate */}
                        <td className="py-2.5 px-3 text-right font-mono">
                          <span className="text-slate-800">{formatCurrency(batch.purchaseRate)}</span>
                          <span className="text-[10px] text-slate-400 block">per {batch.baseUnit}</span>
                        </td>

                        {/* MRP */}
                        <td className="py-2.5 px-3 text-right font-mono">
                          <span className="text-slate-800">{formatCurrency(batch.mrp)}</span>
                          <span className="text-[10px] text-slate-400 block">per {batch.baseUnit}</span>
                        </td>

                        {/* Expiry Date */}
                        <td className="py-2.5 px-3 font-mono text-slate-800 font-semibold">
                          {formatDate(batch.expiryDate)}
                        </td>

                        {/* Shelf Life / Days Left */}
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                              batch.daysToExpiry <= 0
                                ? 'bg-red-100 text-red-800 border border-red-300'
                                : batch.daysToExpiry <= 60
                                ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {batch.daysToExpiry <= 0 ? 'Expired' : `${batch.daysToExpiry} days`}
                          </span>
                        </td>

                        {/* Batch Status */}
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                              batch.status === 'ACTIVE'
                                ? 'bg-slate-100 text-slate-700'
                                : batch.status === 'QUARANTINE'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {batch.status}
                          </span>
                        </td>

                        {/* Supplier */}
                        <td className="py-2.5 px-3 text-slate-600 truncate max-w-[150px]" title={batch.supplierName}>
                          {batch.supplierName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowBatchModal(false);
                  setBatchDetails(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
              >
                Close Monitoring Drill-Down
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
