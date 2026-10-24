import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Supplier, MedicineProduct } from '../types';
import { Truck, Plus, Search, Building2, Calendar, FileText } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';

export const PurchasesPage: React.FC = () => {
  const { currentBranch, selectedBranchId, isBillingUser } = useAuth();

  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<MedicineProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal: New Purchase Invoice
  const [showModal, setShowModal] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [lines, setLines] = useState<any[]>([
    { medicineId: '', batchNumber: '', expiryDate: '', quantity: 50, purchaseRate: 20, mrp: 30, gstRate: 12 },
  ]);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [purRes, supRes, prodRes] = await Promise.all([
        api.getPurchases({ branchId: selectedBranchId }),
        api.getSuppliers(),
        api.getProducts({ limit: 100 }),
      ]);
      setPurchases(purRes.purchases || []);
      setSuppliers(supRes || []);
      setProducts(prodRes.products || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchId]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { medicineId: '', batchNumber: '', expiryDate: '', quantity: 50, purchaseRate: 20, mrp: 30, gstRate: 12 },
    ]);
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: string, val: any) => {
    const updated = [...lines];
    updated[idx][field] = val;

    if (field === 'medicineId') {
      const prod = products.find((p) => p.id === val);
      if (prod) {
        updated[idx].mrp = prod.mrp;
        updated[idx].gstRate = prod.gstRate;
      }
    }
    setLines(updated);
  };

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      await api.createPurchase({
        branchId: selectedBranchId,
        supplierId,
        supplierInvoiceNumber,
        invoiceDate,
        lines,
      });
      setMessage({ text: 'Purchase Invoice recorded and stock batches added to branch.', type: 'success' });
      setShowModal(false);
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to record purchase invoice', type: 'error' });
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Purchase Invoices & Receiving</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Record incoming supplier invoices and automatically update batch stock for {currentBranch?.name}.
          </p>
        </div>

        {!isBillingUser && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            Record Purchase Invoice
          </button>
        )}
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-lg text-xs flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="font-bold underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Purchases Register Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Internal #</th>
                <th className="py-3 px-3">Supplier Name</th>
                <th className="py-3 px-3">Supplier Inv #</th>
                <th className="py-3 px-3">Invoice Date</th>
                <th className="py-3 px-3 text-right">Taxable</th>
                <th className="py-3 px-3 text-right">Tax (GST)</th>
                <th className="py-3 px-4 text-right">Grand Total</th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Loading purchases register...
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No purchase invoices recorded yet for this branch.
                  </td>
                </tr>
              ) : (
                purchases.map((pur) => (
                  <tr key={pur.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{pur.invoiceNumber}</td>
                    <td className="py-3 px-3 font-semibold text-slate-800">{pur.supplier?.name}</td>
                    <td className="py-3 px-3 font-mono text-slate-700">{pur.supplierInvoiceNumber}</td>
                    <td className="py-3 px-3 text-slate-600">
                      {new Date(pur.invoiceDate).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600">₹{pur.subtotal.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600">₹{pur.taxTotal.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                      ₹{pur.grandTotal.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant="success" size="sm">
                        {pur.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Purchase Invoice Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Record Supplier Purchase Invoice" maxWidth="3xl">
        <form onSubmit={handleSubmitPurchase} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Supplier *</label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
              >
                <option value="">-- Choose Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.phone})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Supplier Invoice Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. INV-90442"
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Invoice Date *</label>
              <input
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Invoice Items & Batches</label>
              <button
                type="button"
                onClick={addLine}
                className="text-xs text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Another Item
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((l, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-6 gap-2 text-xs items-end">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Medicine *</label>
                    <select
                      required
                      value={l.medicineId}
                      onChange={(e) => updateLine(idx, 'medicineId', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    >
                      <option value="">-- Choose Medicine --</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.brandName} ({p.strength})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Batch # *</label>
                    <input
                      type="text"
                      required
                      placeholder="Batch"
                      value={l.batchNumber}
                      onChange={(e) => updateLine(idx, 'batchNumber', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Expiry *</label>
                    <input
                      type="date"
                      required
                      value={l.expiryDate}
                      onChange={(e) => updateLine(idx, 'expiryDate', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Qty *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={l.quantity}
                      onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Rate (₹) *</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={l.purchaseRate}
                        onChange={(e) => updateLine(idx, 'purchaseRate', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono"
                      />
                    </div>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-rose-600 hover:text-rose-800 pb-1"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
            >
              Confirm Purchase Receipt
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
