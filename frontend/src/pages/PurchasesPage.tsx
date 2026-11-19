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
  Filter,
  X,
  FileSpreadsheet,
  Download,
  UploadCloud,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { FilterButton } from '../components/FilterButton';
import { FilterField, FilterSelect, FilterInput } from '../components/FilterControls';

interface PurchaseLineForm {
  medicineId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  freeQuantity: number;
  unit?: string;
  conversionFactor?: number;
  purchaseRate: number;
  sellingRate: number;
  mrp: number;
  discountPercent: number;
  discountAmount: number;
  gstRate: number;
  discountMode?: 'preset' | 'custom';
  customDiscount?: string;
  newMedicine?: any;
  isNewProduct?: boolean;
  brandName?: string;
  productName?: string;
  genericName?: string;
  strength?: string;
  dosageForm?: string;
  manufacturer?: string;
  hsnCode?: string;

  // Standard 13-Column Strip & Unit Fields
  stripQuantityInBox?: number;
  stripUnitQuantity?: number;
  totalUnits?: number;
  pharmacyPhysicalUnits?: number;
  stripPurchasePrice?: number;
  stripMrpPrice?: number;
  purchaseUnitPrice?: number;
  unitSellingPrice?: number;
}

interface PurchasesPageProps {
  prefilledIndent?: any;
  onClearPrefill?: () => void;
}

