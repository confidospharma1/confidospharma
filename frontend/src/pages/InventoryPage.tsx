import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { FilterButton } from '../components/FilterButton';
import { FilterField, FilterSelect, FilterInput } from '../components/FilterControls';

export const InventoryPage: React.FC = () => {
  const { currentBranch, selectedBranchId, isBillingUser } = useAuth();

  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'ALL' | 'ACTIVE' | 'NEAR_EXPIRY' | 'EXPIRED'>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');

  // Detailed Filter State
  const [dosageFilter, setDosageFilter] = useState('');
  const [stockLevelFilter, setStockLevelFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const activeFilterCount = [
    dosageFilter,
    stockLevelFilter,
    supplierFilter,
    minPrice,
    maxPrice,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setDosageFilter('');
    setStockLevelFilter('');
    setSupplierFilter('');
    setMinPrice('');
    setMaxPrice('');
  };

  // Modals
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showMovementsModal, setShowMovementsModal] = useState(false);

  // Reference lists for forms
  const [products, setProducts] = useState<MedicineProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Receive Batch Form
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
  const [adjustBatch, setAdjustBatch] = useState<StockBatch | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    adjustmentType: 'PHYSICAL_COUNT_DISCREPANCY',
    quantityDelta: '',
    reason: '',
  });

  // Stock movements
  const [movements, setMovements] = useState<any[]>([]);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadBatches = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
    loadReferenceData();
  }, [selectedBranchId, filterTab]);

  const loadReferenceData = async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        api.getProducts({ limit: 100 }),
        api.getSuppliers(),
      ]);
      setProducts(pRes.products || []);
      setSuppliers(sRes || []);
    } catch (e) {}
  };

  const handleOpenReceive = () => {
    loadReferenceData();
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
    setShowReceiveModal(true);
  };

  const handleOpenAdjust = (batch: StockBatch) => {
    setAdjustBatch(batch);
    setAdjustForm({
      adjustmentType: 'PHYSICAL_COUNT_DISCREPANCY',
      quantityDelta: '',
      reason: '',
    });
    setShowAdjustModal(true);
  };

  const handleOpenMovements = async () => {
    try {
      const data = await api.getMovements({ branchId: selectedBranchId });
      setMovements(data.movements || []);
      setShowMovementsModal(true);
    } catch (e) {}
  };

  const submitReceiveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      await api.receiveBatch({
        ...receiveForm,
        branchId: selectedBranchId,
      });
      setMessage({ text: 'Stock Batch received and movement ledger updated successfully.', type: 'success' });
      setShowReceiveModal(false);
      loadBatches();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to receive stock batch.', type: 'error' });
    }
  };

  const submitAdjustBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustBatch) return;
    setMessage(null);
    try {
      await api.adjustStock({
        batchId: adjustBatch.id,
        adjustmentType: adjustForm.adjustmentType,
        quantityDelta: parseInt(adjustForm.quantityDelta),
        reason: adjustForm.reason,
      });
      setMessage({ text: 'Stock adjustment recorded with audit reason.', type: 'success' });
      setShowAdjustModal(false);
      loadBatches();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to adjust stock.', type: 'error' });
    }
  };

  const filteredBatches = batches.filter((b) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        b.medicine?.brandName.toLowerCase().includes(q) ||
        b.medicine?.genericName.toLowerCase().includes(q) ||
        b.batchNumber.toLowerCase().includes(q) ||
        (b.supplier?.name && b.supplier.name.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }

    if (dosageFilter && b.medicine?.dosageForm?.toLowerCase() !== dosageFilter.toLowerCase()) {
      return false;
    }

    if (stockLevelFilter === 'IN_STOCK' && b.availableQuantity <= 0) return false;
    if (stockLevelFilter === 'LOW_STOCK' && (b.availableQuantity <= 0 || b.availableQuantity > 10)) return false;
    if (stockLevelFilter === 'OUT_OF_STOCK' && b.availableQuantity > 0) return false;

    if (supplierFilter && b.supplierId !== supplierFilter) return false;

    if (minPrice && (b.sellingPrice || b.mrp) < parseFloat(minPrice)) return false;
    if (maxPrice && (b.sellingPrice || b.mrp) > parseFloat(maxPrice)) return false;

    return true;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Branch Stock Batches & FEFO</h1>
            <Badge variant="neutral" size="sm">
              {currentBranch?.name} ({currentBranch?.code})
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Independent batch records, expiry dates, quantities, and traceable movement ledger.
          </p>
        </div>

        {!isBillingUser && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenMovements}
              className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 shadow-xs transition-colors"
            >
              <History className="w-4 h-4 text-slate-500" />
              Movement Ledger
            </button>
            <button
              onClick={handleOpenReceive}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Receive Stock Batch
            </button>
          </div>
        )}
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-lg text-xs flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-pharmagreen-50 text-pharmagreen-800 border border-pharmagreen-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="font-bold underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg self-start">
            <button
              onClick={() => setFilterTab('ACTIVE')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                filterTab === 'ACTIVE' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active Saleable
            </button>
            <button
              onClick={() => setFilterTab('NEAR_EXPIRY')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                filterTab === 'NEAR_EXPIRY' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Near Expiry (&lt;60d)
            </button>
            <button
              onClick={() => setFilterTab('EXPIRED')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                filterTab === 'EXPIRED' ? 'bg-white text-rose-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Expired / Quarantined
            </button>
            <button
              onClick={() => setFilterTab('ALL')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                filterTab === 'ALL' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Batches
            </button>
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by medicine, batch, or supplier..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
              />
            </div>

            <FilterButton
              activeCount={activeFilterCount}
              onReset={resetFilters}
              title="Filter Inventory Batches"
              buttonLabel="Filter Batches"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FilterField label="Dosage Form">
                  <FilterSelect
                    value={dosageFilter}
                    onChange={(e) => setDosageFilter(e.target.value)}
                    options={[
                      { label: 'All Dosage Forms', value: '' },
                      { label: 'Tablets', value: 'Tablet' },
                      { label: 'Capsules', value: 'Capsule' },
                      { label: 'Syrups & Liquids', value: 'Syrup' },
                      { label: 'Injections', value: 'Injection' },
                      { label: 'Ointments & Creams', value: 'Ointment' },
                      { label: 'Drops', value: 'Drops' },
                      { label: 'Inhalers', value: 'Inhaler' },
                    ]}
                  />
                </FilterField>

                <FilterField label="Stock Availability">
                  <FilterSelect
                    value={stockLevelFilter}
                    onChange={(e) => setStockLevelFilter(e.target.value)}
                    options={[
                      { label: 'All Levels', value: '' },
                      { label: 'In Stock (> 0 units)', value: 'IN_STOCK' },
                      { label: 'Low Stock (≤ 10 units)', value: 'LOW_STOCK' },
                      { label: 'Depleted (0 units)', value: 'OUT_OF_STOCK' },
                    ]}
                  />
                </FilterField>

                <FilterField label="Supplier / Vendor" className="sm:col-span-2">
                  <FilterSelect
                    value={supplierFilter}
                    onChange={(e) => setSupplierFilter(e.target.value)}
                    options={[
                      { label: 'All Suppliers', value: '' },
                      ...suppliers.map((s) => ({ label: s.name, value: s.id })),
                    ]}
                  />
                </FilterField>

                <FilterField label="Min Selling Rate (₹)">
                  <FilterInput
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                  />
                </FilterField>

                <FilterField label="Max Selling Rate (₹)">
                  <FilterInput
                    type="number"
                    min="0"
                    placeholder="2000.00"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                  />
                </FilterField>
              </div>
            </FilterButton>
          </div>
        </div>

        {/* Active Filter Badges */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Active Filters:</span>
            {dosageFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Form: {dosageFilter}
                <button type="button" onClick={() => setDosageFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {stockLevelFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Stock: {stockLevelFilter === 'IN_STOCK' ? 'In Stock' : stockLevelFilter === 'LOW_STOCK' ? 'Low Stock' : 'Depleted'}
                <button type="button" onClick={() => setStockLevelFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {supplierFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Supplier: {suppliers.find((s) => s.id === supplierFilter)?.name || supplierFilter}
                <button type="button" onClick={() => setSupplierFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {(minPrice || maxPrice) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Price: ₹{minPrice || '0'} - {maxPrice ? `₹${maxPrice}` : 'Any'}
                <button
                  type="button"
                  onClick={() => {
                    setMinPrice('');
                    setMaxPrice('');
                  }}
                  className="hover:text-brand-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] text-slate-500 hover:text-rose-600 font-semibold underline ml-1"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* Batches Table Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Medicine & Form</th>
                <th className="py-3 px-3">Batch Number</th>
                <th className="py-3 px-3 text-center">Expiry Date</th>
                <th className="py-3 px-3 text-right">Available Qty</th>
                <th className="py-3 px-3 text-right">Purchase Rate</th>
                <th className="py-3 px-3 text-right">MRP</th>
                <th className="py-3 px-3 text-center">Status</th>
                {!isBillingUser && <th className="py-3 px-4 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Loading stock batches...
                  </td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <p className="text-sm font-bold text-slate-800">No inventory available.</p>
                    <p className="text-xs text-slate-500 mt-1">Receive stock through the authorized purchase invoice or stock-receipt workflow.</p>
                    {!isBillingUser && (
                      <button
                        onClick={handleOpenReceive}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Receive Stock Batch
                      </button>
                    )}
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <p className="text-sm font-bold text-slate-700">No stock batches match your filter criteria.</p>
                    <p className="text-xs text-slate-400 mt-1">Try resetting the filter options or adjusting your search term.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        resetFilters();
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition-colors"
                    >
                      Clear Filters & Search
                    </button>
                  </td>
                </tr>
              ) : (
                filteredBatches.map((batch) => {
                  const isExpired = new Date(batch.expiryDate) <= new Date();

                  return (
                    <tr key={batch.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block">{batch.medicine?.brandName}</span>
                        <span className="text-[11px] text-slate-500">
                          {batch.medicine?.genericName} • {batch.medicine?.strength}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">
                        {batch.batchNumber}
                      </td>
                      <td className="py-3 px-3 text-center font-mono">
                        <span className={isExpired ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                          {new Date(batch.expiryDate).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-slate-900">
                        {batch.availableQuantity}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">
                        ₹{batch.purchaseRate.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                        ₹{batch.mrp.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge
                          variant={
                            batch.status === 'ACTIVE'
                              ? 'success'
                              : batch.status === 'EXPIRED'
                              ? 'danger'
                              : 'warning'
                          }
                          size="sm"
                        >
                          {batch.status}
                        </Badge>
                      </td>
                      {!isBillingUser && (
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleOpenAdjust(batch)}
                            className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-emerald-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition-colors"
                          >
                            Adjust Stock
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Receive Stock Batch */}
      <Modal isOpen={showReceiveModal} onClose={() => setShowReceiveModal(false)} title="Receive New Stock Batch" maxWidth="xl">
        <form onSubmit={submitReceiveBatch} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Select Medicine *</label>
            <select
              required
              value={receiveForm.medicineId}
              onChange={(e) => {
                const prod = products.find((p) => p.id === e.target.value);
                setReceiveForm({
                  ...receiveForm,
                  medicineId: e.target.value,
                  mrp: prod ? prod.mrp.toString() : '',
                  sellingPrice: prod ? prod.mrp.toString() : '',
                });
              }}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="">-- Choose Catalogue Medicine --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brandName} ({p.genericName} - {p.strength}) - MRP ₹{p.mrp}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Batch Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. DL-2026-B1"
                value={receiveForm.batchNumber}
                onChange={(e) => setReceiveForm({ ...receiveForm, batchNumber: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Expiry Date *</label>
              <input
                type="date"
                required
                value={receiveForm.expiryDate}
                onChange={(e) => setReceiveForm({ ...receiveForm, expiryDate: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Quantity Received *</label>
              <input
                type="number"
                min="1"
                required
                placeholder="e.g. 50"
                value={receiveForm.quantity}
                onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Purchase Rate (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="e.g. 23.50"
                value={receiveForm.purchaseRate}
                onChange={(e) => setReceiveForm({ ...receiveForm, purchaseRate: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">MRP (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="e.g. 33.50"
                value={receiveForm.mrp}
                onChange={(e) => setReceiveForm({ ...receiveForm, mrp: e.target.value, sellingPrice: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Supplier</label>
              <select
                value={receiveForm.supplierId}
                onChange={(e) => setReceiveForm({ ...receiveForm, supplierId: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">-- Choose Supplier (Optional) --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Purchase Invoice Ref</label>
              <input
                type="text"
                placeholder="e.g. SUP-INV-8812"
                value={receiveForm.purchaseInvoiceRef}
                onChange={(e) => setReceiveForm({ ...receiveForm, purchaseInvoiceRef: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500"
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
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              Confirm Stock Receipt
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Adjust Stock */}
      <Modal isOpen={showAdjustModal} onClose={() => setShowAdjustModal(false)} title="Audit Stock Adjustment" maxWidth="md">
        {adjustBatch && (
          <form onSubmit={submitAdjustBatch} className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <p><strong>Medicine:</strong> {adjustBatch.medicine?.brandName}</p>
              <p><strong>Batch:</strong> {adjustBatch.batchNumber}</p>
              <p><strong>Current Available:</strong> <span className="font-bold text-emerald-700">{adjustBatch.availableQuantity} units</span></p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Adjustment Type *</label>
              <select
                value={adjustForm.adjustmentType}
                onChange={(e) => setAdjustForm({ ...adjustForm, adjustmentType: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="PHYSICAL_COUNT_DISCREPANCY">Physical Count Discrepancy</option>
                <option value="DAMAGE">Damaged Stock (Quarantine)</option>
                <option value="EXPIRED">Expired Batch Mark</option>
                <option value="THEFT">Breakage / Theft</option>
                <option value="OTHER">Other Supervised Reason</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Quantity Delta (+ to add, - to deduct) *
              </label>
              <input
                type="number"
                required
                placeholder="-5 or +10"
                value={adjustForm.quantityDelta}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantityDelta: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Example: enter <code>-2</code> if 2 strips were damaged.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Audit Reason (Mandatory) *</label>
              <textarea
                required
                rows={3}
                placeholder="Explain why this inventory adjustment is required by pharmacy audit rules..."
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
              >
                Post Adjustment
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Movement Ledger */}
      <Modal isOpen={showMovementsModal} onClose={() => setShowMovementsModal(false)} title="Stock Movement Ledger" maxWidth="3xl">
        <div className="overflow-x-auto max-h-[60vh]">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
              <tr>
                <th className="py-2.5 px-3">Date & Time</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Medicine</th>
                <th className="py-2.5 px-3 text-right">Delta</th>
                <th className="py-2.5 px-4">Reason / Doc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                    {new Date(m.createdAt).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge variant={m.quantityDelta > 0 ? 'success' : 'danger'} size="sm">
                      {m.movementType}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 font-bold text-slate-800">{m.medicine?.brandName}</td>
                  <td className={`py-2.5 px-3 text-right font-mono font-bold ${m.quantityDelta > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 text-[11px]">{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
};
