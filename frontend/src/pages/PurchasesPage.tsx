import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Supplier, MedicineProduct, PurchaseInvoice, StockBatch, SystemSettings } from '../types';
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
  Edit2,
  Trash2,
  Ban,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  ChevronDown,
  UserCheck,
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
  const { currentBranch, selectedBranchId, isBillingUser, isSuperAdmin, isBranchAdmin } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'invoices' | 'suppliers' | 'returns'>('invoices');
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<MedicineProduct[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');

  // Modal: New/Edit Purchase Invoice
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState('');
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<string>('CASH');
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [invoiceDiscountPercent, setInvoiceDiscountPercent] = useState<string>('0');
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
      discountPercent: 15, // Default 15%
      discountAmount: 0,
      gstRate: 5.0, // Default 5% (2.5% CGST + 2.5% SGST)
    },
  ]);

  // Modal: Inline Add New Supplier
  const [showInlineSupplierModal, setShowInlineSupplierModal] = useState(false);
  const [inlineSupplierForm, setInlineSupplierForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    gstin: '',
    address: '',
    dlNumber: '',
  });

  // Modal: Inline Add New Medicine
  const [showInlineMedicineModal, setShowInlineMedicineModal] = useState(false);
  const [inlineMedicineTargetIdx, setInlineMedicineTargetIdx] = useState<number | null>(null);
  const [inlineMedicineForm, setInlineMedicineForm] = useState({
    brandName: '',
    genericName: '',
    strength: '650mg',
    dosageForm: 'Tablet',
    manufacturer: '',
    mrp: '100',
    defaultPurchaseRate: '70',
    defaultSellingRate: '100',
    gstRate: '5.0',
    hsnCode: '30049099',
  });

  // Modal: Full Supplier Management (Add / Edit)
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [isEditingSupplier, setIsEditingSupplier] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    gstin: '',
    address: '',
    dlNumber: '',
    isActive: true,
  });

  // Modal: Cancel Purchase Invoice Confirmation
  const [cancelTargetInvoice, setCancelTargetInvoice] = useState<PurchaseInvoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancellingInvoice, setIsCancellingInvoice] = useState(false);

  // Modal: Delete / Archive Supplier Confirmation
  const [deleteTargetSupplier, setDeleteTargetSupplier] = useState<Supplier | null>(null);

  // Modal: Purchase Return
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnSupplierId, setReturnSupplierId] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [branchBatches, setBranchBatches] = useState<StockBatch[]>([]);
  const [returnItems, setReturnItems] = useState<Array<{ batchId: string; medicineId: string; batchNumber: string; quantity: number; purchaseRate: number; gstRate: number }>>([
    { batchId: '', medicineId: '', batchNumber: '', quantity: 1, purchaseRate: 0, gstRate: 5.0 },
  ]);

  // Modal: View Purchase Details
  const [viewInvoice, setViewInvoice] = useState<PurchaseInvoice | null>(null);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [purRes, supRes, prodRes, retRes, batchRes, settingsRes] = await Promise.all([
        api.getPurchases({ branchId: selectedBranchId }),
        api.getSuppliers({ includeInactive: true }),
        api.getProducts({ limit: 200 }),
        api.getPurchaseReturns({ branchId: selectedBranchId }),
        api.getBatches({ branchId: selectedBranchId, status: 'ACTIVE' }),
        api.getSettings().catch(() => null),
      ]);
      setPurchases(purRes.purchases || []);
      setSuppliers(supRes || []);
      setProducts(prodRes.products || []);
      setPurchaseReturns(retRes.returns || []);
      setBranchBatches(batchRes || []);
      if (settingsRes && settingsRes.settings) {
        setSystemSettings(settingsRes.settings);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchId]);

  // Derived configurable defaults
  const configuredDiscount = systemSettings?.DEFAULT_PURCHASE_DISCOUNT_PERCENT
    ? parseFloat(systemSettings.DEFAULT_PURCHASE_DISCOUNT_PERCENT)
    : 15.0;

  const configuredCombinedGST = systemSettings?.DEFAULT_COMBINED_GST_RATE
    ? parseFloat(systemSettings.DEFAULT_COMBINED_GST_RATE)
    : 5.0;

  const configuredCGST = systemSettings?.DEFAULT_CGST_RATE
    ? parseFloat(systemSettings.DEFAULT_CGST_RATE)
    : 2.5;

  const configuredSGST = systemSettings?.DEFAULT_SGST_RATE
    ? parseFloat(systemSettings.DEFAULT_SGST_RATE)
    : 2.5;

  const openNewPurchaseModal = () => {
    setIsEditing(false);
    setEditingInvoiceId(null);
    setSupplierId('');
    setSupplierSearchQuery('');
    setSupplierInvoiceNumber('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setPaymentMode('CASH');
    setPaidAmount('');
    setInvoiceDiscountPercent('0');
    setInvoiceDiscountAmount('0');
    setAdditionalCharges('0');
    setNotes('');
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
        discountPercent: configuredDiscount, // Auto-prefill configured default (15%)
        discountAmount: 0,
        gstRate: configuredCombinedGST, // Auto-prefill configured default (5%)
      },
    ]);
    setShowModal(true);
  };

  const openEditPurchaseModal = (pur: PurchaseInvoice) => {
    if (pur.status === 'CANCELLED') {
      setMessage({ text: 'Cannot edit a cancelled purchase invoice.', type: 'error' });
      return;
    }
    setIsEditing(true);
    setEditingInvoiceId(pur.id);
    setSupplierId(pur.supplierId);
    setSupplierSearchQuery(pur.supplier?.name || '');
    setSupplierInvoiceNumber(pur.supplierInvoiceNumber);
    setInvoiceDate(new Date(pur.invoiceDate).toISOString().split('T')[0]);
    setPaymentMode(pur.paymentMode || 'CASH');
    setPaidAmount(pur.paidAmount !== undefined ? pur.paidAmount.toString() : '');
    setInvoiceDiscountPercent('0');
    setInvoiceDiscountAmount('0');
    setAdditionalCharges((pur.additionalCharges || 0).toString());
    setNotes(pur.notes || '');

    setLines(
      pur.lines.map((l: any) => ({
        medicineId: l.medicineId,
        batchNumber: l.batchNumber,
        expiryDate: new Date(l.expiryDate).toISOString().split('T')[0],
        quantity: l.quantity,
        freeQuantity: l.freeQuantity || 0,
        purchaseRate: l.purchaseRate,
        sellingRate: l.sellingRate || l.mrp,
        mrp: l.mrp,
        discountPercent: l.discountPercent || 0,
        discountAmount: l.discountAmount || 0,
        gstRate: l.gstRate,
      }))
    );
    setShowModal(true);
  };

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
        discountPercent: configuredDiscount, // Respects configured default discount (15%)
        discountAmount: 0,
        gstRate: configuredCombinedGST, // Respects configured default GST (5%)
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
        // Respect product-level tax classification
        updated[idx].gstRate = prod.gstRate !== undefined ? prod.gstRate : configuredCombinedGST;
      }
    }
    setLines(updated);
  };

  // Calculations for live form
  let formSubtotal = 0;
  let formLineDiscounts = 0;
  let formCGSTTotal = 0;
  let formSGSTTotal = 0;
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
    const lineGst = Number(l.gstRate) || 0;
    const lineTax = (taxable * lineGst) / 100;
    const lineCGST = lineTax / 2;
    const lineSGST = lineTax / 2;

    formSubtotal += taxable;
    formLineDiscounts += disc;
    formCGSTTotal += lineCGST;
    formSGSTTotal += lineSGST;
    formTaxTotal += lineTax;
  });

  const invDiscAmt = parseFloat(invoiceDiscountAmount) || 0;
  const extraCharges = parseFloat(additionalCharges) || 0;
  const formGrandTotal = Math.max(0, formSubtotal - invDiscAmt + formTaxTotal + extraCharges);

  const selectedSupplierObj = suppliers.find((s) => s.id === supplierId);

  // Filtered suppliers for searchable combobox
  const filteredSuppliers = suppliers.filter((s) => {
    if (!supplierSearchQuery) return true;
    const q = supplierSearchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.phone && s.phone.includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q)) ||
      (s.gstin && s.gstin.toLowerCase().includes(q))
    );
  });

  const handleSelectSupplier = (s: Supplier) => {
    setSupplierId(s.id);
    setSupplierSearchQuery(s.name);
    setShowSupplierDropdown(false);
  };

  // Submit Purchase (Create or Update)
  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!supplierId) {
      setMessage({ text: 'Please select a supplier or add a new one.', type: 'error' });
      return;
    }

    try {
      const parsedPaid = paidAmount !== '' ? parseFloat(paidAmount) : (paymentMode === 'CREDIT' ? 0 : formGrandTotal);

      const payload = {
        branchId: selectedBranchId,
        supplierId,
        supplierInvoiceNumber: supplierInvoiceNumber.trim(),
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
      };

      if (isEditing && editingInvoiceId) {
        await api.updatePurchase(editingInvoiceId, payload);
        setMessage({
          text: `Purchase Invoice updated successfully. Inwards stock batches were safely reconciled.`,
          type: 'success',
        });
      } else {
        await api.createPurchase(payload);
        setMessage({
          text: 'Purchase Invoice recorded, batch stock increased, and margins logged successfully.',
          type: 'success',
        });
      }

      setShowModal(false);
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save purchase invoice', type: 'error' });
    }
  };

  // Handle Cancel Purchase Invoice
  const handleConfirmCancelInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTargetInvoice) return;

    setIsCancellingInvoice(true);
    setMessage(null);
    try {
      await api.cancelPurchase(cancelTargetInvoice.id, cancelReason);
      setMessage({
        text: `Purchase Invoice ${cancelTargetInvoice.invoiceNumber} has been cancelled and inward stock reversed.`,
        type: 'success',
      });
      setCancelTargetInvoice(null);
      setCancelReason('');
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to cancel purchase invoice.', type: 'error' });
    } finally {
      setIsCancellingInvoice(false);
    }
  };

  // Inline Quick Add Supplier
  const handleSaveInlineSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const created = await api.createSupplier(inlineSupplierForm);
      setSuppliers((prev) => [...prev, created]);
      setSupplierId(created.id);
      setSupplierSearchQuery(created.name);
      setShowInlineSupplierModal(false);
      setInlineSupplierForm({
        name: '',
        contactPerson: '',
        phone: '',
        email: '',
        gstin: '',
        address: '',
        dlNumber: '',
      });
      setMessage({ text: `Supplier '${created.name}' created and selected.`, type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create supplier.', type: 'error' });
    }
  };

  // Inline Quick Add Medicine
  const handleSaveInlineMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const created = await api.createProduct({
        ...inlineMedicineForm,
        gstRate: parseFloat(inlineMedicineForm.gstRate),
        mrp: parseFloat(inlineMedicineForm.mrp),
        defaultPurchaseRate: parseFloat(inlineMedicineForm.defaultPurchaseRate),
        defaultSellingRate: parseFloat(inlineMedicineForm.defaultSellingRate),
      });

      setProducts((prev) => [...prev, created]);
      if (inlineMedicineTargetIdx !== null) {
        updateLine(inlineMedicineTargetIdx, 'medicineId', created.id);
      }
      setShowInlineMedicineModal(false);
      setInlineMedicineForm({
        brandName: '',
        genericName: '',
        strength: '650mg',
        dosageForm: 'Tablet',
        manufacturer: '',
        mrp: '100',
        defaultPurchaseRate: '70',
        defaultSellingRate: '100',
        gstRate: '5.0',
        hsnCode: '30049099',
      });
      setMessage({ text: `Medicine '${created.brandName}' registered in catalogue and linked to invoice line.`, type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create medicine.', type: 'error' });
    }
  };

  // Supplier CRUD (Suppliers Tab)
  const openNewSupplierModal = () => {
    setIsEditingSupplier(false);
    setEditingSupplierId(null);
    setSupplierForm({
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      gstin: '',
      address: '',
      dlNumber: '',
      isActive: true,
    });
    setShowSupplierModal(true);
  };

  const openEditSupplierModal = (sup: Supplier) => {
    setIsEditingSupplier(true);
    setEditingSupplierId(sup.id);
    setSupplierForm({
      name: sup.name,
      contactPerson: sup.contactPerson || '',
      phone: sup.phone,
      email: sup.email || '',
      gstin: sup.gstin || '',
      address: sup.address || '',
      dlNumber: sup.dlNumber || '',
      isActive: sup.isActive,
    });
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      if (isEditingSupplier && editingSupplierId) {
        await api.updateSupplier(editingSupplierId, supplierForm);
        setMessage({ text: `Supplier '${supplierForm.name}' updated successfully.`, type: 'success' });
      } else {
        await api.createSupplier(supplierForm);
        setMessage({ text: `Supplier '${supplierForm.name}' created successfully.`, type: 'success' });
      }
      setShowSupplierModal(false);
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to save supplier.', type: 'error' });
    }
  };

  const handleConfirmDeleteSupplier = async () => {
    if (!deleteTargetSupplier) return;
    setMessage(null);
    try {
      const res = await api.deleteSupplier(deleteTargetSupplier.id);
      setMessage({ text: res.message || 'Supplier deleted successfully.', type: 'success' });
      setDeleteTargetSupplier(null);
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to delete supplier.', type: 'error' });
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
      setReturnItems([{ batchId: '', medicineId: '', batchNumber: '', quantity: 1, purchaseRate: 0, gstRate: 5.0 }]);
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
      gstRate: selected.medicine?.gstRate || configuredCombinedGST,
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
            Manage suppliers with validated email addresses, record inwards with configurable default discount ({configuredDiscount}%) & GST ({configuredCombinedGST}%), reconcile stock edits, and issue returns.
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
              onClick={openNewPurchaseModal}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
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

      {/* Primary Sub-Tabs */}
      <div className="flex gap-2 border-b border-slate-200 text-xs font-bold">
        <button
          onClick={() => setActiveSubTab('invoices')}
          className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'invoices'
              ? 'border-brand-500 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Inward Purchase Invoices ({purchases.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('suppliers')}
          className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'suppliers'
              ? 'border-brand-500 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Suppliers Directory ({suppliers.length})</span>
        </button>
        <button
          onClick={() => setActiveSubTab('returns')}
          className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
            activeSubTab === 'returns'
              ? 'border-brand-500 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Supplier Debit / Returns ({purchaseReturns.length})</span>
        </button>
      </div>

      {/* Sub-Tab 1: Purchase Invoices Register */}
      {activeSubTab === 'invoices' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="Search by Invoice #, Supplier Invoice #, Supplier..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-3">
              <span>Default Inward Discount: <strong className="text-pharmagreen-700 font-mono">{configuredDiscount}%</strong></span>
              <span>Default GST: <strong className="text-slate-800 font-mono">{configuredCombinedGST}%</strong> (CGST {configuredCGST}% + SGST {configuredSGST}%)</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">System Inv #</th>
                    <th className="py-3 px-3">Supplier Inv #</th>
                    <th className="py-3 px-3">Supplier & Email</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3 text-right">Taxable</th>
                    <th className="py-3 px-3 text-right">Disc Amount</th>
                    <th className="py-3 px-3 text-right">GST Total</th>
                    <th className="py-3 px-4 text-right">Grand Total</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        Loading purchase invoices...
                      </td>
                    </tr>
                  ) : purchases.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        <p className="text-sm font-bold text-slate-800">No purchase invoices available yet.</p>
                        <p className="text-xs text-slate-500 mt-1">Record inward purchases to automatically generate batches and stock movements.</p>
                        <button
                          onClick={openNewPurchaseModal}
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Record First Purchase
                        </button>
                      </td>
                    </tr>
                  ) : (
                    purchases
                      .filter((p) => {
                        if (!invoiceSearch) return true;
                        const q = invoiceSearch.toLowerCase();
                        return (
                          p.invoiceNumber.toLowerCase().includes(q) ||
                          p.supplierInvoiceNumber.toLowerCase().includes(q) ||
                          (p.supplier?.name && p.supplier.name.toLowerCase().includes(q))
                        );
                      })
                      .map((pur) => (
                        <tr key={pur.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{pur.invoiceNumber}</td>
                          <td className="py-3 px-3 font-mono font-semibold text-slate-700">{pur.supplierInvoiceNumber}</td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-slate-900 block">{pur.supplier?.name}</span>
                            {pur.supplier?.email && (
                              <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                <Mail className="w-2.5 h-2.5" /> {pur.supplier.email}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-600">
                            {new Date(pur.invoiceDate).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-700">₹{pur.subtotal.toFixed(2)}</td>
                          <td className="py-3 px-3 text-right font-mono text-rose-600">
                            {pur.discountTotal ? `-₹${pur.discountTotal.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">₹{pur.taxTotal.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                            ₹{pur.grandTotal.toFixed(2)}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <Badge variant={pur.status === 'CANCELLED' ? 'danger' : 'success'} size="sm">
                              {pur.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setViewInvoice(pur)}
                                className="p-1 text-slate-400 hover:text-emerald-600 transition-colors rounded hover:bg-slate-100"
                                title="View Lines & Tax Breakdown"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {!isBillingUser && pur.status !== 'CANCELLED' && (
                                <>
                                  <button
                                    onClick={() => openEditPurchaseModal(pur)}
                                    className="p-1 text-slate-400 hover:text-blue-600 transition-colors rounded hover:bg-slate-100"
                                    title="Edit Invoice & Reconcile Stock"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setCancelTargetInvoice(pur);
                                      setCancelReason('');
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors rounded hover:bg-slate-100"
                                    title="Cancel Invoice & Restore Stock"
                                  >
                                    <Ban className="w-4 h-4" />
                                  </button>
                                </>
                              )}
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

      {/* Sub-Tab 2: Supplier Directory with Full CRUD */}
      {activeSubTab === 'suppliers' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative w-full max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                placeholder="Search suppliers by name, phone, email, GSTIN..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {!isBillingUser && (
              <button
                onClick={openNewSupplierModal}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add New Supplier
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Supplier Name</th>
                    <th className="py-3 px-3">Contact Person</th>
                    <th className="py-3 px-3">Phone</th>
                    <th className="py-3 px-3">Email ID</th>
                    <th className="py-3 px-3 font-mono">GSTIN</th>
                    <th className="py-3 px-3">Invoices Recorded</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        <p className="text-sm font-bold text-slate-800">No suppliers found.</p>
                        <p className="text-xs text-slate-500 mt-1">Add your first supplier to continue with purchasing and vendor management.</p>
                        <button
                          onClick={openNewSupplierModal}
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add First Supplier
                        </button>
                      </td>
                    </tr>
                  ) : (
                    suppliers
                      .filter((s) => {
                        if (!supplierSearch) return true;
                        const q = supplierSearch.toLowerCase();
                        return (
                          s.name.toLowerCase().includes(q) ||
                          s.phone.includes(q) ||
                          (s.email && s.email.toLowerCase().includes(q)) ||
                          (s.gstin && s.gstin.toLowerCase().includes(q))
                        );
                      })
                      .map((sup) => (
                        <tr key={sup.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900 block">{sup.name}</span>
                            {sup.address && <span className="text-[10px] text-slate-400 truncate max-w-xs block">{sup.address}</span>}
                          </td>
                          <td className="py-3 px-3 text-slate-700">{sup.contactPerson || '—'}</td>
                          <td className="py-3 px-3 font-mono text-slate-700">{sup.phone}</td>
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {sup.email ? (
                              <span className="text-emerald-700 flex items-center gap-1">
                                <Mail className="w-3 h-3 text-emerald-600" /> {sup.email}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">None</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-700">{sup.gstin || '—'}</td>
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {sup._count?.purchases || 0} invoices ({sup._count?.batches || 0} batches)
                          </td>
                          <td className="py-3 px-3 text-center">
                            <Badge variant={sup.isActive ? 'success' : 'neutral'} size="sm">
                              {sup.isActive ? 'Active' : 'Archived'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {!isBillingUser && (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => openEditSupplierModal(sup)}
                                  className="p-1 text-slate-400 hover:text-blue-600 transition-colors rounded hover:bg-slate-100"
                                  title="Edit Supplier"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteTargetSupplier(sup)}
                                  className="p-1 text-slate-400 hover:text-rose-600 transition-colors rounded hover:bg-slate-100"
                                  title="Archive / Delete Supplier"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
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

      {/* Sub-Tab 3: Supplier Debit / Returns */}
      {activeSubTab === 'returns' && (
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

      {/* Record / Edit Purchase Invoice Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={isEditing ? `Edit Purchase Invoice: ${supplierInvoiceNumber || 'Draft'}` : 'Record Inward Supplier Purchase Invoice'}
        maxWidth="5xl"
      >
        <form onSubmit={handleSubmitPurchase} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            {/* Searchable Supplier Combobox with Inline Add */}
            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Supplier *</label>
                <button
                  type="button"
                  onClick={() => setShowInlineSupplierModal(true)}
                  className="text-[10px] text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-0.5"
                  title="Add new supplier inline"
                >
                  <Plus className="w-3 h-3" /> New
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Type to search supplier..."
                  value={supplierSearchQuery}
                  onChange={(e) => {
                    setSupplierSearchQuery(e.target.value);
                    setShowSupplierDropdown(true);
                  }}
                  onFocus={() => setShowSupplierDropdown(true)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-semibold"
                />
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {showSupplierDropdown && (
                <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white rounded-lg border border-slate-200 shadow-lg divide-y divide-slate-100 text-xs">
                  {filteredSuppliers.length === 0 ? (
                    <div className="p-3 text-slate-400 text-center">
                      No matching supplier.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setShowSupplierDropdown(false);
                          setShowInlineSupplierModal(true);
                        }}
                        className="text-emerald-600 font-bold underline"
                      >
                        Create '{supplierSearchQuery}'
                      </button>
                    </div>
                  ) : (
                    filteredSuppliers.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => handleSelectSupplier(s)}
                        className="p-2.5 hover:bg-emerald-50 cursor-pointer transition-colors"
                      >
                        <div className="font-bold text-slate-800">{s.name}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 font-mono">
                          <span>{s.phone}</span>
                          {s.email && <span>• {s.email}</span>}
                          {s.gstin && <span>• GST: {s.gstin}</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {selectedSupplierObj && (
                <div className="mt-1 text-[10px] text-slate-500 font-mono">
                  {selectedSupplierObj.email && <span>Email: {selectedSupplierObj.email}</span>}
                  {selectedSupplierObj.gstin && <span className="ml-2">GSTIN: {selectedSupplierObj.gstin}</span>}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Supplier Invoice # *</label>
              <input
                type="text"
                required
                placeholder="e.g. INV-90442"
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Invoice Date *</label>
              <input
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500"
              >
                <option value="CASH">Cash</option>
                <option value="CREDIT">Credit (Pay Later)</option>
                <option value="UPI">UPI / Digital</option>
                <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
          </div>

          {/* Invoice Line Items */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-800">Invoice Line Items & Batches</label>
                <p className="text-[10px] text-slate-400">
                  Pre-configured default discount ({configuredDiscount}%) & default GST ({configuredCombinedGST}%) applied. Custom items register directly to catalogue.
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
                const lineGst = Number(l.gstRate) || 0;
                const lineTax = (taxable * lineGst) / 100;
                const lineCGST = lineTax / 2;
                const lineSGST = lineTax / 2;
                const totalUnits = qty + freeQty;
                const effectiveUnitCost = totalUnits > 0 ? taxable / totalUnits : pRate;
                const expectedMarginPct = sRate > 0 ? ((sRate - effectiveUnitCost) / sRate) * 100 : 0;

                return (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        <div className="flex items-center justify-between mb-0.5">
                          <label className="text-[10px] font-bold text-slate-600">Medicine *</label>
                          <button
                            type="button"
                            onClick={() => {
                              setInlineMedicineTargetIdx(idx);
                              setShowInlineMedicineModal(true);
                            }}
                            className="text-[10px] text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-0.5"
                          >
                            <Plus className="w-2.5 h-2.5" /> New Item
                          </button>
                        </div>
                        <select
                          required
                          value={l.medicineId}
                          onChange={(e) => updateLine(idx, 'medicineId', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded font-medium"
                        >
                          <option value="">-- Choose Catalogue Medicine --</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.brandName} ({p.strength}) - MRP ₹{p.mrp} [GST {p.gstRate}%]
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
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono font-bold"
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
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded font-mono text-center font-bold"
                        />
                      </div>

                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-emerald-700 block mb-0.5">Free Scheme</label>
                        <input
                          type="number"
                          min="0"
                          value={l.freeQuantity}
                          onChange={(e) => updateLine(idx, 'freeQuantity', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs bg-white border border-emerald-300 rounded font-mono text-center text-emerald-800 font-bold"
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

                      <div className="col-span-1 flex items-center justify-end">
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="text-rose-600 hover:text-rose-800 p-1"
                            title="Remove Line"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Secondary Row: Rates, Discounts, GST, Margins */}
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
                        <label className="text-[10px] text-slate-500 block">Selling Rate (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={l.sellingRate}
                          onChange={(e) => updateLine(idx, 'sellingRate', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-emerald-300 rounded font-mono text-xs font-semibold text-emerald-900"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="text-[10px] text-slate-500 block">
                          Pur Discount ({l.discountPercent}%)
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={l.discountPercent}
                            onChange={(e) => updateLine(idx, 'discountPercent', e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded font-mono text-xs"
                          />
                          <span className="text-slate-400 font-mono">%</span>
                        </div>
                      </div>

                      <div className="col-span-2">
                        <label className="text-[10px] text-slate-500 block">
                          GST Rate ({l.gstRate}%)
                        </label>
                        <select
                          value={l.gstRate}
                          onChange={(e) => updateLine(idx, 'gstRate', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold"
                        >
                          <option value="0">0% (Nil)</option>
                          <option value="5">5% (CGST 2.5% + SGST 2.5%)</option>
                          <option value="12">12% (CGST 6% + SGST 6%)</option>
                          <option value="18">18% (CGST 9% + SGST 9%)</option>
                          <option value="28">28% (CGST 14% + SGST 14%)</option>
                        </select>
                      </div>

                      <div className="col-span-4 flex items-center justify-end gap-2 font-mono text-[10px] text-slate-600">
                        <span>Taxable: ₹{taxable.toFixed(2)}</span>
                        <span>CGST ({(lineGst / 2).toFixed(1)}%): ₹{lineCGST.toFixed(2)}</span>
                        <span>SGST ({(lineGst / 2).toFixed(1)}%): ₹{lineSGST.toFixed(2)}</span>
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          Margin: {expectedMarginPct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Structured Financial Invoice Summary Box with Percentages beside Monetary Amounts */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Invoice Financial Summary & Dual Tax Breakdown
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 block">Gross Subtotal</span>
                <span className="text-sm font-bold font-mono text-slate-800">
                  ₹{(formSubtotal + formLineDiscounts).toFixed(2)}
                </span>
              </div>

              <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 block">
                  Total Discounts ({formSubtotal > 0 ? ((formLineDiscounts / (formSubtotal + formLineDiscounts)) * 100).toFixed(1) : 0}%)
                </span>
                <span className="text-sm font-bold font-mono text-rose-600">
                  -₹{(formLineDiscounts + invDiscAmt).toFixed(2)}
                </span>
              </div>

              <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 block">Taxable Base</span>
                <span className="text-sm font-bold font-mono text-slate-900">
                  ₹{formSubtotal.toFixed(2)}
                </span>
              </div>

              <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200">
                <span className="text-[10px] text-emerald-800 block">Final Payable Amount</span>
                <span className="text-base font-black font-mono text-emerald-800">
                  ₹{formGrandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs pt-1 border-t border-slate-200/80">
              <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-200 font-mono">
                <span className="text-slate-600 text-[11px]">CGST ({configuredCGST}%):</span>
                <span className="font-bold text-slate-800">₹{formCGSTTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-200 font-mono">
                <span className="text-slate-600 text-[11px]">SGST ({configuredSGST}%):</span>
                <span className="font-bold text-slate-800">₹{formSGSTTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-200 font-mono">
                <span className="text-slate-700 text-[11px] font-bold">Total GST ({configuredCombinedGST}%):</span>
                <span className="font-black text-emerald-700">₹{formTaxTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Additional Charges (₹)</label>
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
                <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Paid Amount (₹)</label>
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

              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Notes / Logistics</label>
                <input
                  type="text"
                  placeholder="e.g. VRL Logistics, cold chain verified"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              {isEditing ? 'Save Changes & Reconcile Stock' : 'Confirm Purchase & Receive Stock'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Inline Quick Add Supplier Modal */}
      <Modal isOpen={showInlineSupplierModal} onClose={() => setShowInlineSupplierModal(false)} title="Quick Add New Supplier" maxWidth="md">
        <form onSubmit={handleSaveInlineSupplier} className="space-y-3 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Supplier / Agency Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. MedSource Healthcare"
              value={inlineSupplierForm.name}
              onChange={(e) => setInlineSupplierForm({ ...inlineSupplierForm, name: e.target.value })}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Phone Number *</label>
              <input
                type="text"
                required
                placeholder="10-digit mobile"
                value={inlineSupplierForm.phone}
                onChange={(e) => setInlineSupplierForm({ ...inlineSupplierForm, phone: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Email ID</label>
              <input
                type="email"
                placeholder="orders@supplier.com"
                value={inlineSupplierForm.email}
                onChange={(e) => setInlineSupplierForm({ ...inlineSupplierForm, email: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-slate-700 block mb-1">GSTIN</label>
              <input
                type="text"
                placeholder="15-digit GSTIN"
                value={inlineSupplierForm.gstin}
                onChange={(e) => setInlineSupplierForm({ ...inlineSupplierForm, gstin: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Contact Person</label>
              <input
                type="text"
                placeholder="e.g. Sales Manager"
                value={inlineSupplierForm.contactPerson}
                onChange={(e) => setInlineSupplierForm({ ...inlineSupplierForm, contactPerson: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowInlineSupplierModal(false)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg font-bold transition-colors"
            >
              Create & Select Supplier
            </button>
          </div>
        </form>
      </Modal>

      {/* Inline Quick Add Medicine Modal */}
      <Modal isOpen={showInlineMedicineModal} onClose={() => setShowInlineMedicineModal(false)} title="Quick Register Medicine to Catalogue" maxWidth="md">
        <form onSubmit={handleSaveInlineMedicine} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Brand Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Dolo 650"
                value={inlineMedicineForm.brandName}
                onChange={(e) => setInlineMedicineForm({ ...inlineMedicineForm, brandName: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Generic Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Paracetamol"
                value={inlineMedicineForm.genericName}
                onChange={(e) => setInlineMedicineForm({ ...inlineMedicineForm, genericName: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Strength *</label>
              <input
                type="text"
                required
                value={inlineMedicineForm.strength}
                onChange={(e) => setInlineMedicineForm({ ...inlineMedicineForm, strength: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Dosage Form *</label>
              <select
                value={inlineMedicineForm.dosageForm}
                onChange={(e) => setInlineMedicineForm({ ...inlineMedicineForm, dosageForm: e.target.value })}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
              >
                <option value="Tablet">Tablet</option>
                <option value="Capsule">Capsule</option>
                <option value="Syrup">Syrup</option>
                <option value="Injection">Injection</option>
                <option value="Ointment">Ointment</option>
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">GST Rate (%) *</label>
              <select
                value={inlineMedicineForm.gstRate}
                onChange={(e) => setInlineMedicineForm({ ...inlineMedicineForm, gstRate: e.target.value })}
                className="w-full px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
              >
                <option value="5.0">5%</option>
                <option value="12.0">12%</option>
                <option value="18.0">18%</option>
                <option value="28.0">28%</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-bold text-slate-700 block mb-1">MRP (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={inlineMedicineForm.mrp}
                onChange={(e) => setInlineMedicineForm({ ...inlineMedicineForm, mrp: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Manufacturer</label>
              <input
                type="text"
                placeholder="e.g. Micro Labs Ltd"
                value={inlineMedicineForm.manufacturer}
                onChange={(e) => setInlineMedicineForm({ ...inlineMedicineForm, manufacturer: e.target.value })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowInlineMedicineModal(false)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg font-bold transition-colors"
            >
              Save & Link Medicine
            </button>
          </div>
        </form>
      </Modal>

      {/* Supplier Management Modal (Suppliers Tab) */}
      <Modal
        isOpen={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        title={isEditingSupplier ? `Edit Supplier: ${supplierForm.name}` : 'Register New Supplier'}
        maxWidth="lg"
      >
        <form onSubmit={handleSaveSupplier} className="space-y-3.5 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Supplier / Agency Legal Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. MedSource Healthcare Private Limited"
              value={supplierForm.name}
              onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Phone Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. 9848011223"
                value={supplierForm.phone}
                onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Supplier Email Address</label>
              <input
                type="email"
                placeholder="orders@supplier.in"
                value={supplierForm.email}
                onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">GSTIN Number</label>
              <input
                type="text"
                placeholder="e.g. 37AAAAA0000A1Z5"
                value={supplierForm.gstin}
                onChange={(e) => setSupplierForm({ ...supplierForm, gstin: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono uppercase"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Drug License Number</label>
              <input
                type="text"
                placeholder="e.g. 20B/21B-AP-10224"
                value={supplierForm.dlNumber}
                onChange={(e) => setSupplierForm({ ...supplierForm, dlNumber: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Contact Person</label>
              <input
                type="text"
                placeholder="e.g. Anand Sharma (Regional Head)"
                value={supplierForm.contactPerson}
                onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Status</label>
              <select
                value={supplierForm.isActive ? 'true' : 'false'}
                onChange={(e) => setSupplierForm({ ...supplierForm, isActive: e.target.value === 'true' })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-semibold"
              >
                <option value="true">Active Supplier</option>
                <option value="false">Archived / Deactivated</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Warehouse / Billing Address</label>
            <input
              type="text"
              placeholder="e.g. Plot 14, Auto Nagar, Vijayawada"
              value={supplierForm.address}
              onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowSupplierModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg font-bold shadow-xs transition-colors"
            >
              {isEditingSupplier ? 'Update Supplier' : 'Register Supplier'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Modal: Cancel Purchase Invoice */}
      {cancelTargetInvoice && (
        <Modal
          isOpen={!!cancelTargetInvoice}
          onClose={() => setCancelTargetInvoice(null)}
          title={`Cancel Purchase Invoice: ${cancelTargetInvoice.invoiceNumber}`}
          maxWidth="md"
        >
          <form onSubmit={handleConfirmCancelInvoice} className="space-y-4 text-xs">
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-700" />
                Auditable Stock Reversal Notice
              </div>
              <p className="text-[11px] leading-relaxed">
                Cancelling this invoice will atomically deduct all inward units received across {cancelTargetInvoice.lines?.length || 0} batches from branch inventory. If units have already been sold, cancellation will be safely blocked.
              </p>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Cancellation Reason *</label>
              <input
                type="text"
                required
                placeholder="e.g. Supplier shipment returned, invoice billed in error"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-rose-500 font-medium"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCancelTargetInvoice(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 font-semibold"
              >
                Keep Invoice
              </button>
              <button
                type="submit"
                disabled={isCancellingInvoice}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shadow-xs"
              >
                {isCancellingInvoice ? 'Reversing Stock...' : 'Confirm Cancellation'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmation Modal: Delete / Archive Supplier */}
      {deleteTargetSupplier && (
        <Modal
          isOpen={!!deleteTargetSupplier}
          onClose={() => setDeleteTargetSupplier(null)}
          title={`Delete / Archive Supplier: ${deleteTargetSupplier.name}`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-600 leading-relaxed">
              Are you sure you want to remove <strong>{deleteTargetSupplier.name}</strong>? If this supplier has existing purchase invoices or stock batches, they will be archived (deactivated) to preserve historical accounting and inventory integrity.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeleteTargetSupplier(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSupplier}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shadow-xs"
              >
                Confirm Delete / Archive
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* View Purchase Invoice Details Modal with Dual Percentage & Amount Breakdown */}
      {viewInvoice && (
        <Modal
          isOpen={!!viewInvoice}
          onClose={() => setViewInvoice(null)}
          title={`Purchase Invoice Details: ${viewInvoice.invoiceNumber}`}
          maxWidth="4xl"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Supplier Details</span>
                <span className="font-bold text-slate-900 text-sm block">{viewInvoice.supplier?.name}</span>
                {viewInvoice.supplier?.email && (
                  <span className="text-emerald-700 block font-mono text-[11px] flex items-center gap-1">
                    <Mail className="w-3 h-3 text-emerald-600" /> {viewInvoice.supplier.email}
                  </span>
                )}
                <span className="text-slate-500 block font-mono text-[11px]">
                  Phone: {viewInvoice.supplier?.phone} | GSTIN: {viewInvoice.supplier?.gstin || 'None'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Supplier Reference</span>
                <span className="font-bold font-mono text-slate-800 text-sm block">{viewInvoice.supplierInvoiceNumber}</span>
                <span className="text-slate-500 block font-mono text-[11px]">
                  Branch: {viewInvoice.branch?.name} ({viewInvoice.branch?.code})
                </span>
                <span className="text-slate-500 block font-mono text-[11px]">
                  Status: <strong className={viewInvoice.status === 'CANCELLED' ? 'text-rose-600' : 'text-emerald-600'}>{viewInvoice.status}</strong>
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px] font-bold uppercase">Transaction Date</span>
                <span className="font-semibold text-slate-800 text-sm block">
                  {new Date(viewInvoice.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <span className="text-slate-500 block text-[11px]">Payment Mode: <strong>{viewInvoice.paymentMode}</strong></span>
              </div>
            </div>

            {/* Line items table with explicit percentage rates */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Medicine Description</th>
                    <th className="py-2.5 px-2">Batch #</th>
                    <th className="py-2.5 px-2 text-right">Qty (+Free)</th>
                    <th className="py-2.5 px-2 text-right">Pur Rate</th>
                    <th className="py-2.5 px-2 text-right">Sell Rate</th>
                    <th className="py-2.5 px-2 text-right">MRP</th>
                    <th className="py-2.5 px-2 text-right">Disc % & Amt</th>
                    <th className="py-2.5 px-2 text-right">GST % & Tax</th>
                    <th className="py-2.5 px-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {viewInvoice.lines.map((l: any, i: number) => {
                    const gross = l.quantity * l.purchaseRate;
                    const disc = l.discountAmount || (gross * (l.discountPercent || 0)) / 100;
                    const taxable = Math.max(0, gross - disc);
                    const lineGst = l.gstRate || 0;
                    const cgst = (taxable * (lineGst / 2)) / 100;
                    const sgst = (taxable * (lineGst / 2)) / 100;

                    return (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                          {l.medicine?.brandName || 'Medicine'}
                          <span className="block text-[10px] text-slate-400 font-normal font-sans">
                            {l.medicine?.genericName} • {l.medicine?.strength}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-slate-700 font-bold">{l.batchNumber}</td>
                        <td className="py-2.5 px-2 text-right">
                          {l.quantity} {l.freeQuantity > 0 && <span className="text-emerald-700 font-bold">(+{l.freeQuantity})</span>}
                        </td>
                        <td className="py-2.5 px-2 text-right text-blue-900 font-bold">₹{l.purchaseRate.toFixed(2)}</td>
                        <td className="py-2.5 px-2 text-right text-emerald-900 font-semibold">
                          ₹{(l.sellingRate || l.mrp).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2 text-right text-slate-500">₹{l.mrp.toFixed(2)}</td>
                        <td className="py-2.5 px-2 text-right text-rose-600">
                          <span>{l.discountPercent}%</span>
                          <span className="block text-[10px] text-slate-500">(-₹{disc.toFixed(2)})</span>
                        </td>
                        <td className="py-2.5 px-2 text-right text-slate-700">
                          <span className="font-bold">{lineGst}%</span>
                          <span className="block text-[10px] text-slate-500">
                            (C: ₹{cgst.toFixed(2)} | S: ₹{sgst.toFixed(2)})
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">₹{l.lineTotal.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Financial Summary with Percentages beside Monetary Amounts */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
              <div>
                <span className="text-[10px] text-slate-500 block font-sans">Gross Subtotal</span>
                <span className="font-bold text-slate-800">
                  ₹{(viewInvoice.subtotal + (viewInvoice.discountTotal || 0)).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block font-sans">
                  Total Discount (
                  {viewInvoice.subtotal > 0
                    ? (((viewInvoice.discountTotal || 0) / (viewInvoice.subtotal + (viewInvoice.discountTotal || 0))) * 100).toFixed(1)
                    : 0}
                  %)
                </span>
                <span className="font-bold text-rose-600">-₹{(viewInvoice.discountTotal || 0).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block font-sans">Total GST ({configuredCombinedGST}%)</span>
                <span className="font-bold text-slate-800">₹{viewInvoice.taxTotal.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-emerald-800 block font-sans">Grand Total</span>
                <span className="text-base font-black text-emerald-800">₹{viewInvoice.grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

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
                {suppliers.filter((s) => s.isActive).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
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
    </div>
  );
};