export const PurchasesPage: React.FC<PurchasesPageProps> = ({ prefilledIndent, onClearPrefill }) => {
  const { currentBranch, selectedBranchId, branches, isBillingUser, isSuperAdmin, isBranchAdmin } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'invoices' | 'suppliers' | 'returns'>('invoices');
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<MedicineProduct[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Search & Filter: Sub-tab 1 Invoices
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invStatusFilter, setInvStatusFilter] = useState('');
  const [invPaymentFilter, setInvPaymentFilter] = useState('');
  const [invSupplierFilter, setInvSupplierFilter] = useState('');
  const [invStartDate, setInvStartDate] = useState('');
  const [invEndDate, setInvEndDate] = useState('');
  const [invMinAmount, setInvMinAmount] = useState('');
  const [invMaxAmount, setInvMaxAmount] = useState('');

  const activeInvoiceFilterCount = [
    invStatusFilter,
    invPaymentFilter,
    invSupplierFilter,
    invStartDate,
    invEndDate,
    invMinAmount,
    invMaxAmount,
  ].filter(Boolean).length;

  const resetInvoiceFilters = () => {
    setInvStatusFilter('');
    setInvPaymentFilter('');
    setInvSupplierFilter('');
    setInvStartDate('');
    setInvEndDate('');
    setInvMinAmount('');
    setInvMaxAmount('');
  };

  // Search & Filter: Sub-tab 2 Suppliers
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supStatusFilter, setSupStatusFilter] = useState('');
  const [supComplianceFilter, setSupComplianceFilter] = useState('');

  const activeSupplierFilterCount = [
    supStatusFilter,
    supComplianceFilter,
  ].filter(Boolean).length;

  const resetSupplierFilters = () => {
    setSupStatusFilter('');
    setSupComplianceFilter('');
  };

  // Search & Filter: Sub-tab 3 Returns
  const [returnSearch, setReturnSearch] = useState('');
  const [returnSupplierFilter, setReturnSupplierFilter] = useState('');
  const [returnStatusFilter, setReturnStatusFilter] = useState('');

  const activeReturnFilterCount = [
    returnSupplierFilter,
    returnStatusFilter,
  ].filter(Boolean).length;

  const resetReturnFilters = () => {
    setReturnSupplierFilter('');
    setReturnStatusFilter('');
  };

  // Modal: New/Edit Purchase Invoice
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [draftBranchId, setDraftBranchId] = useState<string>(selectedBranchId || '');

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
      brandName: '',
      batchNumber: '',
      expiryDate: '',
      hsnCode: '30049099',
      manufacturer: '',
      stripQuantityInBox: 10,
      stripUnitQuantity: 10,
      totalUnits: 100,
      pharmacyPhysicalUnits: 100,
      stripPurchasePrice: 10,
      stripMrpPrice: 20,
      purchaseUnitPrice: 1,
      unitSellingPrice: 2,
      quantity: 10,
      freeQuantity: 0,
      purchaseRate: 10,
      sellingRate: 20,
      mrp: 20,
      discountPercent: 0,
      discountAmount: 0,
      gstRate: 5.0,
      unit: 'Strip',
      conversionFactor: 10,
    },
  ]);

  // Modal: Inline Add New Supplier
  const [showInlineSupplierModal, setShowInlineSupplierModal] = useState(false);
  const [isSavingInlineSupplier, setIsSavingInlineSupplier] = useState(false);
  const [inlineSupplierError, setInlineSupplierError] = useState<string | null>(null);
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
  const [inlineMedicineError, setInlineMedicineError] = useState<string | null>(null);
  const [isSavingInlineMedicine, setIsSavingInlineMedicine] = useState(false);
  const [inlineMedicineForm, setInlineMedicineForm] = useState({
    brandName: '',
    batchNumber: '',
    expiryDate: '',
    hsnCode: '30049099',
    manufacturer: '',
    stripQuantityInBox: '10',
    stripUnitQuantity: '10',
    totalUnits: '100',
    pharmacyPhysicalUnits: '100',
    stripPurchasePrice: '10',
    stripMrpPrice: '20',
    purchaseUnitPrice: '1.00',
    unitSellingPrice: '2.00',
    gstRate: '5.0',
    genericName: '',
    strength: '500mg',
    dosageForm: 'Tablet',
  });

  const handleInlineMedicineChange = (field: string, value: string) => {
    setInlineMedicineForm((prev) => {
      const next = { ...prev, [field]: value };

      const stripQty = parseFloat(field === 'stripQuantityInBox' ? value : next.stripQuantityInBox) || 0;
      const stripUnitQty = parseFloat(field === 'stripUnitQuantity' ? value : next.stripUnitQuantity) || 0;
      const stripPur = parseFloat(field === 'stripPurchasePrice' ? value : next.stripPurchasePrice) || 0;
      const stripMrp = parseFloat(field === 'stripMrpPrice' ? value : next.stripMrpPrice) || 0;

      if (field === 'stripQuantityInBox' || field === 'stripUnitQuantity') {
        const computedTotal = stripQty * stripUnitQty;
        next.totalUnits = computedTotal > 0 ? String(computedTotal) : '';
        if (!prev.pharmacyPhysicalUnits || prev.pharmacyPhysicalUnits === prev.totalUnits) {
          next.pharmacyPhysicalUnits = next.totalUnits;
        }
      }

      if (field === 'stripPurchasePrice' || field === 'stripUnitQuantity') {
        if (stripUnitQty > 0 && stripPur >= 0) {
          next.purchaseUnitPrice = Number((stripPur / stripUnitQty).toFixed(2)).toString();
        }
      }

      if (field === 'stripMrpPrice' || field === 'stripUnitQuantity') {
        if (stripUnitQty > 0 && stripMrp >= 0) {
          next.unitSellingPrice = Number((stripMrp / stripUnitQty).toFixed(2)).toString();
        }
      }

      return next;
    });
  };

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

  // Inward Purchase Mode: Manual vs Excel/CSV Import
  const [entryMode, setEntryMode] = useState<'manual' | 'import'>('manual');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreviewData, setImportPreviewData] = useState<any | null>(null);
  const [isAnalyzingImport, setIsAnalyzingImport] = useState(false);
  const [isSubmittingImportPurchase, setIsSubmittingImportPurchase] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);

  // Super Admin Bulk Deletions
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [showBulkDeleteInvoicesModal, setShowBulkDeleteInvoicesModal] = useState(false);
  const [isBulkDeletingInvoices, setIsBulkDeletingInvoices] = useState(false);

  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [showBulkDeleteSuppliersModal, setShowBulkDeleteSuppliersModal] = useState(false);
  const [isBulkDeletingSuppliers, setIsBulkDeletingSuppliers] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [purRes, supRes, prodRes, retRes, batchRes, settingsRes] = await Promise.all([
        api.getPurchases({ branchId: selectedBranchId }),
        api.getSuppliers({ includeInactive: true }),
        api.getProducts({ limit: 200, branchId: selectedBranchId || undefined }),
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
      // Purchases load error handled in UI
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedBranchId]);

  // Keep draft branch synchronized with global selection when not editing
  useEffect(() => {
    if (!isEditing) {
      if (selectedBranchId) {
        setDraftBranchId(selectedBranchId);
      } else if (branches.length > 0 && !draftBranchId) {
        setDraftBranchId(branches[0].id);
      }
    }
  }, [selectedBranchId, branches, isEditing]);

  // Handle Indent Requisition Conversion Prefill
  useEffect(() => {
    if (prefilledIndent) {
      setShowModal(true);
      setIsEditing(false);
      setEditingInvoiceId(null);
      setEntryMode('manual');
      if (prefilledIndent.branchId) {
        setDraftBranchId(prefilledIndent.branchId);
      } else if (selectedBranchId) {
        setDraftBranchId(selectedBranchId);
      }
      if (prefilledIndent.supplierId) {
        setSupplierId(prefilledIndent.supplierId);
        const sup = suppliers.find((s) => s.id === prefilledIndent.supplierId);
        if (sup) setSupplierSearchQuery(sup.name);
      }
      if (prefilledIndent.indentNumber) {
        setSupplierInvoiceNumber(`INV-${prefilledIndent.indentNumber}`);
        setNotes(`Converted from Indent Requisition ${prefilledIndent.indentNumber}`);
      }
      if (prefilledIndent.items && prefilledIndent.items.length > 0) {
        setLines(
          prefilledIndent.items.map((it: any) => ({
            medicineId: it.medicineId,
            batchNumber: '',
            expiryDate: '',
            quantity: it.requestedQuantity || 10,
            freeQuantity: 0,
            unit: it.unit || 'Box',
            conversionFactor: it.conversionFactor || 10,
            purchaseRate: it.estimatedRate || 20,
            sellingRate: (it.estimatedRate || 20) * 1.3,
            mrp: (it.estimatedRate || 20) * 1.5,
            discountPercent: 0,
            discountAmount: 0,
            gstRate: 5.0,
          }))
        );
      }
      if (onClearPrefill) onClearPrefill();
    }
  }, [prefilledIndent, suppliers]);

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
    setEntryMode('manual');
    setImportFile(null);
    setImportPreviewData(null);
    setImportError(null);
    setSupplierId('');
    setSupplierSearchQuery('');
    setSupplierInvoiceNumber('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setPaymentMode('CASH');
    setPaidAmount('');
    setInvoiceDiscountPercent('0');
    setInvoiceDiscountAmount('0');
    setAdditionalCharges('0');
    setDraftBranchId(selectedBranchId || (branches.length > 0 ? branches[0].id : ''));
    setNotes('');
    setLines([
      {
        medicineId: '',
        batchNumber: '',
        expiryDate: '',
        quantity: 50,
        freeQuantity: 0,
        unit: 'Unit',
        conversionFactor: 1,
        purchaseRate: 20,
        sellingRate: 30,
        mrp: 30,
        discountPercent: 0,
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
    setDraftBranchId(pur.branchId || selectedBranchId);
    setEntryMode('manual');
    setImportFile(null);
    setImportPreviewData(null);
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
        unit: l.unit || 'Box',
        conversionFactor: l.conversionFactor || 10,
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
        brandName: '',
        batchNumber: '',
        expiryDate: '',
        hsnCode: '30049099',
        manufacturer: '',
        stripQuantityInBox: 10,
        stripUnitQuantity: 10,
        totalUnits: 100,
        pharmacyPhysicalUnits: 100,
        stripPurchasePrice: 10,
        stripMrpPrice: 20,
        purchaseUnitPrice: 1,
        unitSellingPrice: 2,
        quantity: 10,
        freeQuantity: 0,
        unit: 'Strip',
        conversionFactor: 10,
        purchaseRate: 10,
        sellingRate: 20,
        mrp: 20,
        discountPercent: 0,
        discountAmount: 0,
        gstRate: configuredCombinedGST, // Respects configured default GST (5%)
      },
    ]);
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: string, val: any) => {
    const updated = [...lines];
    const item = { ...updated[idx], [field]: val };

    if (field === 'medicineId') {
      const prod = products.find((p) => p.id === val);
      if (prod) {
        let parsedConfig: any = null;
        if (prod.unitConfig) {
          try {
            parsedConfig = typeof prod.unitConfig === 'string' ? JSON.parse(prod.unitConfig) : prod.unitConfig;
          } catch (e) {}
        }
        item.brandName = prod.brandName;
        item.manufacturer = prod.manufacturer;
        item.hsnCode = prod.hsnCode || '30049099';
        item.gstRate = prod.gstRate !== undefined ? prod.gstRate : configuredCombinedGST;
        item.stripQuantityInBox = parsedConfig?.stripQuantityInBox || prod.stripQuantityInBox || item.stripQuantityInBox || 10;
        item.stripUnitQuantity = parsedConfig?.stripUnitQuantity || prod.stripUnitQuantity || prod.conversionFactor || 10;
        item.stripPurchasePrice = parsedConfig?.stripPurchasePrice || prod.stripPurchasePrice || prod.defaultPurchaseRate || 10;
        item.stripMrpPrice = parsedConfig?.stripMrpPrice || prod.stripMrpPrice || prod.mrp || 20;
        item.totalUnits = (item.stripQuantityInBox || 10) * (item.stripUnitQuantity || 10);
        item.pharmacyPhysicalUnits = item.totalUnits;
        item.purchaseUnitPrice = Number(((item.stripPurchasePrice || 10) / (item.stripUnitQuantity || 10)).toFixed(2));
        item.unitSellingPrice = Number(((item.stripMrpPrice || 20) / (item.stripUnitQuantity || 10)).toFixed(2));
        item.quantity = item.stripQuantityInBox || 10;
        item.conversionFactor = item.stripUnitQuantity || 10;
        item.purchaseRate = item.stripPurchasePrice || 10;
        item.mrp = item.stripMrpPrice || 20;
        item.sellingRate = item.stripMrpPrice || 20;
        item.unit = 'Strip';
      }
    } else if (field === 'stripQuantityInBox' || field === 'stripUnitQuantity') {
      const sq = parseFloat(field === 'stripQuantityInBox' ? val : (item.stripQuantityInBox as any)) || 0;
      const su = parseFloat(field === 'stripUnitQuantity' ? val : (item.stripUnitQuantity as any)) || 0;
      const computedTotal = sq * su;
      item.totalUnits = computedTotal;
      if (!item.pharmacyPhysicalUnits || item.pharmacyPhysicalUnits === (updated[idx].totalUnits || 0)) {
        item.pharmacyPhysicalUnits = computedTotal;
      }
      item.quantity = sq;
      item.conversionFactor = su > 0 ? su : 10;

      const sp = parseFloat(item.stripPurchasePrice as any) || 0;
      const sm = parseFloat(item.stripMrpPrice as any) || 0;
      if (su > 0) {
        item.purchaseUnitPrice = Number((sp / su).toFixed(2));
        item.unitSellingPrice = Number((sm / su).toFixed(2));
      }
    } else if (field === 'stripPurchasePrice') {
      const sp = parseFloat(val) || 0;
      const su = parseFloat(item.stripUnitQuantity as any) || 0;
      item.purchaseRate = sp;
      if (su > 0) {
        item.purchaseUnitPrice = Number((sp / su).toFixed(2));
      }
    } else if (field === 'stripMrpPrice') {
      const sm = parseFloat(val) || 0;
      const su = parseFloat(item.stripUnitQuantity as any) || 0;
      item.mrp = sm;
      item.sellingRate = sm;
      if (su > 0) {
        item.unitSellingPrice = Number((sm / su).toFixed(2));
      }
    } else if (field === 'pharmacyPhysicalUnits') {
      item.pharmacyPhysicalUnits = parseInt(val) || 0;
    } else if (field === 'mrp') {
      const numMrp = parseFloat(val);
      if (!isNaN(numMrp)) {
        const currentSelling = parseFloat(item.sellingRate as any);
        if (isNaN(currentSelling) || currentSelling > numMrp || currentSelling === 0) {
          item.sellingRate = numMrp;
        }
      }
    } else if (field === 'sellingRate') {
      const numSelling = parseFloat(val);
      const numMrp = parseFloat(item.mrp as any);
      if (!isNaN(numSelling) && !isNaN(numMrp) && numSelling > numMrp) {
        item.sellingRate = numMrp;
      }
    }

    updated[idx] = item;
    setLines(updated);
  };

  // Import Excel / CSV Handlers
  const handleDownloadTemplate = async (format: 'xlsx' | 'csv') => {
    try {
      const blob = await api.downloadPurchaseTemplate(format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `confidos_purchase_template.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Failed to download purchase template.');
    }
  };

  const handleAnalyzeImport = async (overrideBranchId?: string) => {
    if (!importFile) {
      setImportError('Please select an Excel (.xlsx) or CSV file first.');
      return;
    }
    const effectiveBranchId = overrideBranchId || draftBranchId || selectedBranchId || currentBranch?.id;
    if (!effectiveBranchId) {
      setImportError('Target branch is required for purchase import. Please select a branch.');
      return;
    }

    setImportError(null);
    setIsAnalyzingImport(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('branchId', effectiveBranchId);
      if (supplierId) formData.append('supplierId', supplierId);
      if (supplierInvoiceNumber) formData.append('supplierInvoiceNumber', supplierInvoiceNumber);

      const res = await api.previewPurchaseImport(formData);
      setImportPreviewData(res);
    } catch (err: any) {
      setImportError(err.message || 'Failed to parse and validate file.');
    } finally {
      setIsAnalyzingImport(false);
    }
  };

  const handleBranchChange = (newBranchId: string) => {
    setDraftBranchId(newBranchId);
    if (importFile && entryMode === 'import') {
      handleAnalyzeImport(newBranchId);
    }
  };

  const handleRemovePreviewItem = (index: number) => {
    if (!importPreviewData || !importPreviewData.items) return;
    const nextItems = importPreviewData.items.filter((_: any, i: number) => i !== index);
    const validRows = nextItems.filter((it: any) => it.valid).length;
    const errorRows = nextItems.length - validRows;
    const estimatedGrandTotal = nextItems
      .filter((it: any) => it.valid)
      .reduce((sum: number, it: any) => sum + (Number(it.lineTotal) || 0), 0);

    setImportPreviewData({
      ...importPreviewData,
      items: nextItems,
      metrics: {
        ...importPreviewData.metrics,
        totalRows: nextItems.length,
        validRows,
        errorRows,
        estimatedGrandTotal,
      },
    });
  };

  const handleUseValidatedItemsInLines = () => {
    if (!importPreviewData || !importPreviewData.items) return;
    const validItems = importPreviewData.items.filter((it: any) => it.valid);
    if (validItems.length === 0) {
      alert('No valid items found in the import preview.');
      return;
    }
    if (importPreviewData.targetBranchId) {
      setDraftBranchId(importPreviewData.targetBranchId);
    }
    const newLines: PurchaseLineForm[] = validItems.map((it: any) => ({
      medicineId: it.medicineId || '',
      batchNumber: it.batchNumber || '',
      expiryDate: it.expiryDate || '',
      quantity: Number(it.stripQuantityInBox || it.quantity) || 1,
      freeQuantity: Number(it.freeQuantity) || 0,
      unit: 'Strip',
      conversionFactor: Number(it.stripUnitQuantity || it.conversionFactor || 10),
      purchaseRate: Number(it.stripPurchasePrice || it.purchaseRate) || 0,
      sellingRate: Number(it.stripMrpPrice || it.sellingRate || it.mrp) || 0,
      mrp: Number(it.stripMrpPrice || it.mrp) || 0,
      discountPercent: Number(it.discountPercent) || 0,
      discountAmount: Number(it.discountAmount) || 0,
      gstRate: Number(it.gstRate) || 5.0,
      newMedicine: it.newMedicine,
      isNewProduct: it.isNewProduct || it.medicineId === 'NEW',
      brandName: it.medicineName || it.brandName || it.productName,
      productName: it.productName,
      genericName: it.genericName,
      strength: it.strength,
      dosageForm: it.dosageForm,
      manufacturer: it.manufacturer,
      hsnCode: it.hsnCode,
    }));
    setLines(newLines);
    setEntryMode('manual');
    setMessage({
      text: `Transferred ${validItems.length} validated items to invoice lines. Review rates and confirm.`,
      type: 'success',
    });
  };

  const handleConfirmImportPurchase = async () => {
    if (!importPreviewData || !importPreviewData.items) return;
    if (isSubmittingImportPurchase) return; // Prevent double click submission
    if (!supplierId) {
      setImportError('Please select or create a supplier before confirming purchase.');
      return;
    }
    if (!supplierInvoiceNumber.trim()) {
      setImportError('Please enter the Supplier Invoice Number.');
      return;
    }

    const validItems = importPreviewData.items.filter((it: any) => it.valid);
    if (validItems.length === 0) {
      setImportError('No valid items to commit. Please fix file errors or use manual entry.');
      return;
    }

    const effectiveBranchId = importPreviewData.targetBranchId || draftBranchId || selectedBranchId || currentBranch?.id;
    if (!effectiveBranchId) {
      setImportError('Target branch is required to post purchase invoice.');
      return;
    }

    setIsSubmittingImportPurchase(true);
    setImportError(null);
    try {
      const payload = {
        branchId: effectiveBranchId,
        supplierId,
        supplierInvoiceNumber: supplierInvoiceNumber.trim(),
        invoiceDate,
        paymentMode,
        paidAmount: paidAmount !== '' ? parseFloat(paidAmount) : (paymentMode === 'CREDIT' ? 0 : importPreviewData.metrics.estimatedGrandTotal),
        notes: notes || 'Imported via Excel/CSV inward integration',
        idempotencyKey: `import-${effectiveBranchId}-${supplierInvoiceNumber.trim()}-${Date.now()}`,
        lines: validItems.map((it: any) => ({
          medicineId: it.medicineId,
          isNewProduct: it.isNewProduct || it.medicineId === 'NEW',
          newMedicine: it.newMedicine || (it.isNewProduct || it.medicineId === 'NEW' ? {
            brandName: it.brandName || it.productName,
            genericName: it.genericName || 'Generic Formulation',
            strength: it.strength || 'Standard',
            dosageForm: it.dosageForm || 'Tablet',
            manufacturer: it.manufacturer || 'Standard Pharma',
            hsnCode: it.hsnCode || '30049099',
            gstRate: Number(it.gstRate) || 5.0,
            mrp: Number(it.mrp) || 0,
            defaultPurchaseRate: Number(it.purchaseRate) || 0,
            defaultSellingRate: Number(it.sellingRate) || Number(it.mrp) || 0,
            baseUnit: it.sellingUnit || it.baseUnit || 'Tablet',
            packageUnit: it.purchaseUnit || it.packageUnit || it.unit || 'Tablet',
            conversionFactor: Number(it.conversionFactor) || 1,
          } : undefined),
          productName: it.productName,
          brandName: it.brandName,
          genericName: it.genericName,
          strength: it.strength,
          dosageForm: it.dosageForm,
          manufacturer: it.manufacturer,
          hsnCode: it.hsnCode,
          batchNumber: it.batchNumber,
          expiryDate: it.expiryDate,
          quantity: Number(it.quantity),
          freeQuantity: Number(it.freeQuantity) || 0,
          unit: it.unit || it.purchaseUnit || 'Unit',
          conversionFactor: Number(it.conversionFactor) || 1,
          purchaseRate: Number(it.purchaseRate),
          sellingRate: Number(it.sellingRate) || Number(it.mrp),
          mrp: Number(it.mrp),
          discountPercent: Number(it.discountPercent) || 0,
          discountAmount: Number(it.discountAmount) || 0,
          gstRate: Number(it.gstRate) || 5.0,
        })),
      };

      await api.createPurchase(payload);
      setMessage({
        text: `Purchase Invoice recorded with ${validItems.length} items. Batches and stock movements created!`,
        type: 'success',
      });
      setShowModal(false);
      setImportPreviewData(null);
      setImportFile(null);
      loadData();
    } catch (err: any) {
      setImportError(err.message || 'Failed to confirm purchase import.');
    } finally {
      setIsSubmittingImportPurchase(false);
    }
  };

  // Bulk Deletion Handlers for Super Admin
  const toggleSelectInvoice = (id: string) => {
    setSelectedInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllInvoices = (displayedInvoices: PurchaseInvoice[]) => {
    const displayedIds = displayedInvoices.map((p) => p.id);
    const allSelected = displayedIds.length > 0 && displayedIds.every((id) => selectedInvoiceIds.includes(id));
    if (allSelected) {
      setSelectedInvoiceIds((prev) => prev.filter((id) => !displayedIds.includes(id)));
    } else {
      setSelectedInvoiceIds((prev) => Array.from(new Set([...prev, ...displayedIds])));
    }
  };

  const handleBulkDeleteInvoices = async () => {
    if (selectedInvoiceIds.length === 0) return;
    setIsBulkDeletingInvoices(true);
    try {
      const res = await api.bulkDeletePurchases(selectedInvoiceIds, 'Super Admin bulk operation');
      setMessage({
        text: res.message || `Successfully processed bulk deletion for ${selectedInvoiceIds.length} invoices.`,
        type: 'success',
      });
      setSelectedInvoiceIds([]);
      setShowBulkDeleteInvoicesModal(false);
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to bulk delete invoices.', type: 'error' });
    } finally {
      setIsBulkDeletingInvoices(false);
    }
  };

  const toggleSelectSupplier = (id: string) => {
    setSelectedSupplierIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllSuppliers = (displayedSuppliers: Supplier[]) => {
    const displayedIds = displayedSuppliers.map((s) => s.id);
    const allSelected = displayedIds.length > 0 && displayedIds.every((id) => selectedSupplierIds.includes(id));
    if (allSelected) {
      setSelectedSupplierIds((prev) => prev.filter((id) => !displayedIds.includes(id)));
    } else {
      setSelectedSupplierIds((prev) => Array.from(new Set([...prev, ...displayedIds])));
    }
  };

  const handleBulkDeleteSuppliers = async () => {
    if (selectedSupplierIds.length === 0) return;
    setIsBulkDeletingSuppliers(true);
    try {
      const res = await api.bulkDeleteSuppliers(selectedSupplierIds);
      setMessage({
        text: res.message || `Successfully deleted ${selectedSupplierIds.length} suppliers.`,
        type: 'success',
      });
      setSelectedSupplierIds([]);
      setShowBulkDeleteSuppliersModal(false);
      loadData();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to bulk delete suppliers.', type: 'error' });
    } finally {
      setIsBulkDeletingSuppliers(false);
    }
  };

  // Calculations for live form
  let formSubtotal = 0;
  let formLineDiscounts = 0;
  let formCGSTTotal = 0;
  let formSGSTTotal = 0;
  let formTaxTotal = 0;

  lines.forEach((l) => {
    const qty = Number(l.stripQuantityInBox !== undefined ? l.stripQuantityInBox : l.quantity) || 0;
    const rate = Number(l.stripPurchasePrice !== undefined ? l.stripPurchasePrice : l.purchaseRate) || 0;
    const taxable = qty * rate;
    const lineGst = Number(l.gstRate) || 0;
    const lineTax = (taxable * lineGst) / 100;
    const lineCGST = lineTax / 2;
    const lineSGST = lineTax / 2;

    formSubtotal += taxable;
    formCGSTTotal += lineCGST;
    formSGSTTotal += lineSGST;
    formTaxTotal += lineTax;
  });

  const extraCharges = parseFloat(additionalCharges) || 0;
  const formGrandTotal = Math.max(0, formSubtotal + formTaxTotal + extraCharges);

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

    const effectiveBranchId = draftBranchId || selectedBranchId || currentBranch?.id;
    if (!effectiveBranchId) {
      setMessage({ text: 'Target branch is required to record a purchase invoice.', type: 'error' });
      return;
    }

    try {
      const parsedPaid = paidAmount !== '' ? parseFloat(paidAmount) : (paymentMode === 'CREDIT' ? 0 : formGrandTotal);

      const payload = {
        branchId: effectiveBranchId,
        supplierId,
        supplierInvoiceNumber: supplierInvoiceNumber.trim(),
        invoiceDate,
        paymentMode,
        paidAmount: parsedPaid,
        invoiceDiscountAmount: 0,
        additionalCharges: extraCharges,
        notes,
        lines: lines.map((l) => {
          const sq = Number(l.stripQuantityInBox !== undefined ? l.stripQuantityInBox : l.quantity) || 1;
          const su = Number(l.stripUnitQuantity !== undefined ? l.stripUnitQuantity : (l.conversionFactor || 10)) || 10;
          const tot = Number(l.totalUnits) || (sq * su);
          const phys = Number(l.pharmacyPhysicalUnits !== undefined ? l.pharmacyPhysicalUnits : tot);
          const sp = Number(l.stripPurchasePrice !== undefined ? l.stripPurchasePrice : l.purchaseRate) || 0;
          const sm = Number(l.stripMrpPrice !== undefined ? l.stripMrpPrice : l.mrp) || 0;
          const isNew = l.isNewProduct || (!l.medicineId && !!l.brandName);

          return {
            medicineId: l.medicineId || (isNew ? 'NEW' : ''),
            batchNumber: l.batchNumber ? l.batchNumber.trim() : `BATCH-${Date.now().toString().slice(-4)}`,
            expiryDate: l.expiryDate,
            quantity: sq,
            freeQuantity: Number(l.freeQuantity) || 0,
            unit: 'Strip',
            conversionFactor: su,
            purchaseRate: sp,
            sellingRate: sm,
            mrp: sm,
            discountPercent: Number(l.discountPercent) || 0,
            discountAmount: Number(l.discountAmount) || 0,
            gstRate: Number(l.gstRate),
            newMedicine: isNew ? {
              brandName: (l.brandName || '').trim(),
              genericName: (l.genericName || l.brandName || '').trim(),
              strength: l.strength || 'Standard',
              dosageForm: l.dosageForm || 'Tablet',
              manufacturer: l.manufacturer || 'Standard Pharma',
              hsnCode: l.hsnCode || '30049099',
              gstRate: Number(l.gstRate) || 5.0,
              mrp: sm,
              defaultPurchaseRate: sp,
              defaultSellingRate: sm,
              baseUnit: 'Tablet',
              packageUnit: 'Strip',
              conversionFactor: su,
              packSize: `${su} Tablets / Strip`,
            } : l.newMedicine,
            isNewProduct: isNew,
            brandName: l.brandName,
            genericName: l.genericName,
            strength: l.strength,
            dosageForm: l.dosageForm,
            manufacturer: l.manufacturer,
            hsnCode: l.hsnCode,
            stripQuantityInBox: sq,
            stripUnitQuantity: su,
            totalUnits: tot,
            pharmacyPhysicalUnits: phys,
            stripPurchasePrice: sp,
            stripMrpPrice: sm,
            purchaseUnitPrice: su > 0 ? Number((sp / su).toFixed(4)) : sp,
            unitSellingPrice: su > 0 ? Number((sm / su).toFixed(4)) : sm,
          };
        }),
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
    setInlineSupplierError(null);
    setIsSavingInlineSupplier(true);
    try {
      const payload = {
        name: inlineSupplierForm.name.trim(),
        contactPerson: inlineSupplierForm.contactPerson.trim() || undefined,
        phone: inlineSupplierForm.phone.trim(),
        email: inlineSupplierForm.email.trim() || undefined,
        gstin: inlineSupplierForm.gstin.trim() ? inlineSupplierForm.gstin.trim().toUpperCase() : undefined,
        address: inlineSupplierForm.address.trim() || undefined,
        dlNumber: inlineSupplierForm.dlNumber.trim() || undefined,
      };

      const created = await api.createSupplier(payload);
      setSuppliers((prev) => {
        const exists = prev.some((s) => s.id === created.id);
        return exists ? prev : [...prev, created];
      });
      setSupplierId(created.id);
      setSupplierSearchQuery(created.name);
      setShowSupplierDropdown(false);
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
      setInlineSupplierError(err.message || 'Failed to create supplier.');
    } finally {
      setIsSavingInlineSupplier(false);
    }
  };

  // Inline Quick Add Medicine
  const handleSaveInlineMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineMedicineError(null);
    setIsSavingInlineMedicine(true);

    try {
      const stripQty = parseFloat(inlineMedicineForm.stripQuantityInBox) || 10;
      const stripUnitQty = parseFloat(inlineMedicineForm.stripUnitQuantity) || 10;
      const totalUnits = stripQty * stripUnitQty;
      const physicalUnits = inlineMedicineForm.pharmacyPhysicalUnits ? parseFloat(inlineMedicineForm.pharmacyPhysicalUnits) : totalUnits;
      const stripPur = parseFloat(inlineMedicineForm.stripPurchasePrice) || 0;
      const stripMrp = parseFloat(inlineMedicineForm.stripMrpPrice) || 0;
      const purUnitPrice = stripUnitQty > 0 ? Number((stripPur / stripUnitQty).toFixed(4)) : 0;
      const unitSellPrice = stripUnitQty > 0 ? Number((stripMrp / stripUnitQty).toFixed(4)) : 0;

      const created = await api.createProduct({
        brandName: inlineMedicineForm.brandName.trim(),
        genericName: inlineMedicineForm.brandName.trim(),
        dosageForm: 'Tablet',
        packSize: `${stripUnitQty} Tablets / Strip`,
        baseUnit: 'Tablet',
        packageUnit: 'Strip',
        conversionFactor: stripUnitQty,
        manufacturer: inlineMedicineForm.manufacturer.trim(),
        hsnCode: inlineMedicineForm.hsnCode?.trim() || undefined,
        gstRate: parseFloat(inlineMedicineForm.gstRate) || 5.0,
        mrp: stripMrp,
        defaultPurchaseRate: stripPur,
        defaultSellingRate: stripMrp,
        prescriptionType: 'OTC',
        stripQuantityInBox: stripQty,
        stripUnitQuantity: stripUnitQty,
        totalUnits: totalUnits,
        pharmacyPhysicalUnits: physicalUnits,
        stripPurchasePrice: stripPur,
        stripMrpPrice: stripMrp,
        purchaseUnitPrice: purUnitPrice,
        unitSellingPrice: unitSellPrice,
      });

      // Update catalogue products cache
      setProducts((prev) => {
        const exists = prev.some((p) => p.id === created.id);
        return exists ? prev : [...prev, created];
      });

      // Directly update the target invoice line with full 13 fields from the new medicine
      if (inlineMedicineTargetIdx !== null) {
        setLines((prevLines) => {
          const nextLines = [...prevLines];
          if (nextLines[inlineMedicineTargetIdx]) {
            nextLines[inlineMedicineTargetIdx] = {
              ...nextLines[inlineMedicineTargetIdx],
              medicineId: created.id,
              brandName: created.brandName,
              manufacturer: created.manufacturer,
              hsnCode: created.hsnCode || '30049099',
              batchNumber: inlineMedicineForm.batchNumber || nextLines[inlineMedicineTargetIdx].batchNumber,
              expiryDate: inlineMedicineForm.expiryDate || nextLines[inlineMedicineTargetIdx].expiryDate,
              stripQuantityInBox: stripQty,
              stripUnitQuantity: stripUnitQty,
              totalUnits: totalUnits,
              pharmacyPhysicalUnits: physicalUnits,
              stripPurchasePrice: stripPur,
              stripMrpPrice: stripMrp,
              purchaseUnitPrice: purUnitPrice,
              unitSellingPrice: unitSellPrice,
              quantity: stripQty,
              conversionFactor: stripUnitQty,
              purchaseRate: stripPur,
              mrp: stripMrp,
              sellingRate: stripMrp,
              gstRate: created.gstRate !== undefined ? created.gstRate : 5.0,
              unit: 'Strip',
            };
          }
          return nextLines;
        });
      }

      setShowInlineMedicineModal(false);
      setInlineMedicineForm({
        brandName: '',
        batchNumber: '',
        expiryDate: '',
        hsnCode: '30049099',
        manufacturer: '',
        stripQuantityInBox: '10',
        stripUnitQuantity: '10',
        totalUnits: '100',
        pharmacyPhysicalUnits: '100',
        stripPurchasePrice: '10',
        stripMrpPrice: '20',
        purchaseUnitPrice: '1.00',
        unitSellingPrice: '2.00',
        gstRate: '5.0',
        genericName: '',
        strength: '500mg',
        dosageForm: 'Tablet',
      });
      setMessage({ text: `Medicine '${created.brandName}' registered in catalogue and linked to invoice line.`, type: 'success' });
    } catch (err: any) {
      setInlineMedicineError(err.message || 'Failed to create medicine. Please check your fields and try again.');
    } finally {
      setIsSavingInlineMedicine(false);
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
    <div className="p-3.5 sm:p-5 md:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Purchase Management & Inwards</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage suppliers with validated email addresses, record inwards with configurable default discount ({configuredDiscount}%) & GST ({configuredCombinedGST}%), reconcile stock edits, and issue returns.
          </p>
        </div>

        {!isBillingUser && (
          <div className="flex flex-wrap items-center gap-2">
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
      <div className="flex gap-2 border-b border-slate-200 text-xs font-bold overflow-x-auto whitespace-nowrap">
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
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="Search by Invoice #, Supplier Invoice #, Supplier..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
                />
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <FilterButton
                  activeCount={activeInvoiceFilterCount}
                  onReset={resetInvoiceFilters}
                  title="Filter Purchase Invoices"
                  buttonLabel="Filter Invoices"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FilterField label="Invoice Status">
                      <FilterSelect
                        value={invStatusFilter}
                        onChange={(e) => setInvStatusFilter(e.target.value)}
                        options={[
                          { label: 'All Statuses', value: '' },
                          { label: 'Received (Stock Inwarded)', value: 'RECEIVED' },
                          { label: 'Draft Pending', value: 'DRAFT' },
                          { label: 'Cancelled / Voided', value: 'CANCELLED' },
                        ]}
                      />
                    </FilterField>

                    <FilterField label="Payment Mode">
                      <FilterSelect
                        value={invPaymentFilter}
                        onChange={(e) => setInvPaymentFilter(e.target.value)}
                        options={[
                          { label: 'All Payment Modes', value: '' },
                          { label: 'Cash', value: 'CASH' },
                          { label: 'Credit (Vendor Payable)', value: 'CREDIT' },
                          { label: 'UPI / Digital Transfer', value: 'UPI' },
                          { label: 'Cheque', value: 'CHEQUE' },
                          { label: 'Bank Transfer', value: 'BANK_TRANSFER' },
                        ]}
                      />
                    </FilterField>

                    <FilterField label="Vendor / Supplier" className="sm:col-span-2">
                      <FilterSelect
                        value={invSupplierFilter}
                        onChange={(e) => setInvSupplierFilter(e.target.value)}
                        options={[
                          { label: 'All Suppliers', value: '' },
                          ...suppliers.map((s) => ({ label: s.name, value: s.id })),
                        ]}
                      />
                    </FilterField>

                    <FilterField label="From Date">
                      <FilterInput
                        type="date"
                        value={invStartDate}
                        onChange={(e) => setInvStartDate(e.target.value)}
                      />
                    </FilterField>

                    <FilterField label="To Date">
                      <FilterInput
                        type="date"
                        value={invEndDate}
                        onChange={(e) => setInvEndDate(e.target.value)}
                      />
                    </FilterField>

                    <FilterField label="Min Amount (₹)">
                      <FilterInput
                        type="number"
                        min="0"
                        placeholder="0.00"
                        value={invMinAmount}
                        onChange={(e) => setInvMinAmount(e.target.value)}
                      />
                    </FilterField>

                    <FilterField label="Max Amount (₹)">
                      <FilterInput
                        type="number"
                        min="0"
                        placeholder="100000.00"
                        value={invMaxAmount}
                        onChange={(e) => setInvMaxAmount(e.target.value)}
                      />
                    </FilterField>
                  </div>
                </FilterButton>

                <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-500 pl-2 border-l border-slate-200">
                  <span>Def Disc: <strong className="text-pharmagreen-700 font-mono">{configuredDiscount}%</strong></span>
                  <span>Def GST: <strong className="text-slate-800 font-mono">{configuredCombinedGST}%</strong></span>
                </div>
              </div>
            </div>

            {/* Active Filter Badges */}
            {activeInvoiceFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
                <span className="text-[11px] font-semibold text-slate-500 mr-1">Active Filters:</span>
                {invStatusFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                    Status: {invStatusFilter}
                    <button type="button" onClick={() => setInvStatusFilter('')} className="hover:text-brand-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {invPaymentFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                    Payment: {invPaymentFilter}
                    <button type="button" onClick={() => setInvPaymentFilter('')} className="hover:text-brand-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {invSupplierFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                    Supplier: {suppliers.find((s) => s.id === invSupplierFilter)?.name || invSupplierFilter}
                    <button type="button" onClick={() => setInvSupplierFilter('')} className="hover:text-brand-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {(invStartDate || invEndDate) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                    Date: {invStartDate || 'Start'} to {invEndDate || 'Now'}
                    <button
                      type="button"
                      onClick={() => {
                        setInvStartDate('');
                        setInvEndDate('');
                      }}
                      className="hover:text-brand-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {(invMinAmount || invMaxAmount) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                    Total: ₹{invMinAmount || '0'} - {invMaxAmount ? `₹${invMaxAmount}` : 'Any'}
                    <button
                      type="button"
                      onClick={() => {
                        setInvMinAmount('');
                        setInvMaxAmount('');
                      }}
                      className="hover:text-brand-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={resetInvoiceFilters}
                  className="text-[11px] text-slate-500 hover:text-rose-600 font-semibold underline ml-1"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>

          {/* Super Admin Bulk Invoices Action Bar */}
          {isSuperAdmin && selectedInvoiceIds.length > 0 && (
            <div className="flex items-center justify-between bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-xs text-rose-800">
              <span className="font-semibold flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-rose-600" />
                {selectedInvoiceIds.length} purchase invoices selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceIds([])}
                  className="px-2.5 py-1 text-slate-600 hover:text-slate-800 text-[11px] font-semibold"
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteInvoicesModal(true)}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedInvoiceIds.length})
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto touch-scroll">
              <table className="w-full text-left text-xs min-w-[850px]">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    {isSuperAdmin && (
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            purchases.length > 0 &&
                            purchases.every((p) => selectedInvoiceIds.includes(p.id))
                          }
                          onChange={() => toggleSelectAllInvoices(purchases)}
                          className="rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                      </th>
                    )}
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
                      <td colSpan={isSuperAdmin ? 11 : 10} className="py-8 text-center text-slate-400">
                        Loading purchase invoices...
                      </td>
                    </tr>
                  ) : purchases.length === 0 ? (
                    <tr>
                      <td colSpan={isSuperAdmin ? 11 : 10} className="py-12 text-center text-slate-500">
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
                        if (invoiceSearch.trim()) {
                          const q = invoiceSearch.toLowerCase().trim();
                          const match =
                            p.invoiceNumber.toLowerCase().includes(q) ||
                            p.supplierInvoiceNumber.toLowerCase().includes(q) ||
                            (p.supplier?.name && p.supplier.name.toLowerCase().includes(q));
                          if (!match) return false;
                        }
                        if (invStatusFilter && p.status !== invStatusFilter) return false;
                        if (invPaymentFilter && p.paymentMode !== invPaymentFilter) return false;
                        if (invSupplierFilter && p.supplierId !== invSupplierFilter) return false;
                        if (invStartDate) {
                          const invD = new Date(p.invoiceDate).toISOString().split('T')[0];
                          if (invD < invStartDate) return false;
                        }
                        if (invEndDate) {
                          const invD = new Date(p.invoiceDate).toISOString().split('T')[0];
                          if (invD > invEndDate) return false;
                        }
                        if (invMinAmount && p.grandTotal < parseFloat(invMinAmount)) return false;
                        if (invMaxAmount && p.grandTotal > parseFloat(invMaxAmount)) return false;
                        return true;
                      })
                      .map((pur) => (
                        <tr key={pur.id} className="hover:bg-slate-50/80 transition-colors">
                          {isSuperAdmin && (
                            <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedInvoiceIds.includes(pur.id)}
                                onChange={() => toggleSelectInvoice(pur.id)}
                                className="rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
                              />
                            </td>
                          )}
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
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Search suppliers by name, phone, email, GSTIN..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
                />
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <FilterButton
                  activeCount={activeSupplierFilterCount}
                  onReset={resetSupplierFilters}
                  title="Filter Suppliers Directory"
                  buttonLabel="Filter Suppliers"
                >
                  <div className="space-y-3">
                    <FilterField label="Operating Status">
                      <FilterSelect
                        value={supStatusFilter}
                        onChange={(e) => setSupStatusFilter(e.target.value)}
                        options={[
                          { label: 'All Suppliers (Active & Archived)', value: '' },
                          { label: 'Active Suppliers Only', value: 'ACTIVE' },
                          { label: 'Archived / Suspended Only', value: 'INACTIVE' },
                        ]}
                      />
                    </FilterField>

                    <FilterField label="Tax & License Compliance">
                      <FilterSelect
                        value={supComplianceFilter}
                        onChange={(e) => setSupComplianceFilter(e.target.value)}
                        options={[
                          { label: 'All Compliance Records', value: '' },
                          { label: 'Registered with GSTIN', value: 'WITH_GSTIN' },
                          { label: 'Missing GSTIN', value: 'WITHOUT_GSTIN' },
                          { label: 'With Drug License Registered', value: 'WITH_DL' },
                        ]}
                      />
                    </FilterField>
                  </div>
                </FilterButton>

                {!isBillingUser && (
                  <button
                    onClick={openNewSupplierModal}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add New Supplier
                  </button>
                )}
              </div>
            </div>

            {/* Active Filter Badges */}
            {activeSupplierFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
                <span className="text-[11px] font-semibold text-slate-500 mr-1">Active Filters:</span>
                {supStatusFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                    Status: {supStatusFilter === 'ACTIVE' ? 'Active' : 'Archived'}
                    <button type="button" onClick={() => setSupStatusFilter('')} className="hover:text-brand-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {supComplianceFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                    Compliance: {supComplianceFilter === 'WITH_GSTIN' ? 'Has GSTIN' : supComplianceFilter === 'WITHOUT_GSTIN' ? 'No GSTIN' : 'Has DL'}
                    <button type="button" onClick={() => setSupComplianceFilter('')} className="hover:text-brand-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={resetSupplierFilters}
                  className="text-[11px] text-slate-500 hover:text-rose-600 font-semibold underline ml-1"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>

          {/* Super Admin Bulk Suppliers Action Bar */}
          {isSuperAdmin && selectedSupplierIds.length > 0 && (
            <div className="flex items-center justify-between bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-xs text-rose-800">
              <span className="font-semibold flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-rose-600" />
                {selectedSupplierIds.length} suppliers selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSupplierIds([])}
                  className="px-2.5 py-1 text-slate-600 hover:text-slate-800 text-[11px] font-semibold"
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteSuppliersModal(true)}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedSupplierIds.length})
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto touch-scroll">
              <table className="w-full text-left text-xs min-w-[750px]">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    {isSuperAdmin && (
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            suppliers.length > 0 &&
                            suppliers.every((s) => selectedSupplierIds.includes(s.id))
                          }
                          onChange={() => toggleSelectAllSuppliers(suppliers)}
                          className="rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                      </th>
                    )}
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
                      <td colSpan={isSuperAdmin ? 9 : 8} className="py-12 text-center text-slate-500">
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
                        if (supplierSearch.trim()) {
                          const q = supplierSearch.toLowerCase().trim();
                          const match =
                            s.name.toLowerCase().includes(q) ||
                            s.phone.includes(q) ||
                            (s.email && s.email.toLowerCase().includes(q)) ||
                            (s.gstin && s.gstin.toLowerCase().includes(q)) ||
                            (s.contactPerson && s.contactPerson.toLowerCase().includes(q));
                          if (!match) return false;
                        }
                        if (supStatusFilter === 'ACTIVE' && s.isActive === false) return false;
                        if (supStatusFilter === 'INACTIVE' && s.isActive !== false) return false;
                        if (supComplianceFilter === 'WITH_GSTIN' && !s.gstin) return false;
                        if (supComplianceFilter === 'WITHOUT_GSTIN' && s.gstin) return false;
                        if (supComplianceFilter === 'WITH_DL' && !s.dlNumber) return false;
                        return true;
                      })
                      .map((sup) => (
                        <tr key={sup.id} className="hover:bg-slate-50/80 transition-colors">
                          {isSuperAdmin && (
                            <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedSupplierIds.includes(sup.id)}
                                onChange={() => toggleSelectSupplier(sup.id)}
                                className="rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
                              />
                            </td>
                          )}
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
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={returnSearch}
                  onChange={(e) => setReturnSearch(e.target.value)}
                  placeholder="Search debit notes by Return #, Supplier, Reason..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
                />
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <FilterButton
                  activeCount={activeReturnFilterCount}
                  onReset={resetReturnFilters}
                  title="Filter Supplier Debit Returns"
                  buttonLabel="Filter Returns"
                >
                  <div className="space-y-3">
                    <FilterField label="Vendor / Supplier">
                      <FilterSelect
                        value={returnSupplierFilter}
                        onChange={(e) => setReturnSupplierFilter(e.target.value)}
                        options={[
                          { label: 'All Suppliers', value: '' },
                          ...suppliers.map((s) => ({ label: s.name, value: s.id })),
                        ]}
                      />
                    </FilterField>

                    <FilterField label="Return Status">
                      <FilterSelect
                        value={returnStatusFilter}
                        onChange={(e) => setReturnStatusFilter(e.target.value)}
                        options={[
                          { label: 'All Return Statuses', value: '' },
                          { label: 'Completed (Stock Adjusted)', value: 'COMPLETED' },
                          { label: 'Pending Processing', value: 'PENDING' },
                        ]}
                      />
                    </FilterField>
                  </div>
                </FilterButton>
              </div>
            </div>

            {/* Active Filter Badges */}
            {activeReturnFilterCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
                <span className="text-[11px] font-semibold text-slate-500 mr-1">Active Filters:</span>
                {returnSupplierFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                    Supplier: {suppliers.find((s) => s.id === returnSupplierFilter)?.name || returnSupplierFilter}
                    <button type="button" onClick={() => setReturnSupplierFilter('')} className="hover:text-brand-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {returnStatusFilter && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                    Status: {returnStatusFilter}
                    <button type="button" onClick={() => setReturnStatusFilter('')} className="hover:text-brand-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={resetReturnFilters}
                  className="text-[11px] text-slate-500 hover:text-rose-600 font-semibold underline ml-1"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto touch-scroll">
              <table className="w-full text-left text-xs min-w-[750px]">
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
                    purchaseReturns
                      .filter((ret: any) => {
                        if (returnSearch.trim()) {
                          const q = returnSearch.toLowerCase().trim();
                          const match =
                            (ret.returnNumber && ret.returnNumber.toLowerCase().includes(q)) ||
                            (ret.supplier?.name && ret.supplier.name.toLowerCase().includes(q)) ||
                            (ret.reason && ret.reason.toLowerCase().includes(q));
                          if (!match) return false;
                        }
                        if (returnSupplierFilter && ret.supplierId !== returnSupplierFilter) return false;
                        if (returnStatusFilter && ret.status !== returnStatusFilter) return false;
                        return true;
                      })
                      .map((ret: any) => (
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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            {/* Target Branch Selector / Indicator */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Target Branch *</label>
              </div>
              {isEditing ? (
                <div
                  className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-300 rounded-lg font-semibold text-slate-700 truncate"
                  title="Target branch is locked on existing invoice"
                >
                  {branches.find((b) => b.id === draftBranchId)?.name || currentBranch?.name || 'Assigned Branch'}
                </div>
              ) : isSuperAdmin && branches.length > 0 ? (
                <select
                  value={draftBranchId}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-300 rounded-lg font-semibold text-slate-700 truncate">
                  {currentBranch?.name || 'Local Branch'} <span className="text-slate-500 font-mono text-[11px]">({currentBranch?.code})</span>
                </div>
              )}
            </div>

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

          {/* Mode Switcher: Manual Line Entry vs Integrated Excel/CSV Bulk Import */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setEntryMode('manual')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                entryMode === 'manual'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Manual Line Entry
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('import')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                entryMode === 'import'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Import Excel / CSV
            </button>
          </div>

          {entryMode === 'import' ? (
            <div className="space-y-4 pt-1">
              {/* Template Download & Spec Header */}
              <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-emerald-950 block">Purchase Invoice Import Specification</span>
                  <span className="text-[11px] text-emerald-800">
                    Import purchase lines with automatic product matching, unit conversions, and tax calculations.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate('xlsx')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Excel (.xlsx)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate('csv')}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTemplatePreview(!showTemplatePreview)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                  >
                    {showTemplatePreview ? 'Hide Spec' : 'Show Format Preview'}
                  </button>
                </div>
              </div>

              {/* On-Screen Template Format Preview */}
              {showTemplatePreview && (
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 text-xs">
                  <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider block">
                    Supported Columns & Data Type Definitions:
                  </span>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-1.5">Column Name</th>
                          <th className="p-1.5">Requirement</th>
                          <th className="p-1.5">Description</th>
                          <th className="p-1.5">Example</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        <tr><td className="p-1.5 font-bold">Medicine Name</td><td className="p-1.5 text-rose-600 font-bold">Mandatory</td><td className="p-1.5">Trade brand / medicine commercial name</td><td className="p-1.5 font-mono">Dolo 650</td></tr>
                        <tr><td className="p-1.5 font-bold">Batch Number</td><td className="p-1.5 text-rose-600 font-bold">Mandatory</td><td className="p-1.5">Manufacturer physical batch reference</td><td className="p-1.5 font-mono">BATCH-001</td></tr>
                        <tr><td className="p-1.5 font-bold">Expiry Date</td><td className="p-1.5 text-rose-600 font-bold">Mandatory</td><td className="p-1.5">Batch expiry date (accepts '.', '/', '-' e.g. 30-12-2026, 30.12.2026, 30/12/2026, or YYYY-MM-DD)</td><td className="p-1.5 font-mono">30-12-2026</td></tr>
                        <tr><td className="p-1.5 font-bold">HSN Number</td><td className="p-1.5 text-slate-500">Optional</td><td className="p-1.5">HSN classification code</td><td className="p-1.5 font-mono">30049099</td></tr>
                        <tr><td className="p-1.5 font-bold">Manufacturer</td><td className="p-1.5 text-rose-600 font-bold">Mandatory</td><td className="p-1.5">Pharmaceutical manufacturing company</td><td className="p-1.5 font-mono">Micro Labs Ltd</td></tr>
                        <tr><td className="p-1.5 font-bold">Strip Quantity in Box</td><td className="p-1.5 text-rose-600 font-bold">Mandatory</td><td className="p-1.5">Number of strips packed in a single box</td><td className="p-1.5 font-mono">10</td></tr>
                        <tr><td className="p-1.5 font-bold">Strip Unit Quantity</td><td className="p-1.5 text-rose-600 font-bold">Mandatory</td><td className="p-1.5">Number of tablets contained in each strip</td><td className="p-1.5 font-mono">10</td></tr>
                        <tr><td className="p-1.5 font-bold">Total Units</td><td className="p-1.5 text-emerald-700 font-bold">Auto Formula</td><td className="p-1.5">Total tablets in box (= Strip Qty in Box × Strip Unit Qty)</td><td className="p-1.5 font-mono">100</td></tr>
                        <tr><td className="p-1.5 font-bold">Pharmacy Physical Units</td><td className="p-1.5 text-rose-600 font-bold">Mandatory</td><td className="p-1.5">Physical tablet count in stock (initially = Total Units, editable)</td><td className="p-1.5 font-mono">100</td></tr>
                        <tr><td className="p-1.5 font-bold">Strip Purchase Price</td><td className="p-1.5 text-rose-600 font-bold">Mandatory</td><td className="p-1.5">Purchase cost per strip before GST (₹)</td><td className="p-1.5 font-mono">10.00</td></tr>
                        <tr><td className="p-1.5 font-bold">Strip MRP Price</td><td className="p-1.5 text-rose-600 font-bold">Mandatory</td><td className="p-1.5">Maximum retail price printed on strip (₹)</td><td className="p-1.5 font-mono">20.00</td></tr>
                        <tr><td className="p-1.5 font-bold">Purchase Unit Price</td><td className="p-1.5 text-emerald-700 font-bold">Auto Formula</td><td className="p-1.5">Cost per tablet (= Strip Purchase Price ÷ Strip Unit Qty)</td><td className="p-1.5 font-mono">1.00</td></tr>
                        <tr><td className="p-1.5 font-bold">Unit Selling Price</td><td className="p-1.5 text-emerald-700 font-bold">Auto Formula</td><td className="p-1.5">MRP per tablet (= Strip MRP Price ÷ Strip Unit Qty)</td><td className="p-1.5 font-mono">2.00</td></tr>
                        <tr><td className="p-1.5 font-bold">GST Rate (%)</td><td className="p-1.5 text-slate-500">Optional</td><td className="p-1.5">Applicable GST percentage (e.g. 5, 12, 18, defaults to 5%)</td><td className="p-1.5 font-mono">5</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-5 text-center bg-white transition-colors">
                <input
                  type="file"
                  id="purchase-file-input"
                  accept=".xlsx,.csv,.xls"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setImportFile(e.target.files[0]);
                      setImportPreviewData(null);
                      setImportError(null);
                    }
                  }}
                  className="hidden"
                />
                <label htmlFor="purchase-file-input" className="cursor-pointer flex flex-col items-center justify-center gap-2">
                  <UploadCloud className="w-8 h-8 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-700">
                    {importFile ? importFile.name : 'Click to select Excel (.xlsx) or CSV file, or drag and drop here'}
                  </span>
                  {importFile ? (
                    <span className="text-[10px] text-slate-500 font-mono">
                      {(importFile.size / 1024).toFixed(1)} KB — Ready to parse
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">
                      Standard Excel workbook (.xlsx) or CSV files supported.
                    </span>
                  )}
                </label>
              </div>

              {/* Action: Generate Preview */}
              {importFile && !importPreviewData && (
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="text-xs text-slate-600 font-medium">
                    Ready to validate items for invoice: <strong className="text-slate-900 font-mono">{supplierInvoiceNumber || 'Draft'}</strong>
                    {draftBranchId && (
                      <span className="ml-2 text-emerald-700 font-semibold">
                        • Branch: {branches.find((b) => b.id === draftBranchId)?.name || currentBranch?.name || draftBranchId}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={isAnalyzingImport}
                    onClick={() => handleAnalyzeImport()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs disabled:opacity-50"
                  >
                    {isAnalyzingImport ? (
                      <>
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        Validating file items...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" /> Generate Staged Preview
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Error Message */}
              {importError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Staged Preview Section */}
              {importPreviewData && (
                <div className="space-y-3 pt-1">
                  {/* Branch & Status Banner */}
                  <div className="flex items-center justify-between bg-emerald-50/70 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-emerald-700" />
                      <span className="font-semibold text-emerald-900">
                        Target Branch:{' '}
                        <strong>
                          {importPreviewData.branchName ||
                            branches.find((b) => b.id === (importPreviewData.targetBranchId || draftBranchId))?.name ||
                            'Selected Branch'}
                        </strong>
                      </span>
                    </div>
                    <span className="text-[11px] text-emerald-700 font-mono">
                      Staged for Inwards Validation
                    </span>
                  </div>

                  {/* Summary Metric Badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Total Rows</span>
                      <span className="text-sm font-bold font-mono text-slate-800">{importPreviewData.metrics.totalRows}</span>
                    </div>
                    <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-emerald-700 block">Valid Items</span>
                      <span className="text-sm font-bold font-mono text-emerald-800">{importPreviewData.metrics.validRows}</span>
                    </div>
                    <div className={`p-2 rounded-lg border ${importPreviewData.metrics.errorRows > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                      <span className={`text-[10px] block ${importPreviewData.metrics.errorRows > 0 ? 'text-rose-700 font-bold' : 'text-slate-500'}`}>Errors</span>
                      <span className={`text-sm font-bold font-mono ${importPreviewData.metrics.errorRows > 0 ? 'text-rose-700' : 'text-slate-800'}`}>
                        {importPreviewData.metrics.errorRows}
                      </span>
                    </div>
                    <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
                      <span className="text-[10px] text-blue-700 block">New Products</span>
                      <span className="text-sm font-bold font-mono text-blue-800">{importPreviewData.metrics.newProducts}</span>
                    </div>
                    <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
                      <span className="text-[10px] text-amber-700 block">Stock Increments</span>
                      <span className="text-sm font-bold font-mono text-amber-800">{importPreviewData.metrics.existingBatches}</span>
                    </div>
                    <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-emerald-800 block">Est. Grand Total</span>
                      <span className="text-sm font-black font-mono text-emerald-900">
                        ₹{Number(importPreviewData.metrics.estimatedGrandTotal || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Staged Items Table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[1300px]">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky top-0">
                        <tr>
                          <th className="p-2 text-center">Row #</th>
                          <th className="p-2 text-center">Status</th>
                          <th className="p-2">Medicine Name</th>
                          <th className="p-2">Batch #</th>
                          <th className="p-2">Expiry</th>
                          <th className="p-2">HSN No</th>
                          <th className="p-2">Manufacturer</th>
                          <th className="p-2 text-center">Strip Qty in Box</th>
                          <th className="p-2 text-center">Strip Unit Qty</th>
                          <th className="p-2 text-center">Total Units</th>
                          <th className="p-2 text-center font-bold text-emerald-800">Physical Units</th>
                          <th className="p-2 text-right">Strip P.Price</th>
                          <th className="p-2 text-right">Strip MRP</th>
                          <th className="p-2 text-right">Unit P.Price</th>
                          <th className="p-2 text-right font-bold text-emerald-800">Unit Selling Price</th>
                          <th className="p-2 text-right font-bold">Line Total</th>
                          <th className="p-2">Validation Notes</th>
                          <th className="p-2 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {importPreviewData.items.map((item: any, i: number) => (
                          <tr key={i} className={item.valid ? 'hover:bg-slate-50' : 'bg-rose-50/50 hover:bg-rose-50'}>
                            <td className="p-2 font-mono font-bold text-slate-500 text-center">{item.rowNumber}</td>
                            <td className="p-2 text-center">
                              {item.valid ? (
                                <Badge variant="success" size="sm">Valid</Badge>
                              ) : (
                                <Badge variant="danger" size="sm">Error</Badge>
                              )}
                            </td>
                            <td className="p-2">
                              <span className="font-bold text-slate-900">{item.medicineName || item.productName || item.brandName}</span>
                              {item.strength && <span className="text-slate-500 ml-1">({item.strength})</span>}
                              {item.isNewProduct && <span className="ml-1.5 text-[9px] bg-blue-100 text-blue-800 font-bold px-1 rounded">NEW</span>}
                            </td>
                            <td className="p-2 font-mono font-semibold">{item.batchNumber}</td>
                            <td className="p-2 font-mono text-slate-600">{item.expiryDate ? String(item.expiryDate).slice(0, 10) : '-'}</td>
                            <td className="p-2 font-mono text-slate-500">{item.hsnCode || '-'}</td>
                            <td className="p-2 text-slate-700">{item.manufacturer || '-'}</td>
                            <td className="p-2 text-center font-mono font-bold text-slate-800">
                              {item.stripQuantityInBox !== undefined ? item.stripQuantityInBox : (item.quantity || 1)}
                            </td>
                            <td className="p-2 text-center font-mono font-bold text-slate-800">
                              {item.stripUnitQuantity !== undefined ? item.stripUnitQuantity : (item.unitsPerPack || 10)}
                            </td>
                            <td className="p-2 text-center font-mono font-bold text-slate-800">
                              {item.totalUnits !== undefined ? item.totalUnits : (item.quantity * (item.unitsPerPack || 1))}
                            </td>
                            <td className="p-2 text-center font-mono font-bold text-emerald-800 bg-emerald-50/40">
                              {item.pharmacyPhysicalUnits !== undefined ? item.pharmacyPhysicalUnits : (item.totalUnits || item.quantity)}
                            </td>
                            <td className="p-2 text-right font-mono">₹{Number(item.stripPurchasePrice !== undefined ? item.stripPurchasePrice : item.purchaseRate).toFixed(2)}</td>
                            <td className="p-2 text-right font-mono font-bold text-slate-900">₹{Number(item.stripMrpPrice !== undefined ? item.stripMrpPrice : item.mrp).toFixed(2)}</td>
                            <td className="p-2 text-right font-mono text-blue-700">₹{Number(item.purchaseUnitPrice !== undefined ? item.purchaseUnitPrice : (item.purchaseRate / (item.unitsPerPack || 1))).toFixed(2)}</td>
                            <td className="p-2 text-right font-mono font-black text-emerald-900 bg-emerald-50/40">₹{Number(item.unitSellingPrice !== undefined ? item.unitSellingPrice : (item.mrp / (item.unitsPerPack || 1))).toFixed(2)}</td>
                            <td className="p-2 text-right font-mono font-bold text-emerald-800">
                              ₹{Number(item.lineTotal || 0).toFixed(2)}
                            </td>
                            <td className="p-2 text-[11px]">
                              {item.errors && item.errors.length > 0 ? (
                                <span className="text-rose-600 font-semibold">{item.errors.join('; ')}</span>
                              ) : (
                                <span className="text-emerald-700">Ready to record</span>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemovePreviewItem(i)}
                                className="text-rose-600 hover:text-rose-800 p-1"
                                title="Remove row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={handleUseValidatedItemsInLines}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                    >
                      Transfer to Manual Lines
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setImportPreviewData(null);
                          setImportFile(null);
                        }}
                        className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs font-semibold"
                      >
                        Discard Preview
                      </button>
                      <button
                        type="button"
                        disabled={isSubmittingImportPurchase || importPreviewData.metrics.validRows === 0}
                        onClick={handleConfirmImportPurchase}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {isSubmittingImportPurchase ? (
                          <>
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            Recording Purchase...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-3.5 h-3.5" />
                            Confirm Purchase & Save Inward Stock ({importPreviewData.metrics.validRows} Items)
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Manual Invoice Line Items */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800">Invoice Line Items & Batches</label>
                    <p className="text-[10px] text-slate-400">
                      Record inward tablet stock. Inventory is recorded in units/tablets automatically.
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
                    const sq = Number(l.stripQuantityInBox !== undefined ? l.stripQuantityInBox : l.quantity) || 0;
                    const su = Number(l.stripUnitQuantity !== undefined ? l.stripUnitQuantity : (l.conversionFactor || 10)) || 10;
                    const totalUnits = Number(l.totalUnits) || (sq * su);
                    const physicalUnits = Number(l.pharmacyPhysicalUnits !== undefined ? l.pharmacyPhysicalUnits : totalUnits);
                    const stripPur = Number(l.stripPurchasePrice !== undefined ? l.stripPurchasePrice : l.purchaseRate) || 0;
                    const stripMrp = Number(l.stripMrpPrice !== undefined ? l.stripMrpPrice : l.mrp) || 0;
                    const purUnitPrice = su > 0 ? Number((stripPur / su).toFixed(2)) : 0;
                    const unitSellPrice = su > 0 ? Number((stripMrp / su).toFixed(2)) : 0;

                    const gross = sq * stripPur;
                    const taxable = gross;
                    const lineGst = Number(l.gstRate) || 0;
                    const lineTax = (taxable * lineGst) / 100;
                    const effectiveUnitCost = totalUnits > 0 ? taxable / totalUnits : purUnitPrice;

                    return (
                      <div key={idx} className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
                        {/* Line Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-800 text-xs">
                              {l.brandName || (products.find((p) => p.id === l.medicineId)?.brandName) || `Invoice Item #${idx + 1}`}
                            </span>
                          </div>
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-rose-600 hover:text-rose-800 text-xs font-bold flex items-center gap-1 px-2 py-0.5 rounded hover:bg-rose-50 transition-colors"
                              title="Remove Line Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Remove
                            </button>
                          )}
                        </div>

                        {/* Section 1: Medicine & Batch Details */}
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                          <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            <span>1. Medicine & Batch Information</span>
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div className="sm:col-span-2 lg:col-span-1">
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-bold text-slate-700">
                                  Medicine Name <span className="text-rose-500">*</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInlineMedicineTargetIdx(idx);
                                    setShowInlineMedicineModal(true);
                                  }}
                                  className="text-[10px] text-emerald-600 hover:text-emerald-800 font-bold flex items-center gap-0.5"
                                >
                                  <Plus className="w-2.5 h-2.5" /> Quick Add
                                </button>
                              </div>
                              <select
                                value={l.medicineId}
                                onChange={(e) => updateLine(idx, 'medicineId', e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-emerald-500"
                              >
                                <option value="">-- Choose Catalogue Medicine --</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.brandName}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                required
                                placeholder="e.g. Paracetamol 500mg"
                                value={l.brandName || ''}
                                onChange={(e) => updateLine(idx, 'brandName', e.target.value)}
                                className="mt-1.5 w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-bold text-slate-700 block mb-1">
                                Batch Number <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. BATCH-001"
                                value={l.batchNumber}
                                onChange={(e) => updateLine(idx, 'batchNumber', e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-bold text-slate-700 block mb-1">
                                Expiry Date <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="date"
                                required
                                value={l.expiryDate}
                                onChange={(e) => updateLine(idx, 'expiryDate', e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            <div>
                              <label className="text-xs font-bold text-slate-700 block mb-1">
                                HSN Number
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. 30049099"
                                value={l.hsnCode || ''}
                                onChange={(e) => updateLine(idx, 'hsnCode', e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <label className="text-xs font-bold text-slate-700 block mb-1">
                                Manufacturer <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. Micro Labs Ltd"
                                value={l.manufacturer || ''}
                                onChange={(e) => updateLine(idx, 'manufacturer', e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-medium"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Section 2: Box & Strip Packaging */}
                        <div className="p-3 bg-emerald-50/30 rounded-xl border border-emerald-200 space-y-2">
                          <p className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">
                            2. Packaging & Units (Formulas: Total Units = Strip Qty in Box × Strip Unit Qty)
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div>
                              <label className="text-xs font-bold text-slate-700 block mb-1">
                                Strip Qty in Box <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                required
                                placeholder="e.g. 10"
                                value={l.stripQuantityInBox ?? ''}
                                onChange={(e) => updateLine(idx, 'stripQuantityInBox', e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                              />
                              <span className="text-[10px] text-slate-500 block mt-0.5">Number of strips per box.</span>
                            </div>

                            <div>
                              <label className="text-xs font-bold text-slate-700 block mb-1">
                                Strip Unit Qty <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                required
                                placeholder="e.g. 10"
                                value={l.stripUnitQuantity ?? ''}
                                onChange={(e) => updateLine(idx, 'stripUnitQuantity', e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                              />
                              <span className="text-[10px] text-slate-500 block mt-0.5">Tablets per strip.</span>
                            </div>

                            <div>
                              <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center justify-between">
                                <span>Total Units</span>
                                <span className="text-[10px] text-emerald-700 font-normal">Formula</span>
                              </label>
                              <input
                                type="text"
                                readOnly
                                value={l.totalUnits ?? ''}
                                className="w-full px-3 py-2 text-xs bg-emerald-50/60 border border-emerald-300 rounded-lg font-mono font-bold text-emerald-900 cursor-not-allowed"
                              />
                              <span className="text-[10px] text-emerald-700 block mt-0.5">Total tablets (Box × Strip).</span>
                            </div>

                            <div>
                              <label className="text-xs font-bold text-emerald-900 block mb-1 flex items-center justify-between">
                                <span>Physical Units</span>
                                <span className="text-[10px] text-slate-500 font-normal">Editable</span>
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={l.pharmacyPhysicalUnits ?? ''}
                                onChange={(e) => updateLine(idx, 'pharmacyPhysicalUnits', e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-emerald-400 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                              />
                              <span className="text-[10px] text-slate-500 block mt-0.5">Initial physical count.</span>
                            </div>
                          </div>
                        </div>

                        {/* Section 3: Strip & Unit Pricing */}
                        <div className="p-3 bg-amber-50/30 rounded-xl border border-amber-200 space-y-2">
                          <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
                            3. Pricing Structure (Formulas: Unit Price = Strip Price ÷ Strip Unit Qty)
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div>
                              <label className="text-xs font-bold text-blue-900 block mb-1">
                                Strip Purchase Price (₹) <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                required
                                placeholder="e.g. 10.00"
                                value={l.stripPurchasePrice ?? ''}
                                onChange={(e) => updateLine(idx, 'stripPurchasePrice', e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-blue-200 rounded-lg font-mono font-bold text-blue-900 focus:ring-2 focus:ring-blue-500"
                              />
                              <span className="text-[10px] text-slate-500 block mt-0.5">Purchase cost per strip.</span>
                            </div>

                            <div>
                              <label className="text-xs font-bold text-amber-900 block mb-1">
                                Strip MRP Price (₹) <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                required
                                placeholder="e.g. 20.00"
                                value={l.stripMrpPrice ?? ''}
                                onChange={(e) => updateLine(idx, 'stripMrpPrice', e.target.value)}
                                className="w-full px-3 py-2 text-xs bg-white border border-amber-300 rounded-lg font-mono font-bold text-amber-900 focus:ring-2 focus:ring-amber-500"
                              />
                              <span className="text-[10px] text-slate-500 block mt-0.5">Retail MRP per strip.</span>
                            </div>

                            <div>
                              <label className="text-xs font-bold text-blue-900 block mb-1 flex items-center justify-between">
                                <span>Pur Unit Price (₹)</span>
                                <span className="text-[10px] text-blue-700 font-normal">Formula</span>
                              </label>
                              <input
                                type="text"
                                readOnly
                                value={l.purchaseUnitPrice ?? ''}
                                className="w-full px-3 py-2 text-xs bg-blue-50/50 border border-blue-200 rounded-lg font-mono font-bold text-blue-900 cursor-not-allowed"
                              />
                              <span className="text-[10px] text-blue-700 block mt-0.5">Cost per tablet.</span>
                            </div>

                            <div>
                              <label className="text-xs font-bold text-emerald-900 block mb-1 flex items-center justify-between">
                                <span>Unit Selling Price (₹)</span>
                                <span className="text-[10px] text-emerald-700 font-normal">Formula</span>
                              </label>
                              <input
                                type="text"
                                readOnly
                                value={l.unitSellingPrice ?? ''}
                                className="w-full px-3 py-2 text-xs bg-emerald-50/50 border border-emerald-300 rounded-lg font-mono font-bold text-emerald-900 cursor-not-allowed"
                              />
                              <span className="text-[10px] text-emerald-700 block mt-0.5">MRP per tablet.</span>
                            </div>
                          </div>
                        </div>

                        {/* Line Tax & Summary */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-1 border-t border-slate-200/60 items-center">
                          <div className="col-span-1 sm:col-span-1 lg:col-span-4">
                            <label className="text-xs font-bold text-slate-700 block mb-1">
                              GST Rate ({l.gstRate}%) *
                            </label>
                            <select
                              value={l.gstRate}
                              onChange={(e) => updateLine(idx, 'gstRate', e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold font-mono focus:ring-2 focus:ring-emerald-500"
                            >
                              <option value="0">0% (Nil)</option>
                              <option value="5">5% (CGST 2.5% + SGST 2.5%)</option>
                              <option value="12">12% (CGST 6% + SGST 6%)</option>
                              <option value="18">18% (CGST 9% + SGST 9%)</option>
                              <option value="28">28% (CGST 14% + SGST 14%)</option>
                            </select>
                          </div>

                          <div className="col-span-1 sm:col-span-1 lg:col-span-8 flex flex-col items-end justify-center font-mono text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-3">
                              <span className="text-slate-600 text-[11px]">
                                Subtotal: <strong className="text-slate-900">₹{taxable.toFixed(2)}</strong> ({sq} strips @ ₹{stripPur}/strip)
                              </span>
                              <span className="text-slate-600 text-[11px]">
                                GST: <strong className="text-slate-900">₹{lineTax.toFixed(2)}</strong>
                              </span>
                              <span className="text-xs text-emerald-800 font-black">
                                Total: ₹{(taxable + lineTax).toFixed(2)}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              Base: {totalUnits} tablets (Physical: {physicalUnits} tablets) @ ₹{effectiveUnitCost.toFixed(2)}/tablet
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Structured Financial Invoice Summary Box */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Invoice Financial Summary & Dual Tax Breakdown
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Taxable Base</span>
                    <span className="text-sm font-bold font-mono text-slate-900">
                      ₹{formSubtotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">Total GST</span>
                    <span className="text-sm font-bold font-mono text-emerald-700">
                      ₹{formTaxTotal.toFixed(2)}
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
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                >
                  {isEditing ? 'Save Changes & Reconcile Stock' : 'Confirm Purchase & Receive Stock'}
                </button>
              </div>
            </>
          )}
        </form>
      </Modal>

      {/* Inline Quick Add Supplier Modal */}
      <Modal
        isOpen={showInlineSupplierModal}
        onClose={() => {
          if (!isSavingInlineSupplier) {
            setShowInlineSupplierModal(false);
            setInlineSupplierError(null);
          }
        }}
        title="Quick Add New Supplier"
        maxWidth="md"
      >
        <form onSubmit={handleSaveInlineSupplier} className="space-y-3 text-xs">
          {inlineSupplierError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{inlineSupplierError}</span>
            </div>
          )}
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
                onChange={(e) => setInlineSupplierForm({ ...inlineSupplierForm, gstin: e.target.value.toUpperCase() })}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono uppercase"
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
              disabled={isSavingInlineSupplier}
              onClick={() => {
                setShowInlineSupplierModal(false);
                setInlineSupplierError(null);
              }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingInlineSupplier}
              className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSavingInlineSupplier ? 'Creating & Selecting...' : 'Create & Select Supplier'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Inline Quick Add Medicine Modal */}
      <Modal isOpen={showInlineMedicineModal} onClose={() => setShowInlineMedicineModal(false)} title="Add Medicine to Master Catalogue" maxWidth="2xl">
        <form onSubmit={handleSaveInlineMedicine} className="space-y-4 text-xs">
          {inlineMedicineError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{inlineMedicineError}</span>
            </div>
          )}

          {/* Section 1: Medicine & Batch Details */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <span>1. Medicine & Batch Information</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Medicine Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Paracetamol 500mg"
                  value={inlineMedicineForm.brandName}
                  onChange={(e) => handleInlineMedicineChange('brandName', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Batch Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. BATCH-001"
                  value={inlineMedicineForm.batchNumber}
                  onChange={(e) => handleInlineMedicineChange('batchNumber', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={inlineMedicineForm.expiryDate}
                  onChange={(e) => handleInlineMedicineChange('expiryDate', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  HSN Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 30049099"
                  value={inlineMedicineForm.hsnCode}
                  onChange={(e) => handleInlineMedicineChange('hsnCode', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Manufacturer <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Micro Labs Ltd"
                  value={inlineMedicineForm.manufacturer}
                  onChange={(e) => handleInlineMedicineChange('manufacturer', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Box & Strip Packaging */}
          <div className="p-3 bg-emerald-50/30 rounded-xl border border-emerald-200 space-y-3">
            <p className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider">
              2. Packaging & Units (Formulas: Total Units = Strip Qty in Box × Strip Unit Qty)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Strip Qty in Box <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="e.g. 10"
                  value={inlineMedicineForm.stripQuantityInBox}
                  onChange={(e) => handleInlineMedicineChange('stripQuantityInBox', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">Number of strips per box.</span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Strip Unit Qty <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="e.g. 10"
                  value={inlineMedicineForm.stripUnitQuantity}
                  onChange={(e) => handleInlineMedicineChange('stripUnitQuantity', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">Tablets per strip.</span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center justify-between">
                  <span>Total Units</span>
                  <span className="text-[10px] text-emerald-700 font-normal">Formula</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={inlineMedicineForm.totalUnits}
                  className="w-full px-3 py-2 text-xs bg-emerald-50/60 border border-emerald-300 rounded-lg font-mono font-bold text-emerald-900 cursor-not-allowed"
                />
                <span className="text-[10px] text-emerald-700 block mt-0.5">Total tablets (Box × Strip).</span>
              </div>

              <div>
                <label className="text-xs font-bold text-emerald-900 block mb-1 flex items-center justify-between">
                  <span>Physical Units</span>
                  <span className="text-[10px] text-slate-500 font-normal">Editable</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={inlineMedicineForm.pharmacyPhysicalUnits}
                  onChange={(e) => handleInlineMedicineChange('pharmacyPhysicalUnits', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-emerald-400 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">Initial physical count.</span>
              </div>
            </div>
          </div>

          {/* Section 3: Strip & Unit Pricing */}
          <div className="p-3 bg-amber-50/30 rounded-xl border border-amber-200 space-y-3">
            <p className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
              3. Pricing Structure (Formulas: Unit Price = Strip Price ÷ Strip Unit Qty)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-bold text-blue-900 block mb-1">
                  Strip Purchase Price (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 10.00"
                  value={inlineMedicineForm.stripPurchasePrice}
                  onChange={(e) => handleInlineMedicineChange('stripPurchasePrice', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-blue-200 rounded-lg font-mono font-bold text-blue-900 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">Purchase cost per strip.</span>
              </div>

              <div>
                <label className="text-xs font-bold text-amber-900 block mb-1">
                  Strip MRP Price (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="e.g. 20.00"
                  value={inlineMedicineForm.stripMrpPrice}
                  onChange={(e) => handleInlineMedicineChange('stripMrpPrice', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-amber-300 rounded-lg font-mono font-bold text-amber-900 focus:ring-2 focus:ring-amber-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">Retail MRP per strip.</span>
              </div>

              <div>
                <label className="text-xs font-bold text-blue-900 block mb-1 flex items-center justify-between">
                  <span>Pur Unit Price (₹)</span>
                  <span className="text-[10px] text-blue-700 font-normal">Formula</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={inlineMedicineForm.purchaseUnitPrice}
                  className="w-full px-3 py-2 text-xs bg-blue-50/50 border border-blue-200 rounded-lg font-mono font-bold text-blue-900 cursor-not-allowed"
                />
                <span className="text-[10px] text-blue-700 block mt-0.5">Cost per tablet.</span>
              </div>

              <div>
                <label className="text-xs font-bold text-emerald-900 block mb-1 flex items-center justify-between">
                  <span>Unit Selling Price (₹)</span>
                  <span className="text-[10px] text-emerald-700 font-normal">Formula</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={inlineMedicineForm.unitSellingPrice}
                  className="w-full px-3 py-2 text-xs bg-emerald-50/50 border border-emerald-300 rounded-lg font-mono font-bold text-emerald-900 cursor-not-allowed"
                />
                <span className="text-[10px] text-emerald-700 block mt-0.5">MRP per tablet.</span>
              </div>
            </div>
          </div>

          {/* Section 4: Tax */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">GST Rate (%) *</label>
            <select
              value={inlineMedicineForm.gstRate}
              onChange={(e) => handleInlineMedicineChange('gstRate', e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold focus:ring-2 focus:ring-emerald-500"
            >
              <option value="5.0">5% (CGST 2.5% + SGST 2.5%)</option>
              <option value="12.0">12%</option>
              <option value="18.0">18%</option>
              <option value="28.0">28%</option>
              <option value="0.0">0% (Nil)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              disabled={isSavingInlineMedicine}
              onClick={() => setShowInlineMedicineModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingInlineMedicine}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50 shadow-xs flex items-center gap-1.5"
            >
              {isSavingInlineMedicine ? 'Saving & Linking...' : 'Save & Link Medicine'}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {/* Super Admin Bulk Delete Invoices Confirmation Modal */}
      {showBulkDeleteInvoicesModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowBulkDeleteInvoicesModal(false)}
          title={`Confirm Bulk Deletion: ${selectedInvoiceIds.length} Purchase Invoices`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                Administrative Deletion Safeguard
              </span>
              <p className="text-[11px]">
                You are about to delete <strong>{selectedInvoiceIds.length}</strong> purchase invoices. Invoices with recorded supplier returns or active batch sales will be protected to ensure financial integrity.
              </p>
            </div>
            <p className="text-slate-600">
              Are you sure you want to proceed with deleting the selected purchase invoices?
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowBulkDeleteInvoicesModal(false)}
                className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-slate-700 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isBulkDeletingInvoices}
                onClick={handleBulkDeleteInvoices}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-1.5"
              >
                {isBulkDeletingInvoices ? 'Deleting...' : 'Confirm Bulk Deletion'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Super Admin Bulk Delete Suppliers Confirmation Modal */}
      {showBulkDeleteSuppliersModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowBulkDeleteSuppliersModal(false)}
          title={`Confirm Bulk Deletion: ${selectedSupplierIds.length} Suppliers`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                Supplier Dependency Check
              </span>
              <p className="text-[11px]">
                You are about to delete <strong>{selectedSupplierIds.length}</strong> supplier records. Suppliers with existing purchase invoices or active inventory batches will be protected to protect ledger history.
              </p>
            </div>
            <p className="text-slate-600">
              Are you sure you want to proceed with deleting the selected suppliers?
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowBulkDeleteSuppliersModal(false)}
                className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-slate-700 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isBulkDeletingSuppliers}
                onClick={handleBulkDeleteSuppliers}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-1.5"
              >
                {isBulkDeletingSuppliers ? 'Deleting...' : 'Confirm Bulk Deletion'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
