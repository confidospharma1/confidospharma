import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { StockBatch, MedicineProduct, Supplier } from '../types';
import {
  Boxes,
  Plus,
  SlidersHorizontal,
  History,
  AlertTriangle,
  ShieldAlert,
  Search,
  CheckCircle2,
  Calendar,
  Layers,
  Filter,
  X,
  Edit2,
  Trash2,
  Eye,
  CheckSquare,
  Square,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ArrowDownRight,
  ArrowUpRight,
  Scale,
  Receipt,
  Package,
  Clock,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Info,
  DollarSign,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { FilterButton } from '../components/FilterButton';
import { FilterField, FilterSelect, FilterInput } from '../components/FilterControls';
import { PermissionDeniedModal } from '../components/PermissionDeniedModal';

interface LedgerSummaryData {
  period: {
    label: string;
    startDate: string;
    endDate: string;
  };
  openingStock: {
    quantity: number;
    value: number;
  };
  inward: {
    quantity: number;
    cost: number;
  };
  outward: {
    quantity: number;
    value: number;
  };
  currentStock: {
    quantity: number;
    value: number;
  };
  inwardCost: number;
  outwardValue: number;
  salesRevenue: number;
  cogs: number;
  grossProfit: number;
  grossProfitMargin: number;
  adjustments: {
    netQuantity: number;
    netValue: number;
    damaged: { quantity: number; value: number };
    expired: { quantity: number; value: number };
    corrections: { quantity: number; value: number };
    supplierReturns: { quantity: number; value: number };
    customerReturns: { quantity: number; value: number };
  };
  valuationMethod: string;
}

interface LedgerMovementItem {
  id: string;
  transactionDate: string;
  movementType: string;
  movementTypeLabel: string;
  quantityDelta: number;
  quantityInward: number;
  quantityOutward: number;
  unitPurchaseCost: number;
  totalMovementValue: number;
  referenceDocType?: string;
  referenceDocId?: string;
  reason?: string;
  medicine: {
    id: string;
    brandName: string;
    genericName: string;
    strength: string;
    dosageForm: string;
    baseUnit: string;
    packageUnit?: string;
    conversionFactor?: number;
  };
  batch: {
    id: string;
    batchNumber: string;
    expiryDate: string;
    availableQuantity: number;
    supplier?: { id: string; name: string } | null;
  } | null;
  branch: {
    id: string;
    code: string;
    name: string;
  };
  performedBy: {
    id: string;
    username: string;
    fullName: string;
    role: string;
  };
}

export const InventoryPage: React.FC = () => {
  const { currentBranch, selectedBranchId, isSuperAdmin, isBillingUser } = useAuth();

  // Top Section Mode: 'ledger' (Dashboard & Movements) vs 'batches' (Batch Balances & Operations)
  const [activeViewMode, setActiveViewMode] = useState<'ledger' | 'batches'>('ledger');

  // Ledger Filter State
  const [period, setPeriod] = useState<'today' | 'last7days' | 'last30days' | 'custom'>('last7days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('ALL');
  const [movementSearchQuery, setMovementSearchQuery] = useState('');
  const [movementPage, setMovementPage] = useState(1);
  const [movementLimit, setMovementLimit] = useState(25);

  // Ledger Data State
  const [ledgerSummary, setLedgerSummary] = useState<LedgerSummaryData | null>(null);
  const [ledgerMovements, setLedgerMovements] = useState<LedgerMovementItem[]>([]);
  const [movementTotal, setMovementTotal] = useState(0);
  const [movementTotalPages, setMovementTotalPages] = useState(1);
  const [isLedgerLoading, setIsLedgerLoading] = useState(true);
  const [isExportingCSV, setIsExportingCSV] = useState(false);

  // Batches View State (Preserved from existing inventory page)
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [filterTab, setFilterTab] = useState<'ALL' | 'ACTIVE' | 'NEAR_EXPIRY' | 'EXPIRED'>('ACTIVE');
  const [batchSearchQuery, setBatchSearchQuery] = useState('');

  // Bulk Selection State for Batches View
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<'QUARANTINE' | 'ACTIVE' | 'DEPLETED' | 'DELETE' | null>(null);
  const [isExecutingBulk, setIsExecutingBulk] = useState(false);

  // Edit Batch Modal
  const [editingBatch, setEditingBatch] = useState<StockBatch | null>(null);
  const [showEditBatchModal, setShowEditBatchModal] = useState(false);
  const [editBatchForm, setEditBatchForm] = useState({
    batchNumber: '',
    expiryDate: '',
    mrp: '',
    sellingPrice: '',
    status: 'ACTIVE',
  });

  // Delete Batch Confirmation Modal
  const [deletingBatch, setDeletingBatch] = useState<StockBatch | null>(null);
  const [showDeleteBatchModal, setShowDeleteBatchModal] = useState(false);

  // View Batch Details Modal
  const [viewingBatch, setViewingBatch] = useState<StockBatch | null>(null);
  const [showViewBatchModal, setShowViewBatchModal] = useState(false);

  // Permission Restriction Modal for Branch Admin
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  // Reference lists for forms
  const [products, setProducts] = useState<MedicineProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Receive Batch Form
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveForm, setReceiveForm] = useState({
    medicineId: '',
    batchNumber: '',
    expiryDate: '',
    quantity: '',
    purchaseRate: '',
    mrp: '',
    sellingPrice: '',
    supplierId: '',
    purchaseInvoiceRef: '',
  });

  // Adjust Form
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustBatch, setAdjustBatch] = useState<StockBatch | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    adjustmentType: 'PHYSICAL_COUNT_DISCREPANCY',
    quantityDelta: '',
    reason: '',
  });

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Load Ledger Summary and Movements
  const loadLedgerData = useCallback(async () => {
    setIsLedgerLoading(true);
    try {
      const summaryParams: any = {
        branchId: selectedBranchId,
        period,
      };
      if (period === 'custom') {
        if (customStartDate) summaryParams.startDate = customStartDate;
        if (customEndDate) summaryParams.endDate = customEndDate;
      }

      const movementParams: any = {
        branchId: selectedBranchId,
        period,
        page: movementPage,
        limit: movementLimit,
      };
      if (period === 'custom') {
        if (customStartDate) movementParams.startDate = customStartDate;
        if (customEndDate) movementParams.endDate = customEndDate;
      }
      if (movementTypeFilter && movementTypeFilter !== 'ALL') {
        movementParams.movementType = movementTypeFilter;
      }
      if (movementSearchQuery.trim()) {
        movementParams.search = movementSearchQuery.trim();
      }

      const [summaryRes, movementsRes] = await Promise.all([
        api.getInventoryLedgerSummary(summaryParams),
        api.getInventoryLedgerMovements(movementParams),
      ]);

      setLedgerSummary(summaryRes);
      setLedgerMovements(movementsRes.movements || []);
      setMovementTotal(movementsRes.total || 0);
      setMovementTotalPages(movementsRes.totalPages || 1);
    } catch (err: any) {
      console.error('Failed to load ledger data:', err);
      setMessage({ text: err.message || 'Failed to load inventory ledger data', type: 'error' });
    } finally {
      setIsLedgerLoading(false);
    }
  }, [selectedBranchId, period, customStartDate, customEndDate, movementTypeFilter, movementSearchQuery, movementPage, movementLimit]);

  // Load Batches (for Batches view)
  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    try {
      const params: any = { branchId: selectedBranchId };
      if (filterTab === 'ACTIVE') params.status = 'ACTIVE';
      if (filterTab === 'NEAR_EXPIRY') params.nearExpiry = true;
      if (filterTab === 'EXPIRED') params.expired = true;

      const data = await api.getBatches(params);
      setBatches(data);
    } catch (err) {
      console.error('Failed to load batches:', err);
    } finally {
      setBatchesLoading(false);
    }
  }, [selectedBranchId, filterTab]);

  const loadReferenceData = async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        api.getProducts({ limit: 200 }),
        api.getSuppliers(),
      ]);
      setProducts(pRes.products || pRes);
      setSuppliers(sRes);
    } catch (err) {
      console.error('Failed to load references:', err);
    }
  };

  useEffect(() => {
    loadLedgerData();
  }, [loadLedgerData]);

  useEffect(() => {
    if (activeViewMode === 'batches') {
      loadBatches();
    }
  }, [activeViewMode, loadBatches]);

  useEffect(() => {
    loadReferenceData();
  }, []);

  // Quick Date Filter Change
  const handlePeriodChange = (newPeriod: 'today' | 'last7days' | 'last30days' | 'custom') => {
    setPeriod(newPeriod);
    setMovementPage(1);
  };

  // Export Filtered Movements to CSV
  const handleExportCSV = async () => {
    setIsExportingCSV(true);
    try {
      const params: any = {
        branchId: selectedBranchId,
        period,
        page: 1,
        limit: 100, // Export up to 100 records
      };
      if (period === 'custom') {
        if (customStartDate) params.startDate = customStartDate;
        if (customEndDate) params.endDate = customEndDate;
      }
      if (movementTypeFilter && movementTypeFilter !== 'ALL') {
        params.movementType = movementTypeFilter;
      }
      if (movementSearchQuery.trim()) {
        params.search = movementSearchQuery.trim();
      }

      const res = await api.getInventoryLedgerMovements(params);
      const items: LedgerMovementItem[] = res.movements || [];

      if (items.length === 0) {
        setMessage({ text: 'No movement records found to export.', type: 'error' });
        return;
      }

      const headers = [
        'Transaction Date',
        'Medicine Name',
        'Generic Name',
        'Dosage Form',
        'Base Unit',
        'Batch Number',
        'Expiry Date',
        'Supplier',
        'Movement Type',
        'Inward Quantity',
        'Outward Quantity',
        'Unit Purchase Cost (INR)',
        'Total Movement Value (INR)',
        'Reference Doc Type',
        'Reference Doc ID',
        'Reason',
        'Recorded By',
      ];

      const csvRows = [
        headers.join(','),
        ...items.map((m) =>
          [
            `"${new Date(m.transactionDate).toLocaleString('en-IN')}"`,
            `"${(m.medicine.brandName || '').replace(/"/g, '""')}"`,
            `"${(m.medicine.genericName || '').replace(/"/g, '""')}"`,
            `"${m.medicine.dosageForm || ''}"`,
            `"${m.medicine.baseUnit || ''}"`,
            `"${m.batch?.batchNumber || ''}"`,
            `"${m.batch?.expiryDate ? new Date(m.batch.expiryDate).toLocaleDateString('en-IN') : ''}"`,
            `"${(m.batch?.supplier?.name || '').replace(/"/g, '""')}"`,
            `"${m.movementTypeLabel}"`,
            m.quantityInward,
            m.quantityOutward,
            m.unitPurchaseCost.toFixed(2),
            m.totalMovementValue.toFixed(2),
            `"${m.referenceDocType || ''}"`,
            `"${m.referenceDocId || ''}"`,
            `"${(m.reason || '').replace(/"/g, '""')}"`,
            `"${m.performedBy.fullName || m.performedBy.username}"`,
          ].join(',')
        ),
      ];

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `confidos_inventory_ledger_${new Date().toISOString().slice(0, 10)}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setMessage({ text: `Successfully exported ${items.length} movement records to CSV.`, type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to export CSV', type: 'error' });
    } finally {
      setIsExportingCSV(false);
    }
  };

  // Handle Receive Stock Form Submission
  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.receiveBatch({
        ...receiveForm,
        branchId: selectedBranchId,
      });
      setMessage({ text: 'Stock received and ledger recorded successfully!', type: 'success' });
      setShowReceiveModal(false);
      setReceiveForm({
        medicineId: '',
        batchNumber: '',
        expiryDate: '',
        quantity: '',
        purchaseRate: '',
        mrp: '',
        sellingPrice: '',
        supplierId: '',
        purchaseInvoiceRef: '',
      });
      loadLedgerData();
      if (activeViewMode === 'batches') loadBatches();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to receive stock', type: 'error' });
    }
  };

  // Handle Adjust Stock Form Submission
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustBatch) return;

    try {
      await api.adjustStock({
        batchId: adjustBatch.id,
        adjustmentType: adjustForm.adjustmentType,
        quantityDelta: parseInt(adjustForm.quantityDelta),
        reason: adjustForm.reason,
      });
      setMessage({ text: 'Stock adjustment and ledger recorded successfully!', type: 'success' });
      setShowAdjustModal(false);
      setAdjustBatch(null);
      setAdjustForm({
        adjustmentType: 'PHYSICAL_COUNT_DISCREPANCY',
        quantityDelta: '',
        reason: '',
      });
      loadLedgerData();
      if (activeViewMode === 'batches') loadBatches();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to adjust stock', type: 'error' });
    }
  };

  // Batches View Actions
  const handleEditBatch = (batch: StockBatch) => {
    setEditingBatch(batch);
    setEditBatchForm({
      batchNumber: batch.batchNumber,
      expiryDate: new Date(batch.expiryDate).toISOString().split('T')[0],
      mrp: batch.mrp.toString(),
      sellingPrice: batch.sellingPrice.toString(),
      status: batch.status,
    });
    setShowEditBatchModal(true);
  };

  const handleSaveEditBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBatch) return;

    try {
      await api.updateBatch(editingBatch.id, {
        batchNumber: editBatchForm.batchNumber,
        expiryDate: editBatchForm.expiryDate,
        mrp: parseFloat(editBatchForm.mrp),
        sellingPrice: parseFloat(editBatchForm.sellingPrice),
        status: editBatchForm.status,
      });

      setMessage({ text: `Batch ${editBatchForm.batchNumber} updated successfully.`, type: 'success' });
      setShowEditBatchModal(false);
      setEditingBatch(null);
      loadBatches();
      loadLedgerData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update batch.', type: 'error' });
    }
  };

  const handleDeleteBatch = (batch: StockBatch) => {
    if (!isSuperAdmin) {
      setShowPermissionModal(true);
      return;
    }
    setDeletingBatch(batch);
    setShowDeleteBatchModal(true);
  };

  const handleConfirmDeleteBatch = async () => {
    if (!deletingBatch) return;
    try {
      const res = await api.deleteBatch(deletingBatch.id);
      setMessage({
        text: res.message || `Batch ${deletingBatch.batchNumber} processed successfully.`,
        type: 'success',
      });
      setShowDeleteBatchModal(false);
      setDeletingBatch(null);
      loadBatches();
      loadLedgerData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to delete batch.', type: 'error' });
    }
  };

  const handleExecuteBulkAction = async () => {
    if (!bulkActionType || selectedBatchIds.length === 0) return;
    setIsExecutingBulk(true);
    try {
      const res = await api.bulkBatchAction({
        batchIds: selectedBatchIds,
        action: bulkActionType,
      });

      setMessage({ text: res.message || 'Bulk action executed successfully.', type: 'success' });
      setShowBulkModal(false);
      setSelectedBatchIds([]);
      setBulkActionType(null);
      loadBatches();
      loadLedgerData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to execute bulk action.', type: 'error' });
    } finally {
      setIsExecutingBulk(false);
    }
  };

  // Helper for Badge colors
  const getMovementBadge = (type: string, label: string) => {
    switch (type) {
      case 'PURCHASE_RECEIPT':
        return <Badge variant="success">{label}</Badge>;
      case 'SALE':
        return <Badge variant="info">{label}</Badge>;
      case 'CUSTOMER_RETURN':
        return <Badge variant="warning">{label}</Badge>;
      case 'SUPPLIER_RETURN':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">{label}</span>;
      case 'STOCK_CORRECTION':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800">{label}</span>;
      case 'DAMAGE_EXPIRY':
        return <Badge variant="danger">{label}</Badge>;
      case 'TRANSFER_IN':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">{label}</span>;
      case 'TRANSFER_OUT':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">{label}</span>;
      default:
        return <Badge variant="neutral">{label}</Badge>;
    }
  };

  return (
    <div className="p-3.5 sm:p-5 md:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Alert Notification */}
      {message && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between shadow-xs border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold">
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand-50 text-brand-600 rounded-lg">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Inventory Management</h1>
                {currentBranch && (
                  <span className="text-xs px-2.5 py-0.5 bg-slate-100 text-slate-700 font-semibold rounded-full border border-slate-200">
                    {currentBranch.name} ({currentBranch.code})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Ledger-based inventory tracking, real-time stock balances, and financial valuation
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowReceiveModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Receive Stock</span>
          </button>
          <button
            onClick={() => setShowAdjustModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4 text-slate-500" />
            <span>Adjust Stock</span>
          </button>
          <button
            onClick={handleExportCSV}
            disabled={isExportingCSV}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors"
            title="Export filtered movements to CSV"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>{isExportingCSV ? 'Exporting...' : 'Export CSV'}</span>
          </button>
          <button
            onClick={() => {
              loadLedgerData();
              if (activeViewMode === 'batches') loadBatches();
            }}
            className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Top Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-2 sm:px-4 pt-2 sm:pt-3 rounded-t-xl overflow-x-auto whitespace-nowrap">
        <button
          onClick={() => setActiveViewMode('ledger')}
          className={`flex items-center gap-2 pb-3 px-4 text-xs font-bold border-b-2 transition-all ${
            activeViewMode === 'ledger'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Stock Movement Ledger & Financials</span>
        </button>
        <button
          onClick={() => setActiveViewMode('batches')}
          className={`flex items-center gap-2 pb-3 px-4 text-xs font-bold border-b-2 transition-all ${
            activeViewMode === 'batches'
              ? 'border-brand-500 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Batch Balances & Operations</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* VIEW MODE 1: STOCK MOVEMENT LEDGER & FINANCIALS                          */}
      {/* ========================================================================= */}
      {activeViewMode === 'ledger' && (
        <div className="space-y-6">
          {/* Date & Range Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600 mr-1 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  Period:
                </span>
                <button
                  onClick={() => handlePeriodChange('today')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    period === 'today'
                      ? 'bg-brand-500 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => handlePeriodChange('last7days')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    period === 'last7days'
                      ? 'bg-brand-500 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Last 7 Days
                </button>
                <button
                  onClick={() => handlePeriodChange('last30days')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    period === 'last30days'
                      ? 'bg-brand-500 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Last 30 Days
                </button>
                <button
                  onClick={() => handlePeriodChange('custom')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    period === 'custom'
                      ? 'bg-brand-500 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Custom Range
                </button>
              </div>

              {/* Movement Type Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Movement:</span>
                <select
                  value={movementTypeFilter}
                  onChange={(e) => {
                    setMovementTypeFilter(e.target.value);
                    setMovementPage(1);
                  }}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="ALL">All Movements</option>
                  <option value="PURCHASE_RECEIPT">Purchase / Inward</option>
                  <option value="SALE">Retail Sale / Outward</option>
                  <option value="CUSTOMER_RETURN">Customer Return</option>
                  <option value="SUPPLIER_RETURN">Supplier Return</option>
                  <option value="STOCK_CORRECTION">Stock Correction</option>
                  <option value="DAMAGE_EXPIRY">Damage / Expiry</option>
                  <option value="TRANSFER_IN">Transfer In</option>
                  <option value="TRANSFER_OUT">Transfer Out</option>
                </select>
              </div>
            </div>

            {/* Custom Date Pickers */}
            {period === 'custom' && (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-600">From Date:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-1 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-600">To Date:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-1 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
                  />
                </div>
                <button
                  onClick={loadLedgerData}
                  className="px-3 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  Apply Dates
                </button>
              </div>
            )}
          </div>

          {/* 8 KPI Summary Cards (Requirement 4) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Opening Stock */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                <span className="font-semibold">Opening Stock</span>
                <Clock className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-xl font-bold text-slate-900">
                {ledgerSummary ? ledgerSummary.openingStock.quantity.toLocaleString('en-IN') : '...'} <span className="text-xs font-normal text-slate-500">units</span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex justify-between">
                <span>Opening Valuation:</span>
                <span className="font-semibold text-slate-700">
                  ₹{ledgerSummary ? ledgerSummary.openingStock.value.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 border-t border-slate-100 pt-1">
                Stock balance prior to {ledgerSummary?.period.label || 'period'}
              </p>
            </div>

            {/* Card 2: Stock Inward */}
            <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-xs">
              <div className="flex items-center justify-between text-emerald-700 text-xs mb-1">
                <span className="font-semibold">Stock Inward</span>
                <ArrowDownRight className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-bold text-emerald-700">
                +{ledgerSummary ? ledgerSummary.inward.quantity.toLocaleString('en-IN') : '...'} <span className="text-xs font-normal text-emerald-600">units</span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex justify-between">
                <span>Inward Cost:</span>
                <span className="font-semibold text-emerald-800">
                  ₹{ledgerSummary ? ledgerSummary.inwardCost.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 border-t border-slate-100 pt-1">
                Purchases & customer returns received
              </p>
            </div>

            {/* Card 3: Stock Outward */}
            <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-xs">
              <div className="flex items-center justify-between text-blue-700 text-xs mb-1">
                <span className="font-semibold">Stock Outward</span>
                <ArrowUpRight className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl font-bold text-blue-700">
                -{ledgerSummary ? ledgerSummary.outward.quantity.toLocaleString('en-IN') : '...'} <span className="text-xs font-normal text-blue-600">units</span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex justify-between">
                <span>Cost Basis:</span>
                <span className="font-semibold text-blue-800">
                  ₹{ledgerSummary ? ledgerSummary.outwardValue.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 border-t border-slate-100 pt-1">
                Sales & supplier returns issued
              </p>
            </div>

            {/* Card 4: Current Available Stock (Live Total) */}
            <div className="bg-white p-4 rounded-xl border border-brand-200 shadow-xs bg-gradient-to-br from-white to-brand-50/20">
              <div className="flex items-center justify-between text-brand-700 text-xs mb-1">
                <span className="font-bold uppercase tracking-wider">Current Stock (Live)</span>
                <Boxes className="w-4 h-4 text-brand-500" />
              </div>
              <div className="text-xl font-bold text-brand-700">
                {ledgerSummary ? ledgerSummary.currentStock.quantity.toLocaleString('en-IN') : '...'} <span className="text-xs font-normal text-brand-600">units</span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex justify-between">
                <span>Asset Valuation:</span>
                <span className="font-semibold text-slate-900">
                  ₹{ledgerSummary ? ledgerSummary.currentStock.value.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 border-t border-slate-100 pt-1">
                Live on-hand balance in branch right now
              </p>
            </div>

            {/* Card 5: Inward Cost */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                <span className="font-semibold">Inward Cost</span>
                <Receipt className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-xl font-bold text-slate-900">
                ₹{ledgerSummary ? ledgerSummary.inwardCost.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Cost paid to acquire stock during {ledgerSummary?.period.label.toLowerCase() || 'period'}
              </p>
              <p className="text-[10px] text-slate-400 mt-1 border-t border-slate-100 pt-1">
                Calculated in canonical base units
              </p>
            </div>

            {/* Card 6: Outward Value (Valuation Basis) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                <span className="font-semibold">Outward Value</span>
                <Scale className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-xl font-bold text-slate-900">
                ₹{ledgerSummary ? ledgerSummary.outwardValue.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Acquisition cost of stock issued during period
              </p>
              <p className="text-[10px] text-slate-400 mt-1 border-t border-slate-100 pt-1">
                Method: Batch-Specific Acquisition Cost
              </p>
            </div>

            {/* Card 7: Gross Profit / Loss */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                <span className="font-semibold">Gross Profit / Loss</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className={`text-xl font-bold ${ledgerSummary && ledgerSummary.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                ₹{ledgerSummary ? ledgerSummary.grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                {ledgerSummary && (
                  <span className="text-xs font-semibold ml-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">
                    {ledgerSummary.grossProfitMargin.toFixed(1)}% margin
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1 flex justify-between">
                <span>Revenue: ₹{ledgerSummary ? ledgerSummary.salesRevenue.toLocaleString('en-IN') : '0'}</span>
                <span>COGS: ₹{ledgerSummary ? ledgerSummary.cogs.toLocaleString('en-IN') : '0'}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 border-t border-slate-100 pt-1">
                Eligible counter sales minus cost of goods sold
              </p>
            </div>

            {/* Card 8: Stock Adjustments */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                <span className="font-semibold">Stock Adjustments</span>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-xl font-bold text-slate-900">
                {ledgerSummary && ledgerSummary.adjustments.netQuantity > 0 ? '+' : ''}
                {ledgerSummary ? ledgerSummary.adjustments.netQuantity.toLocaleString('en-IN') : '0'} <span className="text-xs font-normal text-slate-500">units</span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex justify-between">
                <span>Net Value:</span>
                <span className="font-semibold text-slate-700">
                  ₹{ledgerSummary ? Math.abs(ledgerSummary.adjustments.netValue).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1 border-t border-slate-100 pt-1 flex gap-2">
                <span>Dmg: {ledgerSummary?.adjustments.damaged.quantity || 0}</span>
                <span>Exp: {ledgerSummary?.adjustments.expired.quantity || 0}</span>
                <span>Corr: {ledgerSummary?.adjustments.corrections.quantity || 0}</span>
              </div>
            </div>
          </div>

          {/* Movement Table Search and Filters */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search medicine, batch, doc #, reason..."
                  value={movementSearchQuery}
                  onChange={(e) => {
                    setMovementSearchQuery(e.target.value);
                    setMovementPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>
                  Showing <strong>{ledgerMovements.length}</strong> of <strong>{movementTotal}</strong> movements
                </span>
                <select
                  value={movementLimit}
                  onChange={(e) => {
                    setMovementLimit(parseInt(e.target.value));
                    setMovementPage(1);
                  }}
                  className="px-2 py-1 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
                >
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
              </div>
            </div>

            {/* Detailed Movement Ledger Table (Requirement 5) */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[850px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider select-none">
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Medicine / Dosage</th>
                    <th className="py-3 px-4">Batch / Expiry / Supplier</th>
                    <th className="py-3 px-4">Movement Type</th>
                    <th className="py-3 px-4 text-right">Inward Qty</th>
                    <th className="py-3 px-4 text-right">Outward Qty</th>
                    <th className="py-3 px-4 text-right">Unit Cost</th>
                    <th className="py-3 px-4 text-right">Total Value</th>
                    <th className="py-3 px-4 text-right">Batch Stock</th>
                    <th className="py-3 px-4">Source Ref & User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLedgerLoading ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                          <p className="text-xs font-semibold text-slate-600">Loading stock movements ledger...</p>
                        </div>
                      </td>
                    </tr>
                  ) : ledgerMovements.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-semibold text-slate-600">No stock movements found</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Try adjusting your date range or movement type filters.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    ledgerMovements.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* 1. Transaction Date */}
                        <td className="py-3 px-4 whitespace-nowrap text-slate-700 font-medium">
                          {new Date(m.transactionDate).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                          <span className="block text-[10px] text-slate-400">
                            {new Date(m.transactionDate).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </td>

                        {/* 2. Medicine & Generic Name */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 leading-snug">
                            {m.medicine.brandName}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-xs">
                            {m.medicine.genericName}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {m.medicine.dosageForm} • Base: <strong>{m.medicine.baseUnit}</strong>
                          </div>
                        </td>

                        {/* 3. Batch, Expiry, Supplier */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {m.batch ? (
                            <>
                              <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                                {m.batch.batchNumber}
                              </span>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                Exp: {new Date(m.batch.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                                {m.batch.supplier?.name || 'Direct / Catalogue'}
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        {/* 4. Movement Type */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {getMovementBadge(m.movementType, m.movementTypeLabel)}
                        </td>

                        {/* 5. Quantity Inward */}
                        <td className="py-3 px-4 text-right font-bold text-emerald-600 whitespace-nowrap">
                          {m.quantityInward > 0 ? `+${m.quantityInward.toLocaleString('en-IN')}` : '—'}
                        </td>

                        {/* 6. Quantity Outward */}
                        <td className="py-3 px-4 text-right font-bold text-blue-600 whitespace-nowrap">
                          {m.quantityOutward > 0 ? `-${m.quantityOutward.toLocaleString('en-IN')}` : '—'}
                        </td>

                        {/* 7. Unit Purchase Cost */}
                        <td className="py-3 px-4 text-right whitespace-nowrap text-slate-700">
                          ₹{m.unitPurchaseCost.toFixed(2)}
                        </td>

                        {/* 8. Total Movement Value */}
                        <td className="py-3 px-4 text-right font-semibold text-slate-900 whitespace-nowrap">
                          ₹{m.totalMovementValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>

                        {/* 9. Available Batch Quantity */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {m.batch ? (
                            <span className="font-bold text-slate-800">
                              {m.batch.availableQuantity.toLocaleString('en-IN')}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* 10. Source Reference and Recorded By */}
                        <td className="py-3 px-4 text-xs">
                          {m.referenceDocId && (
                            <span className="font-mono text-[10px] text-brand-600 font-semibold block">
                              {m.referenceDocType ? `${m.referenceDocType}: ` : ''}{m.referenceDocId}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500 block truncate max-w-[160px]" title={m.reason}>
                            {m.reason || 'Ledger transaction'}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            By: {m.performedBy.fullName || m.performedBy.username}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Bar */}
            {movementTotalPages > 1 && (
              <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs bg-slate-50/50">
                <span className="text-slate-500">
                  Page <strong>{movementPage}</strong> of <strong>{movementTotalPages}</strong> ({movementTotal} total movements)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={movementPage <= 1}
                    onClick={() => setMovementPage((prev) => Math.max(1, prev - 1))}
                    className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-3 py-1 text-slate-700 font-bold bg-white border border-slate-200 rounded-lg">
                    {movementPage}
                  </span>
                  <button
                    disabled={movementPage >= movementTotalPages}
                    onClick={() => setMovementPage((prev) => Math.min(movementTotalPages, prev + 1))}
                    className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW MODE 2: BATCH BALANCES & OPERATIONS (Preserved)                       */}
      {/* ========================================================================= */}
      {activeViewMode === 'batches' && (
        <div className="space-y-6">
          {/* Batches Sub-tabs & Search */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterTab('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterTab === 'ALL'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Batches
              </button>
              <button
                onClick={() => setFilterTab('ACTIVE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterTab === 'ACTIVE'
                    ? 'bg-brand-500 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Active Saleable
              </button>
              <button
                onClick={() => setFilterTab('NEAR_EXPIRY')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterTab === 'NEAR_EXPIRY'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Near Expiry (&lt;60d)
              </button>
              <button
                onClick={() => setFilterTab('EXPIRED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterTab === 'EXPIRED'
                    ? 'bg-rose-500 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Expired
              </button>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search batch # or medicine..."
                value={batchSearchQuery}
                onChange={(e) => setBatchSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Batches Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[750px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Medicine</th>
                    <th className="py-3 px-4">Batch Number</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4 text-right">Available Qty</th>
                    <th className="py-3 px-4 text-right">Purchase Rate</th>
                    <th className="py-3 px-4 text-right">MRP</th>
                    <th className="py-3 px-4 text-right">Selling Price</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batchesLoading ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        Loading batches...
                      </td>
                    </tr>
                  ) : batches.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No stock batches found for this filter.
                      </td>
                    </tr>
                  ) : (
                    batches
                      .filter(
                        (b) =>
                          !batchSearchQuery ||
                          b.batchNumber.toLowerCase().includes(batchSearchQuery.toLowerCase()) ||
                          b.medicine?.brandName.toLowerCase().includes(batchSearchQuery.toLowerCase())
                      )
                      .map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{b.medicine?.brandName}</div>
                            <div className="text-[10px] text-slate-400">{b.medicine?.genericName}</div>
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                            {b.batchNumber}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {new Date(b.expiryDate).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">
                            {b.availableQuantity.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-700">₹{b.purchaseRate.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-slate-700">₹{b.mrp.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-semibold text-slate-900">
                            ₹{b.sellingPrice.toFixed(2)}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={
                                b.status === 'ACTIVE'
                                  ? 'success'
                                  : b.status === 'QUARANTINE'
                                  ? 'warning'
                                  : 'danger'
                              }
                            >
                              {b.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleEditBatch(b)}
                                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors"
                                title="Edit batch"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteBatch(b)}
                                className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition-colors"
                                title="Delete batch"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
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

      {/* ========================================================================= */}
      {/* MODALS                                                                    */}
      {/* ========================================================================= */}

      {/* Modal: Manual Receive Stock Batch */}
      <Modal isOpen={showReceiveModal} onClose={() => setShowReceiveModal(false)} title="Receive Stock Batch (Inward)">
        <form onSubmit={handleReceiveStock} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Select Medicine *</label>
            <select
              required
              value={receiveForm.medicineId}
              onChange={(e) => {
                const med = products.find((p) => p.id === e.target.value);
                setReceiveForm({
                  ...receiveForm,
                  medicineId: e.target.value,
                  purchaseRate: med?.defaultPurchaseRate?.toString() || '',
                  mrp: med?.mrp.toString() || '',
                  sellingPrice: med?.defaultSellingRate?.toString() || med?.mrp.toString() || '',
                });
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
            >
              <option value="">-- Choose Medicine --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brandName} ({p.strength}) - MRP ₹{p.mrp}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Batch Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. B-2026-99"
                value={receiveForm.batchNumber}
                onChange={(e) => setReceiveForm({ ...receiveForm, batchNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Expiry Date *</label>
              <input
                type="date"
                required
                value={receiveForm.expiryDate}
                onChange={(e) => setReceiveForm({ ...receiveForm, expiryDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Quantity (Base Units) *</label>
              <input
                type="number"
                required
                min="1"
                placeholder="e.g. 100"
                value={receiveForm.quantity}
                onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Purchase Rate (₹/unit) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="₹ 0.00"
                value={receiveForm.purchaseRate}
                onChange={(e) => setReceiveForm({ ...receiveForm, purchaseRate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">MRP (₹/unit) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="₹ 0.00"
                value={receiveForm.mrp}
                onChange={(e) => setReceiveForm({ ...receiveForm, mrp: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Selling Price (₹/unit) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="₹ 0.00"
                value={receiveForm.sellingPrice}
                onChange={(e) => setReceiveForm({ ...receiveForm, sellingPrice: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Supplier (Optional)</label>
              <select
                value={receiveForm.supplierId}
                onChange={(e) => setReceiveForm({ ...receiveForm, supplierId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
              >
                <option value="">-- Choose Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Invoice / Reference #</label>
              <input
                type="text"
                placeholder="e.g. INV-9901"
                value={receiveForm.purchaseInvoiceRef}
                onChange={(e) => setReceiveForm({ ...receiveForm, purchaseInvoiceRef: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowReceiveModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              Confirm Receipt
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Adjust Stock */}
      <Modal isOpen={showAdjustModal} onClose={() => setShowAdjustModal(false)} title="Stock Adjustment (Correction / Damage)">
        <form onSubmit={handleAdjustStock} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Select Batch to Adjust *</label>
            <select
              required
              value={adjustBatch?.id || ''}
              onChange={(e) => {
                const b = batches.find((item) => item.id === e.target.value);
                setAdjustBatch(b || null);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
            >
              <option value="">-- Choose Batch --</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.medicine?.brandName} (Batch: {b.batchNumber}) - {b.availableQuantity} units available
                </option>
              ))}
            </select>
          </div>

          {adjustBatch && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800">
                {adjustBatch.medicine?.brandName} ({adjustBatch.medicine?.genericName})
              </div>
              <div className="text-[11px]">
                Current Available Quantity: <strong className="text-slate-900">{adjustBatch.availableQuantity} units</strong>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Adjustment Type *</label>
              <select
                value={adjustForm.adjustmentType}
                onChange={(e) => setAdjustForm({ ...adjustForm, adjustmentType: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
              >
                <option value="PHYSICAL_COUNT_DISCREPANCY">Count Discrepancy</option>
                <option value="DAMAGE">Damaged Units</option>
                <option value="EXPIRED">Expired Batch</option>
                <option value="STOCK_CORRECTION">Correction / Reversal</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Quantity Delta * <span className="text-[10px] text-slate-400">(use - for deduction)</span>
              </label>
              <input
                type="number"
                required
                placeholder="e.g. -5 or +10"
                value={adjustForm.quantityDelta}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantityDelta: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Adjustment Reason / Audit Note *</label>
            <textarea
              required
              rows={2}
              placeholder="State clear operational reason for stock adjustment..."
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowAdjustModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              Record Adjustment
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Batch */}
      <Modal isOpen={showEditBatchModal} onClose={() => setShowEditBatchModal(false)} title="Edit Stock Batch">
        {editingBatch && (
          <form onSubmit={handleSaveEditBatch} className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Medicine</label>
              <input
                type="text"
                disabled
                value={`${editingBatch.medicine?.brandName} (${editingBatch.medicine?.genericName})`}
                className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-xs text-slate-500 cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Batch Number *</label>
                <input
                  type="text"
                  required
                  value={editBatchForm.batchNumber}
                  onChange={(e) => setEditBatchForm({ ...editBatchForm, batchNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Expiry Date *</label>
                <input
                  type="date"
                  required
                  value={editBatchForm.expiryDate}
                  onChange={(e) => setEditBatchForm({ ...editBatchForm, expiryDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">MRP (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editBatchForm.mrp}
                  onChange={(e) => setEditBatchForm({ ...editBatchForm, mrp: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Selling Price (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editBatchForm.sellingPrice}
                  onChange={(e) => setEditBatchForm({ ...editBatchForm, sellingPrice: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Status</label>
              <select
                value={editBatchForm.status}
                onChange={(e) => setEditBatchForm({ ...editBatchForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
              >
                <option value="ACTIVE">ACTIVE (Saleable)</option>
                <option value="QUARANTINE">QUARANTINE (Hold)</option>
                <option value="DEPLETED">DEPLETED (Zero Stock)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowEditBatchModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Confirm Batch Deletion */}
      <Modal isOpen={showDeleteBatchModal} onClose={() => setShowDeleteBatchModal(false)} title="Confirm Batch Removal" maxWidth="md">
        {deletingBatch && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800">
              <p className="font-bold">Are you sure you want to remove this stock batch?</p>
              <p className="mt-1">
                Batch <strong>{deletingBatch.batchNumber}</strong> ({deletingBatch.medicine?.brandName}) with <strong>{deletingBatch.availableQuantity} units</strong>.
              </p>
            </div>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              <strong>Pharmaceutical Audit Compliance:</strong> If this batch has associated sales invoices or historical stock movements, it will be safely quarantined rather than hard purged.
            </p>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowDeleteBatchModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteBatch}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Confirm Removal
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Permission Denied Modal */}
      <PermissionDeniedModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
      />
    </div>
  );
};
