import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Supplier, MedicineProduct, PurchaseInvoice, StockBatch } from '../types';
import {
  Truck,
  Plus,
  Search,
  Building2,
  Calendar,
  FileText,
  RotateCcw,
  Percent,
  TrendingUp,
  AlertCircle,
  Eye,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';

interface PurchaseLineForm {
  medicineId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  freeQuantity: number;
  purchaseRate: number;
  sellingRate: number;
  mrp: number;
  discountPercent: number;
  discountAmount: number;
  gstRate: number;
}

export const PurchasesPage: React.FC = () => {
  const { currentBranch, selectedBranchId, isBillingUser } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'invoices' | 'returns'>('invoices');
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<MedicineProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal: New Purchase Invoice
  const [showModal, setShowModal] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<string>('CASH');
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [invoiceDiscountAmount, setInvoiceDiscountAmount] = useState<string>('0');
  const [additionalCharges, setAdditionalCharges] = useState<string>('0');
  const [notes, setNotes] = useState('');

  const [lines, setLines] = useState<PurchaseLineForm[]>([
    {
      medicineId: '',
      batchNumber: '',
      expiryDate: '',
      quantity: 50,
      freeQuantity: 0,
      purchaseRate: 20,
      sellingRate: 28,
      mrp: 30,
      discountPercent: 0,
      discountAmount: 0,
      gstRate: 12,
    },
  ]);

  // Modal: Purchase Return
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnSupplierId, setReturnSupplierId] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [branchBatches, setBranchBatches] = useState<StockBatch[]>([]);
  const [returnItems, setReturnItems] = useState<Array<{ batchId: string; medicineId: string; batchNumber: string; quantity: number; purchaseRate: number; gstRate: number }>>([
    { batchId: '', medicineId: '', batchNumber: '', quantity: 1, purchaseRate: 0, gstRate: 12 },
  ]);

  // Modal: View Purchase Details
  const [viewInvoice, setViewInvoice] = useState<PurchaseInvoice | null>(null);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [purRes, supRes, prodRes, retRes, batchRes] = await Promise.all([
        api.getPurchases({ branchId: selectedBranchId }),
        api.getSuppliers(),
        api.getProducts({ limit: 150 }),
        api.getPurchaseReturns({ branchId: selectedBranchId }),
        api.getBatches({ branchId: selectedBranchId, status: 'ACTIVE' }),
      ]);
      setPurchases(purRes.purchases || []);
      setSuppliers(supRes || []);
      setProducts(prodRes.products || []);
      setPurchaseReturns(retRes.returns || []);
      setBranchBatches(batchRes || []);
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
      {
        medicineId: '',
        batchNumber: '',
        expiryDate: '',
        quantity: 50,
        freeQuantity: 0,
        purchaseRate: 20,
        sellingRate: 28,
        mrp: 30,
        discountPercent: 0,
        discountAmount: 0,
        gstRate: 12,
      },
    ]);
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof PurchaseLineForm, val: any) => {
    const updated = [...lines];
    (updated[idx] as any)[field] = val;

    if (field === 'medicineId') {
      const prod = products.find((p) => p.id === val);
      if (prod) {
        updated[idx].mrp = prod.mrp;
        updated[idx].sellingRate = prod.defaultSellingRate || prod.mrp;
        updated[idx].purchaseRate = prod.defaultPurchaseRate || Math.round(prod.mrp * 0.7);
        updated[idx].gstRate = prod.gstRate;
      }
    }
    setLines(updated);
  };

  // Calculations for live form
  let formSubtotal = 0;
  let formLineDiscounts = 0;
  let formTaxTotal = 0;

  lines.forEach((l) => {
    const qty = Number(l.quantity) || 0;
    const rate = Number(l.purchaseRate) || 0;
    const gross = qty * rate;
    let disc = 0;
    if (l.discountPercent > 0) {
      disc = (gross * Number(l.discountPercent)) / 100;
    } else if (l.discountAmount > 0) {
      disc = Number(l.discountAmount);
    }
    const taxable = Math.max(0, gross - disc);
    const tax = (taxable * (Number(l.gstRate) || 0)) / 100;

    formSubtotal += taxable;
    formLineDiscounts += disc;
    formTaxTotal += tax;
  });

  const invDiscAmt = parseFloat(invoiceDiscountAmount) || 0;
  const extraCharges = parseFloat(additionalCharges) || 0;
  const formGrandTotal = Math.max(0, formSubtotal - invDiscAmt + formTaxTotal + extraCharges);

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const parsedPaid = paidAmount !== '' ? parseFloat(paidAmount) : (paymentMode === 'CREDIT' ? 0 : formGrandTotal);

      await api.createPurchase({
        branchId: selectedBranchId,
        supplierId,
        supplierInvoiceNumber,
        invoiceDate,
        paymentMode,
        paidAmount: parsedPaid,
        invoiceDiscountAmount: invDiscAmt,
        additionalCharges: extraCharges,
        notes,
        lines: lines.map((l) => ({
          medicineId: l.medicineId,
          batchNumber: l.batchNumber.trim(),
          expiryDate: l.expiryDate,
          quantity: Number(l.quantity),
          freeQuantity: Number(l.freeQuantity) || 0,
          purchaseRate: Number(l.purchaseRate),
          sellingRate: Number(l.sellingRate) || Number(l.mrp),
          mrp: Number(l.mrp),
          discountPercent: Number(l.discountPercent) || 0,
          discountAmount: Number(l.discountAmount) || 0,
          gstRate: Number(l.gstRate),
        })),
      });

      setMessage({ text: 'Purchase Invoice recorded, batch stock increased, and margins logged successfully.', type: 'success' });
      setShowModal(false);
      // Reset form
      setSupplierInvoiceNumber('');
      setNotes('');
      setPaidAmount('');
      setLines([
        {
          medicineId: '',
          batchNumber: '',
          expiryDate: '',
          quantity: 50,
          freeQuantity: 0,
          purchaseRate: 20,
          sellingRate: 28,
          mrp: 30,
          discountPercent: 0,
          discountAmount: 0,
          gstRate: 12,
        },
      ]);
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to record purchase invoice', type: 'error' });
    }
  };

  // Handle Supplier Purchase Return submission
  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      await api.createPurchaseReturn({
        branchId: selectedBranchId,
        supplierId: returnSupplierId,
        reason: returnReason,
        items: returnItems.map((item) => ({
          medicineId: item.medicineId,
          batchId: item.batchId,
          batchNumber: item.batchNumber,
          quantity: Number(item.quantity),
          purchaseRate: Number(item.purchaseRate),
          gstRate: Number(item.gstRate),
        })),
      });

      setMessage({ text: 'Purchase return processed. Batch stock deducted and supplier debit recorded.', type: 'success' });
      setShowReturnModal(false);
      setReturnReason('');
      setReturnItems([{ batchId: '', medicineId: '', batchNumber: '', quantity: 1, purchaseRate: 0, gstRate: 12 }]);
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to process purchase return', type: 'error' });
    }
  };

  const handleReturnBatchSelect = (idx: number, batchId: string) => {
    const selected = branchBatches.find((b) => b.id === batchId);
    if (!selected) return;
    const updated = [...returnItems];
    updated[idx] = {
      batchId: selected.id,
      medicineId: selected.medicineId,
      batchNumber: selected.batchNumber,
      quantity: 1,
      purchaseRate: selected.purchaseRate,
      gstRate: selected.medicine?.gstRate || 12,
    };
    setReturnItems(updated);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Purchase Management & Inwards</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Record inwards goods with explicit purchase rates, selling rates, batch discounts, margins, and supplier returns.
          </p>
        </div>

        {!isBillingUser && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReturnModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Supplier Return
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Record Purchase Invoice
            </button>
          </div>
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

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 text-xs font-bold">
        <button
          onClick={() => setActiveSubTab('invoices')}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeSubTab === 'invoices'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Inward Purchase Invoices ({purchases.length})
        </button>
        <button
          onClick={() => setActiveSubTab('returns')}
          className={`pb-2.5 px-3 border-b-2 transition-colors ${
            activeSubTab === 'returns'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Supplier Debit / Purchase Returns ({purchaseReturns.length})
        </button>
      </div>

      {activeSubTab === 'invoices' ? (
        /* Purchases Register Table */
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
                  <th className="py-3 px-3 text-right text-rose-600">Discount</th>
                  <th className="py-3 px-3 text-right">Tax (GST)</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                  <th className="py-3 px-3 text-center">Payment</th>
                  <th className="py-3 px-3 text-right">Paid</th>
                  <th className="py-3 px-3 text-right">Balance</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-slate-400">
                      Loading purchases register...
                    </td>
                  </tr>
                ) : purchases.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-slate-400">
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
                      <td className="py-3 px-3 text-right font-mono text-rose-600">
                        {pur.discountTotal ? `₹${pur.discountTotal.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">₹{pur.taxTotal.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                        ₹{pur.grandTotal.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          pur.paymentMode === 'CREDIT' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {pur.paymentMode || 'CASH'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700">
                        ₹{(pur.paidAmount !== undefined ? pur.paidAmount : pur.grandTotal).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-amber-700">
                        {pur.outstandingAmount && pur.outstandingAmount > 0
                          ? `₹${pur.outstandingAmount.toFixed(2)}`
                          : <span className="text-emerald-600">Settled</span>}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setViewInvoice(pur)}
                          className="p-1 text-slate-400 hover:text-emerald-600 transition-colors"
                          title="View Lines & Margins"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Purchase Returns Register Table */
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Debit Note / Return #</th>
                  <th className="py-3 px-3">Supplier Name</th>
                  <th className="py-3 px-3">Return Date</th>
                  <th className="py-3 px-3">Reason</th>
                  <th className="py-3 px-3 text-right">Taxable</th>
                  <th className="py-3 px-3 text-right">Tax</th>
                  <th className="py-3 px-4 text-right">Debit Total</th>
                  <th className="py-3 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {purchaseReturns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No supplier returns processed yet.
                    </td>
                  </tr>
                ) : (
                  purchaseReturns.map((ret: any) => (
                    <tr key={ret.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-amber-900">{ret.returnNumber}</td>
                      <td className="py-3 px-3 font-semibold text-slate-800">{ret.supplier?.name}</td>
                      <td className="py-3 px-3 text-slate-600">
                        {new Date(ret.returnDate).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-3 text-slate-600 max-w-xs truncate">{ret.reason}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">₹{ret.subtotal.toFixed(2)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600">₹{ret.taxTotal.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">
                        ₹{ret.grandTotal.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant="warning" size="sm">{ret.status}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Purchase Invoice Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Record Inward Supplier Purchase Invoice" maxWidth="4xl">
        <form onSubmit={handleSubmitPurchase} className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
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
              <label className="text-xs font-bold text-slate-700 block mb-1">Supplier Invoice # *</label>
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
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-semibold"
              >
                <option value="CASH">Cash</option>
                <option value="CREDIT">Credit (Pay Later)</option>
                <option value="UPI">UPI / Digital</option>
                <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-700">Invoice Line Items & Batches</label>
                <p className="text-[10px] text-slate-400">
                  Enter manual purchase rate, selling rate, purchase discount %, and scheme free quantity.
                </p>
              </div>
              <button
                type="button"
                onClick={addLine}
                className="text-xs text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Line Item
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {lines.map((l, idx) => {
                const qty = Number(l.quantity) || 0;
                const freeQty = Number(l.freeQuantity) || 0;
                const pRate = Number(l.purchaseRate) || 0;
                const sRate = Number(l.sellingRate) || Number(l.mrp) || 0;
                const gross = qty * pRate;
                const disc = l.discountPercent > 0 ? (gross * l.discountPercent) / 100 : (l.discountAmount || 0);
                const taxable = Math.max(0, gross - disc);
                const totalUnits = qty + freeQty;
                const effectiveUnitCost = totalUnits > 0 ? taxable / totalUnits : pRate;
                const expectedMarginPct = sRate > 0 ? ((sRate - effectiveUnitCost) / sRate) * 100 : 0;
                const expectedMarkupPct = effectiveUnitCost > 0 ? ((sRate - effectiveUnitCost) / effectiveUnitCost) * 100 : 0;

                return (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3">
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
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Batch # *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. DL-24A01"
                          value={l.batchNumber}
                          onChange={(e) => updateLine(idx, 'batchNumber', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Expiry Date *</label>
                        <input
                          type="date"
                          required
                          value={l.expiryDate}
                          onChange={(e) => updateLine(idx, 'expiryDate', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono"
                        />
                      </div>
                      <div className="col-span-1">
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
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5 text-emerald-700">Free/Scheme</label>
                        <input
                          type="number"
                          min="0"
                          value={l.freeQuantity}
                          onChange={(e) => updateLine(idx, 'freeQuantity', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-emerald-300 rounded font-mono text-emerald-800"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-blue-900 block mb-0.5">Pur Rate (₹) *</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={l.purchaseRate}
                          onChange={(e) => updateLine(idx, 'purchaseRate', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-blue-300 rounded font-mono font-bold text-blue-900"
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-emerald-900 block mb-0.5">Sell Rate (₹) *</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={l.sellingRate}
                          onChange={(e) => updateLine(idx, 'sellingRate', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-emerald-300 rounded font-mono font-bold text-emerald-900"
                        />
                      </div>
                      <div className="col-span-1 flex items-center justify-end">
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="text-rose-600 hover:text-rose-800 p-1"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Secondary line row: MRP, Discount, GST, and live Expected Margins */}
                    <div className="grid grid-cols-12 gap-2 pt-1 border-t border-slate-200/60 items-center text-[11px]">
                      <div className="col-span-2">
                        <label className="text-[10px] text-slate-500 block">Printed MRP (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={l.mrp}
                          onChange={(e) => updateLine(idx, 'mrp', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-slate-500 block">Pur Discount (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={l.discountPercent}
                          onChange={(e) => updateLine(idx, 'discountPercent', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-slate-500 block">GST Rate (%)</label>
                        <select
                          value={l.gstRate}
                          onChange={(e) => updateLine(idx, 'gstRate', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                        >
                          <option value="0">0%</option>
                          <option value="5">5%</option>
                          <option value="12">12%</option>
                          <option value="18">18%</option>
                          <option value="28">28%</option>
                        </select>
                      </div>
                      <div className="col-span-6 flex items-center justify-end gap-3 font-mono text-slate-600">
                        <span>Line Taxable: ₹{taxable.toFixed(2)}</span>
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Expected Margin: {expectedMarginPct.toFixed(1)}%
                        </span>
                        <span className="text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          Markup: {expectedMarkupPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Invoice-Level Summary & Discount Section */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Invoice Discount (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={invoiceDiscountAmount}
                onChange={(e) => setInvoiceDiscountAmount(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Additional Charges (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={additionalCharges}
                onChange={(e) => setAdditionalCharges(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Paid Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={paymentMode === 'CREDIT' ? '0.00' : formGrandTotal.toFixed(2)}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono font-bold text-slate-800"
              />
            </div>
            <div className="text-right flex flex-col justify-center">
              <span className="text-[10px] text-slate-500">Calculated Final Amount</span>
              <span className="text-base font-bold font-mono text-emerald-800">₹{formGrandTotal.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Notes / Remarks</label>
            <input
              type="text"
              placeholder="e.g. Received in good condition, transport via VRL Logistics"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
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
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs"
            >
              Confirm Purchase & Receive Stock
            </button>
          </div>
        </form>
      </Modal>

      {/* Supplier Return Modal */}
      <Modal isOpen={showReturnModal} onClose={() => setShowReturnModal(false)} title="Process Supplier Purchase Return (Debit Note)" maxWidth="2xl">
        <form onSubmit={handleSubmitReturn} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Supplier *</label>
              <select
                required
                value={returnSupplierId}
                onChange={(e) => setReturnSupplierId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="">-- Choose Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Return Reason *</label>
              <input
                type="text"
                required
                placeholder="e.g. Damaged packaging, Near expiry stock exchange"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-700 block">Select Stock Batches to Return</label>
            {returnItems.map((item, idx) => (
              <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-6 gap-2 text-xs items-end">
                <div className="col-span-3">
                  <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Active Stock Batch *</label>
                  <select
                    required
                    value={item.batchId}
                    onChange={(e) => handleReturnBatchSelect(idx, e.target.value)}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded"
                  >
                    <option value="">-- Choose Batch to Return --</option>
                    {branchBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.medicine?.brandName} | Batch: {b.batchNumber} (Avail: {b.availableQuantity})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Return Qty *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={item.quantity}
                    onChange={(e) => {
                      const updated = [...returnItems];
                      updated[idx].quantity = Number(e.target.value);
                      setReturnItems(updated);
                    }}
                    className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Pur Rate (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    disabled
                    value={item.purchaseRate}
                    className="w-full px-2 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded font-mono text-slate-600"
                  />
                </div>
                <div className="flex justify-end pb-1">
                  {returnItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setReturnItems(returnItems.filter((_, i) => i !== idx))}
                      className="text-rose-600 hover:text-rose-800"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowReturnModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold"
            >
              Issue Return & Deduct Stock
            </button>
          </div>
        </form>
      </Modal>

      {/* View Purchase Invoice Details Modal */}
      {viewInvoice && (
        <Modal isOpen={!!viewInvoice} onClose={() => setViewInvoice(null)} title={`Purchase Invoice Details: ${viewInvoice.invoiceNumber}`} maxWidth="3xl">
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-400 block">Supplier</span>
                <span className="font-bold text-slate-900">{viewInvoice.supplier?.name}</span>
                <span className="text-slate-500 block font-mono">{viewInvoice.supplier?.gstin || 'No GSTIN'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Supplier Inv #</span>
                <span className="font-bold font-mono text-slate-800">{viewInvoice.supplierInvoiceNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Invoice Date</span>
                <span className="font-semibold text-slate-800">
                  {new Date(viewInvoice.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>

            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">Medicine</th>
                  <th className="py-2 px-2">Batch #</th>
                  <th className="py-2 px-2 text-right">Qty (+Free)</th>
                  <th className="py-2 px-2 text-right">Pur Rate</th>
                  <th className="py-2 px-2 text-right">Sell Rate</th>
                  <th className="py-2 px-2 text-right">MRP</th>
                  <th className="py-2 px-2 text-right">Disc %</th>
                  <th className="py-2 px-3 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {viewInvoice.lines.map((l: any, i: number) => (
                  <tr key={i}>
                    <td className="py-2 px-3 font-sans font-semibold text-slate-900">
                      {l.medicine?.brandName || 'Medicine'}
                    </td>
                    <td className="py-2 px-2 text-slate-700">{l.batchNumber}</td>
                    <td className="py-2 px-2 text-right">
                      {l.quantity} {l.freeQuantity > 0 && <span className="text-emerald-700 font-bold">(+{l.freeQuantity})</span>}
                    </td>
                    <td className="py-2 px-2 text-right text-blue-900 font-bold">₹{l.purchaseRate.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right text-emerald-900 font-semibold">
                      ₹{(l.sellingRate || l.mrp).toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-600">₹{l.mrp.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right text-rose-600">{l.discountPercent}%</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">₹{l.lineTotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 font-semibold">Payment Status: </span>
                <span className="font-bold text-slate-800">{viewInvoice.paymentMode}</span>
                {viewInvoice.outstandingAmount && viewInvoice.outstandingAmount > 0 && (
                  <span className="ml-2 text-amber-700 font-bold font-mono">
                    (Outstanding: ₹{viewInvoice.outstandingAmount.toFixed(2)})
                  </span>
                )}
              </div>
              <div className="text-right font-mono">
                <span className="text-slate-500 mr-2">Grand Total:</span>
                <span className="text-sm font-bold text-emerald-800">₹{viewInvoice.grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
