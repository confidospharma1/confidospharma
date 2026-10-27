import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { StockTransfer, MedicineProduct, StockBatch } from '../types';
import { ArrowLeftRight, Plus, CheckCircle, Clock, CheckCircle2, Search, Filter, X } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { FilterButton } from '../components/FilterButton';
import { FilterField, FilterSelect, FilterInput } from '../components/FilterControls';

export const TransfersPage: React.FC = () => {
  const { currentBranch, selectedBranchId, branches, isBillingUser } = useAuth();

  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceBranchFilter, setSourceBranchFilter] = useState('');
  const [destBranchFilter, setDestBranchFilter] = useState('');

  const activeFilterCount = [
    statusFilter,
    sourceBranchFilter,
    destBranchFilter,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setStatusFilter('');
    setSourceBranchFilter('');
    setDestBranchFilter('');
  };

  // New Transfer Modal
  const [showModal, setShowModal] = useState(false);
  const [destinationBranchId, setDestinationBranchId] = useState('');
  const [medicineId, setMedicineId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const [products, setProducts] = useState<MedicineProduct[]>([]);
  const [batches, setBatches] = useState<StockBatch[]>([]);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadTransfers = async () => {
    setLoading(true);
    try {
      const data = await api.getTransfers();
      setTransfers(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransfers();
  }, [selectedBranchId]);

  const handleOpenTransferModal = async () => {
    try {
      const [prodRes, batchRes] = await Promise.all([
        api.getProducts({ branchId: selectedBranchId, limit: 100 }),
        api.getBatches({ branchId: selectedBranchId, status: 'ACTIVE' }),
      ]);
      setProducts(prodRes.products || []);
      setBatches(batchRes || []);
      setShowModal(true);
    } catch (e) {}
  };

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      await api.createTransfer({
        sourceBranchId: selectedBranchId,
        destinationBranchId,
        medicineId,
        batchNumber,
        quantity: parseInt(quantity),
        notes,
      });
      setMessage({ text: 'Stock transfer dispatched from source branch.', type: 'success' });
      setShowModal(false);
      loadTransfers();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to dispatch transfer.', type: 'error' });
    }
  };

  const handleReceiveTransfer = async (id: string) => {
    setMessage(null);
    try {
      const res = await api.receiveTransfer(id);
      setMessage({ text: res.message, type: 'success' });
      loadTransfers();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to receive transfer.', type: 'error' });
    }
  };

  const otherBranches = branches.filter((b) => b.id !== selectedBranchId);

  const filteredTransfers = transfers.filter((t) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match =
        t.transferNumber.toLowerCase().includes(q) ||
        t.batchNumber.toLowerCase().includes(q) ||
        (t.sourceBranch?.name && t.sourceBranch.name.toLowerCase().includes(q)) ||
        (t.destinationBranch?.name && t.destinationBranch.name.toLowerCase().includes(q));
      if (!match) return false;
    }

    if (statusFilter && t.status !== statusFilter) return false;
    if (sourceBranchFilter && t.sourceBranchId !== sourceBranchFilter) return false;
    if (destBranchFilter && t.destinationBranchId !== destBranchFilter) return false;

    return true;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Branch Stock Transfers</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Explicit inter-branch medicine movements with dispatch tracking and double-receipt protection.
          </p>
        </div>

        {!isBillingUser && (
          <button
            onClick={handleOpenTransferModal}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            Dispatch New Transfer
          </button>
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

      {/* Toolbar: Search & Filter Button */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transfers by Transfer #, Batch, Branch name..."
              className="w-full pl-10 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <FilterButton
              activeCount={activeFilterCount}
              onReset={resetFilters}
              title="Filter Stock Transfers"
              buttonLabel="Filter Transfers"
            >
              <div className="space-y-3">
                <FilterField label="Transfer Status">
                  <FilterSelect
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    options={[
                      { label: 'All Statuses', value: '' },
                      { label: 'Dispatched (In Transit)', value: 'DISPATCHED' },
                      { label: 'Received (Stock Added to Dest)', value: 'RECEIVED' },
                      { label: 'Cancelled', value: 'CANCELLED' },
                    ]}
                  />
                </FilterField>

                <FilterField label="Source Branch (Dispatching)">
                  <FilterSelect
                    value={sourceBranchFilter}
                    onChange={(e) => setSourceBranchFilter(e.target.value)}
                    options={[
                      { label: 'All Source Branches', value: '' },
                      ...branches.map((b) => ({ label: `${b.name} (${b.code})`, value: b.id })),
                    ]}
                  />
                </FilterField>

                <FilterField label="Destination Branch (Receiving)">
                  <FilterSelect
                    value={destBranchFilter}
                    onChange={(e) => setDestBranchFilter(e.target.value)}
                    options={[
                      { label: 'All Destination Branches', value: '' },
                      ...branches.map((b) => ({ label: `${b.name} (${b.code})`, value: b.id })),
                    ]}
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
            {statusFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Status: {statusFilter}
                <button type="button" onClick={() => setStatusFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {sourceBranchFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Source: {branches.find((b) => b.id === sourceBranchFilter)?.name || sourceBranchFilter}
                <button type="button" onClick={() => setSourceBranchFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {destBranchFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Dest: {branches.find((b) => b.id === destBranchFilter)?.name || destBranchFilter}
                <button type="button" onClick={() => setDestBranchFilter('')} className="hover:text-brand-900">
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

      {/* Transfers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Transfer #</th>
                <th className="py-3 px-3">Source Branch</th>
                <th className="py-3 px-3">Destination</th>
                <th className="py-3 px-3">Batch Number</th>
                <th className="py-3 px-3 text-right">Quantity</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading transfers...
                  </td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <p className="text-sm font-bold text-slate-800">No branch transfers recorded yet.</p>
                    <p className="text-xs text-slate-500 mt-1">Dispatch transfers between branches to replenish or reallocate inventory.</p>
                  </td>
                </tr>
              ) : filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <p className="text-sm font-bold text-slate-700">No transfers match your filter criteria.</p>
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
                filteredTransfers.map((t) => {
                  const isDestination = t.destinationBranchId === selectedBranchId;
                  const canReceive = isDestination && t.status === 'DISPATCHED';

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{t.transferNumber}</td>
                      <td className="py-3 px-3 text-slate-800 font-medium">{t.sourceBranch?.name}</td>
                      <td className="py-3 px-3 text-slate-800 font-medium">{t.destinationBranch?.name}</td>
                      <td className="py-3 px-3 font-mono text-slate-700">{t.batchNumber}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">{t.quantity}</td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant={t.status === 'RECEIVED' ? 'success' : 'warning'} size="sm">
                          {t.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canReceive ? (
                          <button
                            onClick={() => handleReceiveTransfer(t.id)}
                            className="px-3 py-1 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-bold rounded text-xs shadow-xs transition-colors"
                          >
                            Confirm Receipt
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Dispatch Transfer */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Dispatch Branch Stock Transfer" maxWidth="lg">
        <form onSubmit={submitTransfer} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Destination Branch *</label>
            <select
              required
              value={destinationBranchId}
              onChange={(e) => setDestinationBranchId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            >
              <option value="">-- Choose Target Branch --</option>
              {otherBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Source Available Batch *</label>
            <select
              required
              value={batchNumber}
              onChange={(e) => {
                setBatchNumber(e.target.value);
                const b = batches.find((x) => x.batchNumber === e.target.value);
                if (b) setMedicineId(b.medicineId);
              }}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
            >
              <option value="">-- Choose Batch to Dispatch --</option>
              {batches.map((b) => (
                <option key={b.id} value={b.batchNumber}>
                  {b.medicine?.brandName} | Batch: {b.batchNumber} (Avail: {b.availableQuantity})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Quantity to Transfer *</label>
            <input
              type="number"
              min="1"
              required
              placeholder="e.g. 20"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Dispatch Notes / Reason</label>
            <textarea
              rows={2}
              placeholder="Inter-branch emergency requisition..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              Dispatch Transfer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
