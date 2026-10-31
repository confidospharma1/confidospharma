import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { PurchaseIndent, PurchaseIndentItem, Supplier, MedicineProduct } from '../types';
import {
  ClipboardList,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRight,
  Filter,
  FileText,
  AlertCircle,
  Trash2,
  Calendar,
  Building2,
  DollarSign,
  ChevronDown,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';

interface IndentsPageProps {
  onNavigateToPurchase?: (indentData: any) => void;
}

export const IndentsPage: React.FC<IndentsPageProps> = ({ onNavigateToPurchase }) => {
  const { currentBranch, selectedBranchId, isSuperAdmin, isBranchAdmin } = useAuth();

  const [indents, setIndents] = useState<PurchaseIndent[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<MedicineProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Create Indent Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [requiredByDate, setRequiredByDate] = useState('');
  const [notes, setNotes] = useState('');
  const [indentItems, setIndentItems] = useState<
    Array<{
      medicineId: string;
      requestedQuantity: number;
      unit: string;
      conversionFactor: number;
      estimatedRate: number;
    }>
  >([
    {
      medicineId: '',
      requestedQuantity: 10,
      unit: 'Box',
      conversionFactor: 10,
      estimatedRate: 50,
    },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // View / Review Modal State
  const [selectedIndent, setSelectedIndent] = useState<PurchaseIndent | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedBranchId, statusFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [indentsRes, suppliersRes, productsRes] = await Promise.all([
        api.getIndents({
          branchId: selectedBranchId || undefined,
          status: statusFilter || undefined,
        }),
        api.getSuppliers(),
        api.getProducts({ branchId: selectedBranchId || undefined, limit: 100 }),
      ]);
      setIndents(indentsRes.data || indentsRes || []);
      setSuppliers(suppliersRes.data || suppliersRes || []);
      setProducts(productsRes.data || productsRes || []);
    } catch (err: any) {
      // Indents load error handled in UI
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    setIndentItems([
      ...indentItems,
      {
        medicineId: '',
        requestedQuantity: 10,
        unit: 'Box',
        conversionFactor: 10,
        estimatedRate: 50,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (indentItems.length <= 1) return;
    setIndentItems(indentItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...indentItems];
    (updated[index] as any)[field] = value;

    if (field === 'medicineId') {
      const prod = products.find((p) => p.id === value);
      if (prod) {
        updated[index].unit = prod.packageUnit || 'Box';
        updated[index].conversionFactor = prod.conversionFactor || 10;
        updated[index].estimatedRate = prod.defaultPurchaseRate || 50;
      }
    }
    setIndentItems(updated);
  };

  const handleCreateIndent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (indentItems.some((item) => !item.medicineId || item.requestedQuantity <= 0)) {
      setErrorMsg('Please select a medicine and enter a valid quantity for all items.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.createIndent({
        branchId: selectedBranchId || currentBranch?.id,
        supplierId: supplierId || undefined,
        requiredByDate: requiredByDate || undefined,
        notes: notes || undefined,
        items: indentItems.map((item) => ({
          medicineId: item.medicineId,
          requestedQuantity: Number(item.requestedQuantity),
          unit: item.unit,
          conversionFactor: Number(item.conversionFactor) || 1,
          estimatedRate: Number(item.estimatedRate) || 0,
        })),
      });

      setShowCreateModal(false);
      setSupplierId('');
      setRequiredByDate('');
      setNotes('');
      setIndentItems([
        {
          medicineId: '',
          requestedQuantity: 10,
          unit: 'Box',
          conversionFactor: 10,
          estimatedRate: 50,
        },
      ]);
      fetchData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create indent requisition.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selectedIndent) return;
    setIsReviewing(true);
    try {
      await api.updateIndentStatus(selectedIndent.id, status, reviewNotes);
      setSelectedIndent(null);
      setReviewNotes('');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to update indent status.');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleConvertToPurchase = async (indent: PurchaseIndent) => {
    if (onNavigateToPurchase) {
      onNavigateToPurchase(indent);
    } else {
      try {
        const res = await api.convertIndentToPurchase(indent.id);
        alert(`Indent ${indent.indentNumber} successfully converted to Purchase Invoice Draft!`);
        fetchData();
      } catch (err: any) {
        alert(err.message || 'Failed to convert indent to purchase.');
      }
    }
  };

  const filteredIndents = indents.filter((ind) => {
    const matchesSearch =
      ind.indentNumber.toLowerCase().includes(search.toLowerCase()) ||
      ind.supplier?.name.toLowerCase().includes(search.toLowerCase()) ||
      ind.notes?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="neutral">Draft</Badge>;
      case 'SUBMITTED':
        return <Badge variant="warning">Submitted for Approval</Badge>;
      case 'APPROVED':
        return <Badge variant="success">Approved</Badge>;
      case 'REJECTED':
        return <Badge variant="danger">Rejected</Badge>;
      case 'CONVERTED':
        return <Badge variant="info">Converted to Purchase</Badge>;
      case 'CANCELLED':
        return <Badge variant="neutral">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="p-3.5 sm:p-5 md:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-brand-600 shrink-0" />
            Indent Requisitions & Supplier Procurements
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Create pharmacy stock indents, review branch procurement requests, approve orders, and seamlessly convert to inward purchase invoices.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all shadow-brand-600/20 self-stretch sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Create New Indent
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search indent #, supplier, or note..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 w-full sm:w-auto"
            >
              <option value="">All Statuses</option>
              <option value="SUBMITTED">Submitted for Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="CONVERTED">Converted to Purchase</option>
              <option value="REJECTED">Rejected</option>
              <option value="DRAFT">Draft</option>
            </select>
          </div>
        </div>
      </div>

      {/* Indents Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto touch-scroll">
          <table className="w-full text-left border-collapse text-xs min-w-[850px]">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Indent #</th>
                <th className="py-3 px-4">Branch</th>
                <th className="py-3 px-4">Supplier</th>
                <th className="py-3 px-4 text-center">Items Count</th>
                <th className="py-3 px-4 text-right">Est. Total</th>
                <th className="py-3 px-4">Requested Date</th>
                <th className="py-3 px-4">Required By</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-5 h-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                      Loading indent requisitions...
                    </div>
                  </td>
                </tr>
              ) : filteredIndents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileText className="w-8 h-8 text-slate-300" />
                      <p className="font-semibold text-slate-600">No purchase indents found.</p>
                      <p className="text-[11px] text-slate-400">
                        Create an indent to request medicines from authorized suppliers.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredIndents.map((indent) => (
                  <tr key={indent.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-brand-700">
                      {indent.indentNumber}
                    </td>
                    <td className="py-3 px-4">
                      {indent.branch?.name || 'Main Branch'}
                    </td>
                    <td className="py-3 px-4">
                      {indent.supplier ? (
                        <span className="font-semibold text-slate-900">{indent.supplier.name}</span>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned Supplier</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      {indent.items?.length || 0}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      ₹{Number(indent.totalEstimatedAmount || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {new Date(indent.requestedDate).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {indent.requiredByDate ? new Date(indent.requiredByDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {getStatusBadge(indent.status)}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => setSelectedIndent(indent)}
                        className="px-2.5 py-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded font-semibold text-[11px]"
                      >
                        View
                      </button>

                      {indent.status === 'APPROVED' && (
                        <button
                          onClick={() => handleConvertToPurchase(indent)}
                          className="px-2.5 py-1 text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded font-bold text-[11px] inline-flex items-center gap-1 border border-emerald-200"
                        >
                          <ArrowRight className="w-3 h-3" /> Convert to Purchase
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Indent */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Indent Requisition"
        maxWidth="4xl"
      >
        <form onSubmit={handleCreateIndent} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Supplier</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-brand-500"
              >
                <option value="">-- Choose Supplier (Optional) --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.phone})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Required By Date</label>
              <input
                type="date"
                value={requiredByDate}
                onChange={(e) => setRequiredByDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Notes / Instructions</label>
              <input
                type="text"
                placeholder="e.g. Urgent emergency reorder"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Indent Items Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800">Requested Products</label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-brand-600 hover:text-brand-800 font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {indentItems.map((item, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-2 items-end">
                  <div className="col-span-2 sm:col-span-4 lg:col-span-4">
                    <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Medicine *</label>
                    <select
                      required
                      value={item.medicineId}
                      onChange={(e) => handleItemChange(idx, 'medicineId', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded font-medium"
                    >
                      <option value="">-- Choose Catalogue Item --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.brandName} ({p.strength}) - Pack {p.packageUnit || 'Box'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-1 sm:col-span-2 lg:col-span-2">
                    <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Unit</label>
                    <select
                      value={item.unit}
                      onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    >
                      <option value="Box">Box</option>
                      <option value="Strip">Strip</option>
                      <option value="Tablet">Tablet</option>
                      <option value="Bottle">Bottle</option>
                      <option value="Sachet">Sachet</option>
                      <option value="Pack">Pack</option>
                    </select>
                  </div>

                  <div className="col-span-1 sm:col-span-2 lg:col-span-2">
                    <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Qty *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={item.requestedQuantity}
                      onChange={(e) => handleItemChange(idx, 'requestedQuantity', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono text-center font-bold"
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-2 lg:col-span-2">
                    <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Est. Rate (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.estimatedRate}
                      onChange={(e) => handleItemChange(idx, 'estimatedRate', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono text-right"
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-1 lg:col-span-1 text-right font-mono font-bold text-slate-800 text-[11px] self-center pt-1 lg:pt-3">
                    ₹{(item.requestedQuantity * item.estimatedRate).toFixed(2)}
                  </div>

                  <div className="col-span-2 sm:col-span-1 lg:col-span-1 flex items-center justify-end">
                    {indentItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-rose-600 hover:text-rose-800 p-1"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Indent Requisition'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: View & Review Indent */}
      {selectedIndent && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedIndent(null)}
          title={`Indent Requisition Details: ${selectedIndent.indentNumber}`}
          maxWidth="3xl"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 block">Status</span>
                <div className="mt-1">{getStatusBadge(selectedIndent.status)}</div>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Supplier</span>
                <span className="font-bold text-slate-900 block mt-1">
                  {selectedIndent.supplier?.name || 'Unassigned'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Branch</span>
                <span className="font-bold text-slate-900 block mt-1">
                  {selectedIndent.branch?.name || 'Main Branch'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Est. Grand Total</span>
                <span className="font-black font-mono text-emerald-800 text-sm block mt-1">
                  ₹{Number(selectedIndent.totalEstimatedAmount || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {selectedIndent.notes && (
              <div className="text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 block uppercase">Notes / Instructions:</span>
                <p className="text-slate-700 mt-0.5">{selectedIndent.notes}</p>
              </div>
            )}

            {/* Items Table */}
            <div className="border border-slate-200 rounded-lg overflow-x-auto touch-scroll text-xs">
              <table className="w-full text-left min-w-[500px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="p-2.5">Medicine</th>
                    <th className="p-2.5 text-center">Unit</th>
                    <th className="p-2.5 text-center">Req. Qty</th>
                    <th className="p-2.5 text-right">Est. Rate</th>
                    <th className="p-2.5 text-right">Est. Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {selectedIndent.items?.map((item, i) => (
                    <tr key={i}>
                      <td className="p-2.5">
                        <span className="font-bold text-slate-900">{item.medicine?.brandName || 'Medicine'}</span>
                        <span className="text-slate-500 ml-1">({item.medicine?.strength})</span>
                      </td>
                      <td className="p-2.5 text-center">{item.unit || 'Pack'}</td>
                      <td className="p-2.5 text-center font-mono font-bold">{item.requestedQuantity}</td>
                      <td className="p-2.5 text-right font-mono">₹{Number(item.estimatedRate || 0).toFixed(2)}</td>
                      <td className="p-2.5 text-right font-mono font-bold">
                        ₹{Number(item.estimatedTotal || (item.requestedQuantity * (item.estimatedRate || 0))).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Approval Section for Admins */}
            {(isSuperAdmin || isBranchAdmin) && selectedIndent.status === 'SUBMITTED' && (
              <div className="p-3.5 bg-brand-50/50 border border-brand-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-brand-900">Administrator Review & Approval</h4>
                <input
                  type="text"
                  placeholder="Review comments / approval justification..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-brand-200 rounded-lg"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isReviewing}
                    onClick={() => handleStatusChange('REJECTED')}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all"
                  >
                    Reject Indent
                  </button>
                  <button
                    type="button"
                    disabled={isReviewing}
                    onClick={() => handleStatusChange('APPROVED')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                  >
                    Approve Indent
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSelectedIndent(null)}
                className="w-full sm:w-auto px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold text-center"
              >
                Close
              </button>
              {selectedIndent.status === 'APPROVED' && (
                <button
                  type="button"
                  onClick={() => {
                    const ind = selectedIndent;
                    setSelectedIndent(null);
                    handleConvertToPurchase(ind);
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <ArrowRight className="w-3.5 h-3.5" /> Convert to Inward Purchase Invoice
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
