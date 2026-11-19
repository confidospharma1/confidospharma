import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MedicineProduct, Supplier } from '../types';
import { Pill, Plus, Search, Filter, AlertCircle, CheckCircle, Barcode, DollarSign, Edit2, Trash2, X, CheckSquare, Boxes } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { FilterButton } from '../components/FilterButton';
import { FilterField, FilterSelect, FilterInput } from '../components/FilterControls';
import { PermissionDeniedModal } from '../components/PermissionDeniedModal';

export const ProductsPage: React.FC = () => {
  const { isSuperAdmin, isBillingUser, currentBranch, selectedBranchId } = useAuth();
  const effectiveBranchId = isSuperAdmin ? (selectedBranchId || currentBranch?.id) : currentBranch?.id;

  const [products, setProducts] = useState<MedicineProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formFilter, setFormFilter] = useState('');
  const [rxFilter, setRxFilter] = useState('');
  const [mfgFilter, setMfgFilter] = useState('');
  const [minMrp, setMinMrp] = useState('');
  const [maxMrp, setMaxMrp] = useState('');
  const [hsnStatus, setHsnStatus] = useState('');

  // Permission Restriction Modal for Branch Admin
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  const activeFilterCount = [
    formFilter,
    rxFilter,
    mfgFilter,
    minMrp,
    maxMrp,
    hsnStatus,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setFormFilter('');
    setRxFilter('');
    setMfgFilter('');
    setMinMrp('');
    setMaxMrp('');
    setHsnStatus('');
  };

  // Branches for Super Admin initial stock allocation
  const [branches, setBranches] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    api.getSuppliers().then((res) => {
      if (Array.isArray(res)) setSuppliers(res);
      else if (res?.data && Array.isArray(res.data)) setSuppliers(res.data);
    }).catch(() => {});

    if (isSuperAdmin) {
      api.getBranches().then((res) => {
        if (Array.isArray(res)) setBranches(res);
        else if (res?.data && Array.isArray(res.data)) setBranches(res.data);
      }).catch(() => {});
    }
  }, [isSuperAdmin]);

  // Add Product Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalError, setAddModalError] = useState<string | null>(null);
  const [addModalFieldErrors, setAddModalFieldErrors] = useState<Record<string, string>>({});
  const [isSavingProduct, setIsSavingProduct] = useState(false);

  const handleOpenAddModal = () => {
    setAddModalError(null);
    setAddModalFieldErrors({});
    setAddForm((prev) => ({
      ...prev,
      targetBranchId: effectiveBranchId || prev.targetBranchId || '',
    }));
    setShowAddModal(true);
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setAddModalError(null);
    setAddModalFieldErrors({});
  };
  const initialAddForm = {
    brandName: '',
    batchNumber: '',
    expiryDate: '',
    hsnCode: '',
    manufacturer: '',
    stripQuantityInBox: '10',
    stripUnitQuantity: '10',
    totalUnits: '100',
    pharmacyPhysicalUnits: '100',
    stripPurchasePrice: '10',
    stripMrpPrice: '20',
    purchaseUnitPrice: '1.00',
    unitSellingPrice: '2.00',
    gstRate: '5',
    barcode: '',
    reorderLevel: '10',
    prescriptionType: 'OTC',
    targetBranchId: '',
  };
  const [addForm, setAddForm] = useState(initialAddForm);

  const handleAddFormChange = (field: string, value: string) => {
    setAddForm((prev) => {
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

    if (addModalFieldErrors[field]) {
      setAddModalFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
  };

  // Edit Product Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MedicineProduct | null>(null);
  const [editForm, setEditForm] = useState({
    brandName: '',
    manufacturer: '',
    quantity: '0',
    defaultPurchaseRate: '',
    mrp: '',
    gstRate: '5',
    hsnCode: '',
    barcode: '',
    reorderLevel: '10',
    prescriptionType: 'OTC',
    isActive: true,
  });

  // Delete/Archive Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<MedicineProduct | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Super Admin Bulk Deletions
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showBulkDeleteProductsModal, setShowBulkDeleteProductsModal] = useState(false);
  const [isBulkDeletingProducts, setIsBulkDeletingProducts] = useState(false);

  const toggleSelectProduct = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllProducts = (displayed: MedicineProduct[]) => {
    const displayedIds = displayed.map((p) => p.id);
    const isAllDisplayedSelected =
      displayedIds.length > 0 && displayedIds.every((id) => selectedProductIds.includes(id));
    if (isAllDisplayedSelected) {
      setSelectedProductIds((prev) => prev.filter((id) => !displayedIds.includes(id)));
    } else {
      setSelectedProductIds((prev) => Array.from(new Set([...prev, ...displayedIds])));
    }
  };

  const handleBulkDeleteProducts = async () => {
    if (selectedProductIds.length === 0) return;
    setIsBulkDeletingProducts(true);
    try {
      const res = await api.bulkDeleteProducts(selectedProductIds);
      setMessage({
        text: res.message || `Successfully processed bulk deletion for ${selectedProductIds.length} products.`,
        type: 'success',
      });
      setSelectedProductIds([]);
      setShowBulkDeleteProductsModal(false);
      loadProducts();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to bulk delete products.', type: 'error' });
    } finally {
      setIsBulkDeletingProducts(false);
    }
  };

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await api.getProducts({
        search,
        limit: 100,
        branchId: effectiveBranchId || undefined,
      });
      setProducts(data.products || []);
    } catch (err) {
      // Product load error handled in UI
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, effectiveBranchId]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingProduct) return;
    setAddModalError(null);
    setAddModalFieldErrors({});

    // Client-side required field and format validation for the 13 columns
    const fieldErrors: Record<string, string> = {};
    const missingLabels: string[] = [];

    if (!addForm.brandName.trim()) {
      fieldErrors.brandName = 'Medicine Name is required.';
      missingLabels.push('Medicine Name');
    }
    if (!addForm.manufacturer.trim()) {
      fieldErrors.manufacturer = 'Manufacturer is required.';
      missingLabels.push('Manufacturer');
    }
    if (!addForm.stripQuantityInBox || isNaN(Number(addForm.stripQuantityInBox)) || Number(addForm.stripQuantityInBox) <= 0) {
      fieldErrors.stripQuantityInBox = 'Strip Quantity in Box must be greater than 0.';
      missingLabels.push('Strip Quantity in Box');
    }
    if (!addForm.stripUnitQuantity || isNaN(Number(addForm.stripUnitQuantity)) || Number(addForm.stripUnitQuantity) <= 0) {
      fieldErrors.stripUnitQuantity = 'Strip Unit Quantity (Tablets per Strip) must be greater than 0.';
      missingLabels.push('Strip Unit Quantity');
    }
    if (!addForm.stripMrpPrice || isNaN(Number(addForm.stripMrpPrice)) || Number(addForm.stripMrpPrice) < 0) {
      fieldErrors.stripMrpPrice = 'Strip MRP Price must be a valid number.';
      missingLabels.push('Strip MRP Price');
    }
    if (addForm.stripPurchasePrice && (isNaN(Number(addForm.stripPurchasePrice)) || Number(addForm.stripPurchasePrice) < 0)) {
      fieldErrors.stripPurchasePrice = 'Strip Purchase Price cannot be negative.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      setAddModalFieldErrors(fieldErrors);
      if (missingLabels.length > 0) {
        setAddModalError(`Please complete all required fields before saving the medicine: ${missingLabels.join(', ')}.`);
      } else {
        setAddModalError('Please correct the invalid input fields before saving.');
      }
      return;
    }

    setIsSavingProduct(true);
    try {
      const stripQty = parseFloat(addForm.stripQuantityInBox) || 0;
      const stripUnitQty = parseFloat(addForm.stripUnitQuantity) || 1;
      const computedTotalUnits = stripQty * stripUnitQty;
      const physicalUnits = addForm.pharmacyPhysicalUnits ? parseFloat(addForm.pharmacyPhysicalUnits) : computedTotalUnits;
      const stripPur = parseFloat(addForm.stripPurchasePrice) || 0;
      const stripMrp = parseFloat(addForm.stripMrpPrice) || 0;
      const purUnitPrice = stripUnitQty > 0 ? Number((stripPur / stripUnitQty).toFixed(4)) : 0;
      const unitSellPrice = stripUnitQty > 0 ? Number((stripMrp / stripUnitQty).toFixed(4)) : 0;

      const res = await api.createProduct({
        brandName: addForm.brandName.trim(),
        genericName: addForm.brandName.trim(),
        dosageForm: 'Tablet',
        manufacturer: addForm.manufacturer.trim(),
        packSize: `${stripUnitQty} Tablets / Strip`,
        baseUnit: 'Tablet',
        packageUnit: 'Strip',
        conversionFactor: stripUnitQty,
        hsnCode: addForm.hsnCode.trim() || undefined,
        gstRate: parseFloat(addForm.gstRate) || 5,
        mrp: stripMrp,
        defaultPurchaseRate: stripPur,
        defaultSellingRate: stripMrp,
        reorderLevel: addForm.reorderLevel ? parseInt(addForm.reorderLevel) : 10,
        barcode: addForm.barcode.trim() || undefined,
        prescriptionType: addForm.prescriptionType || 'OTC',
        initialQuantity: physicalUnits,
        batchNumber: addForm.batchNumber.trim() || undefined,
        expiryDate: addForm.expiryDate || undefined,
        branchId: addForm.targetBranchId || undefined,

        // 13 standard pharma columns
        stripQuantityInBox: stripQty,
        stripUnitQuantity: stripUnitQty,
        totalUnits: computedTotalUnits,
        pharmacyPhysicalUnits: physicalUnits,
        stripPurchasePrice: stripPur,
        stripMrpPrice: stripMrp,
        purchaseUnitPrice: purUnitPrice,
        unitSellingPrice: unitSellPrice,
      });
      const stockMsg = physicalUnits > 0
        ? ` with ${physicalUnits} tablets opening stock.`
        : ' (Out of Stock).';
      setMessage({ text: `Medicine '${addForm.brandName}' added to master catalogue${stockMsg}`, type: 'success' });
      setShowAddModal(false);
      setAddForm({ ...initialAddForm, targetBranchId: effectiveBranchId || '' });
      setAddModalError(null);
      setAddModalFieldErrors({});
      loadProducts();
    } catch (err: any) {
      const backendData = err.data;
      if (backendData?.missingFields && Array.isArray(backendData.missingFields)) {
        const mappedErrors: Record<string, string> = {};
        backendData.missingFields.forEach((f: string) => {
          mappedErrors[f] = `${f} is required or invalid.`;
        });
        setAddModalFieldErrors(mappedErrors);
      }
      const errMessage = backendData?.message || err.message || 'Failed to create medicine.';
      if (err.status === 409) {
        setAddModalError(`Duplicate product detected: ${errMessage}`);
        setAddModalFieldErrors((prev) => ({
          ...prev,
          brandName: prev.brandName || 'Brand name matches an existing record.',
        }));
      } else if (err.status === 400 || err.status === 422) {
        setAddModalError(errMessage);
      } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setAddModalError('Network error: You appear to be offline. Please verify your connection.');
      } else {
        setAddModalError(errMessage || 'A server error occurred while saving. Please try again.');
      }
    } finally {
      setIsSavingProduct(false);
    }
  };

  const openEdit = (p: MedicineProduct) => {
    if (!isSuperAdmin) {
      setShowPermissionModal(true);
      return;
    }
    setEditingProduct(p);
    setEditForm({
      brandName: p.brandName,
      manufacturer: p.manufacturer,
      quantity: String(p.totalAvailableStock !== undefined && p.totalAvailableStock !== null ? p.totalAvailableStock : (p.activeBatches?.reduce((sum: number, b: any) => sum + (b.availableQuantity || 0), 0) ?? 0)),
      hsnCode: p.hsnCode || '',
      gstRate: String(p.gstRate ?? 5),
      mrp: String(p.mrp ?? 0),
      defaultPurchaseRate: p.defaultPurchaseRate !== undefined && p.defaultPurchaseRate !== null ? String(p.defaultPurchaseRate) : '',
      reorderLevel: String(p.reorderLevel || 10),
      barcode: p.barcode || '',
      prescriptionType: p.prescriptionType || 'OTC',
      isActive: p.isActive !== false,
    });
    setShowEditModal(true);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setMessage(null);
    try {
      await api.updateProduct(editingProduct.id, {
        brandName: editForm.brandName.trim(),
        genericName: editForm.brandName.trim(),
        manufacturer: editForm.manufacturer.trim(),
        quantity: editForm.quantity !== '' ? parseInt(editForm.quantity) : 0,
        branchId: effectiveBranchId || undefined,
        hsnCode: editForm.hsnCode.trim() || undefined,
        defaultPurchaseRate: editForm.defaultPurchaseRate ? parseFloat(editForm.defaultPurchaseRate) : null,
        reorderLevel: editForm.reorderLevel ? parseInt(editForm.reorderLevel) : 10,
        mrp: parseFloat(editForm.mrp),
        gstRate: parseFloat(editForm.gstRate),
        barcode: editForm.barcode.trim() || undefined,
        prescriptionType: editForm.prescriptionType || 'OTC',
        isActive: editForm.isActive,
      });
      setMessage({ text: `Medicine '${editForm.brandName}' updated successfully.`, type: 'success' });
      setShowEditModal(false);
      loadProducts();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update medicine.', type: 'error' });
    }
  };

  const handleDeleteProduct = async () => {
    if (!deleteTarget) return;
    setMessage(null);
    try {
      const res = await api.deleteProduct(deleteTarget.id);
      setMessage({ text: res.message || `Medicine '${deleteTarget.brandName}' removed / archived successfully.`, type: 'success' });
      setShowDeleteModal(false);
      setDeleteTarget(null);
      loadProducts();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to delete/archive medicine.', type: 'error' });
    }
  };

  const filteredProducts = products.filter((p) => {
    if (formFilter && p.dosageForm.toLowerCase() !== formFilter.toLowerCase()) return false;
    if (rxFilter && p.prescriptionType !== rxFilter) return false;
    if (mfgFilter && !p.manufacturer?.toLowerCase().includes(mfgFilter.toLowerCase())) return false;
    if (minMrp && p.mrp < parseFloat(minMrp)) return false;
    if (maxMrp && p.mrp > parseFloat(maxMrp)) return false;
    if (hsnStatus === 'WITH_HSN' && !p.hsnCode) return false;
    if (hsnStatus === 'WITHOUT_HSN' && p.hsnCode) return false;
    return true;
  });

  return (
    <div className="p-3.5 sm:p-5 md:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Medicine Master Catalogue</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Central pharmaceutical master data with distinct MRP, Default Purchase Rate, and optional HSN.
          </p>
        </div>

        {!isBillingUser && (
          <button
            onClick={handleOpenAddModal}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors self-stretch sm:self-start"
          >
            <Plus className="w-4 h-4" />
            Add New Medicine
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

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Brand Name, Manufacturer, Barcode..."
              className="w-full pl-10 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <FilterButton
              activeCount={activeFilterCount}
              onReset={resetFilters}
              title="Filter Medicine Catalogue"
              buttonLabel="Filter Medicines"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FilterField label="Dosage Form">
                  <FilterSelect
                    value={formFilter}
                    onChange={(e) => setFormFilter(e.target.value)}
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

                <FilterField label="Prescription Schedule">
                  <FilterSelect
                    value={rxFilter}
                    onChange={(e) => setRxFilter(e.target.value)}
                    options={[
                      { label: 'All Schedules', value: '' },
                      { label: 'OTC (Over-The-Counter)', value: 'OTC' },
                      { label: 'Schedule H', value: 'Schedule H' },
                      { label: 'Schedule H1', value: 'Schedule H1' },
                      { label: 'Schedule X', value: 'Schedule X' },
                    ]}
                  />
                </FilterField>

                <FilterField label="Manufacturer / Lab" className="sm:col-span-2">
                  <FilterInput
                    type="text"
                    placeholder="e.g. Cipla, Sun Pharma, Dr. Reddy's..."
                    value={mfgFilter}
                    onChange={(e) => setMfgFilter(e.target.value)}
                  />
                </FilterField>

                <FilterField label="Min MRP (₹)">
                  <FilterInput
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={minMrp}
                    onChange={(e) => setMinMrp(e.target.value)}
                  />
                </FilterField>

                <FilterField label="Max MRP (₹)">
                  <FilterInput
                    type="number"
                    min="0"
                    placeholder="5000.00"
                    value={maxMrp}
                    onChange={(e) => setMaxMrp(e.target.value)}
                  />
                </FilterField>

                <FilterField label="HSN Tax Code Status" className="sm:col-span-2">
                  <FilterSelect
                    value={hsnStatus}
                    onChange={(e) => setHsnStatus(e.target.value)}
                    options={[
                      { label: 'All Products (HSN & Non-HSN)', value: '' },
                      { label: 'Configured with HSN Code', value: 'WITH_HSN' },
                      { label: 'Missing HSN Code', value: 'WITHOUT_HSN' },
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
            {formFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Form: {formFilter}
                <button type="button" onClick={() => setFormFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {rxFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Schedule: {rxFilter}
                <button type="button" onClick={() => setRxFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {mfgFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Mfg: {mfgFilter}
                <button type="button" onClick={() => setMfgFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {(minMrp || maxMrp) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                MRP: ₹{minMrp || '0'} - {maxMrp ? `₹${maxMrp}` : 'Any'}
                <button
                  type="button"
                  onClick={() => {
                    setMinMrp('');
                    setMaxMrp('');
                  }}
                  className="hover:text-brand-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {hsnStatus && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                HSN: {hsnStatus === 'WITH_HSN' ? 'Configured' : 'Missing'}
                <button type="button" onClick={() => setHsnStatus('')} className="hover:text-brand-900">
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

      {/* Super Admin Bulk Products Action Bar */}
      {isSuperAdmin && selectedProductIds.length > 0 && (
        <div className="flex items-center justify-between bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-xs text-rose-800">
          <span className="font-semibold flex items-center gap-1.5">
            <CheckSquare className="w-4 h-4 text-rose-600" />
            {selectedProductIds.length} medicine products selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedProductIds([])}
              className="px-2.5 py-1 text-slate-600 hover:text-slate-800 text-[11px] font-semibold"
            >
              Clear Selection
            </button>
            <button
              type="button"
              onClick={() => setShowBulkDeleteProductsModal(true)}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedProductIds.length})
            </button>
          </div>
        </div>
      )}

      {/* Products Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto touch-scroll">
          <table className="w-full text-left text-xs min-w-[1100px]">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                {isSuperAdmin && (
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredProducts.length > 0 &&
                        filteredProducts.every((p) => selectedProductIds.includes(p.id))
                      }
                      onChange={() => toggleSelectAllProducts(filteredProducts)}
                      className="rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                  </th>
                )}
                <th className="py-3 px-4">Internal Code</th>
                <th className="py-3 px-4">Medicine Brand Name</th>
                <th className="py-3 px-3">Manufacturer</th>
                <th className="py-3 px-3 text-center">Packaging (Tabs/Strip)</th>
                <th className="py-3 px-3 text-center bg-emerald-50/50 text-emerald-900">Physical Stock</th>
                <th className="py-3 px-3 text-center">HSN Code</th>
                <th className="py-3 px-3 text-center">GST</th>
                <th className="py-3 px-3 text-right bg-blue-50/50 text-blue-900">Strip Pur Price</th>
                <th className="py-3 px-3 text-right bg-amber-50/50 text-amber-900">Strip MRP</th>
                <th className="py-3 px-3 text-right bg-emerald-50/50 text-emerald-900">Unit MRP (/Tab)</th>
                {!isBillingUser && <th className="py-3 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={isSuperAdmin ? (isBillingUser ? 10 : 11) : (isBillingUser ? 9 : 10)} className="py-8 text-center text-slate-400">
                    Loading medicines catalogue...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? (isBillingUser ? 10 : 11) : (isBillingUser ? 9 : 10)} className="py-12 text-center text-slate-500">
                    <p className="text-sm font-bold text-slate-800">No medicines found.</p>
                    <p className="text-xs text-slate-500 mt-1">Add a medicine to begin managing your inventory catalogue.</p>
                    {!isBillingUser && (
                      <button
                        onClick={handleOpenAddModal}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add First Medicine
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    {isSuperAdmin && (
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(p.id)}
                          onChange={() => toggleSelectProduct(p.id)}
                          className="rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">{p.internalCode}</td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{p.brandName}</span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 truncate max-w-[140px]">{p.manufacturer}</td>
                    <td className="py-3 px-3 text-center font-mono text-[11px] text-slate-700">
                      {p.stripUnitQuantity || p.conversionFactor || 1} Units / Strip
                    </td>
                    <td className="py-3 px-3 text-center bg-emerald-50/10">
                      {(p.totalAvailableStock || 0) > 0 ? (
                        <Badge variant="brandGreen" size="sm">
                          {p.totalAvailableStock} Tablets
                        </Badge>
                      ) : (
                        <span className="text-slate-400 font-mono text-[11px]">0 Tablets</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-600">
                      {p.hsnCode || <span className="text-slate-400 italic">None</span>}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">{p.gstRate}%</td>
                    <td className="py-3 px-3 text-right font-mono text-blue-800 bg-blue-50/20">
                      {p.stripPurchasePrice ? `₹${p.stripPurchasePrice.toFixed(2)}` : (p.defaultPurchaseRate ? `₹${p.defaultPurchaseRate.toFixed(2)}` : <span className="text-slate-400">—</span>)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 bg-amber-50/20">
                      ₹{(p.stripMrpPrice || p.mrp || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-800 bg-emerald-50/20">
                      ₹{(p.unitSellingPrice || ((p.stripMrpPrice || p.mrp || 0) / (p.stripUnitQuantity || p.conversionFactor || 1))).toFixed(2)}
                    </td>
                    {!isBillingUser && (
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            title="Edit Medicine Details & Pricing"
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!isSuperAdmin) {
                                setShowPermissionModal(true);
                                return;
                              }
                              setDeleteTarget(p);
                              setShowDeleteModal(true);
                            }}
                            title="Archive / Remove Medicine"
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add New Medicine */}
      <Modal isOpen={showAddModal} onClose={handleCloseAddModal} title="Add Medicine to Master Catalogue" maxWidth="2xl">
        <form onSubmit={handleCreateProduct} noValidate className="space-y-4">
          {addModalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-rose-900">{addModalError}</p>
                {Object.keys(addModalFieldErrors).length > 0 && (
                  <ul className="mt-1 list-disc list-inside text-[11px] text-rose-700 space-y-0.5 font-medium">
                    {Object.values(addModalFieldErrors).map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Section 1: Medicine & Batch Details (Cols A - E) */}
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
                  value={addForm.brandName}
                  onChange={(e) => handleAddFormChange('brandName', e.target.value)}
                  className={`w-full px-3 py-2 text-xs bg-white border rounded-lg focus:ring-2 font-medium ${
                    addModalFieldErrors.brandName
                      ? 'border-rose-400 bg-rose-50/20 focus:ring-rose-500'
                      : 'border-slate-300 focus:ring-emerald-500'
                  }`}
                />
                {addModalFieldErrors.brandName && (
                  <span className="text-[11px] text-rose-600 font-semibold block mt-1">
                    {addModalFieldErrors.brandName}
                  </span>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Batch Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. BATCH-001"
                  value={addForm.batchNumber}
                  onChange={(e) => handleAddFormChange('batchNumber', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={addForm.expiryDate}
                  onChange={(e) => handleAddFormChange('expiryDate', e.target.value)}
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
                  value={addForm.hsnCode}
                  onChange={(e) => handleAddFormChange('hsnCode', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Manufacturer <span className="text-rose-500">*</span>
                  </label>
                  {suppliers.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 font-medium">Quick Select:</span>
                      <select
                        onChange={(e) => {
                          if (e.target.value) handleAddFormChange('manufacturer', e.target.value);
                        }}
                        defaultValue=""
                        className="text-[11px] bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-800 font-semibold focus:ring-1 focus:ring-emerald-500 cursor-pointer shadow-xs"
                      >
                        <option value="">-- Choose Registered Supplier --</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cipla Ltd / Sun Pharma"
                  value={addForm.manufacturer}
                  onChange={(e) => handleAddFormChange('manufacturer', e.target.value)}
                  className={`w-full px-3 py-2 text-xs bg-white border rounded-lg focus:ring-2 ${
                    addModalFieldErrors.manufacturer
                      ? 'border-rose-400 bg-rose-50/20 focus:ring-rose-500'
                      : 'border-slate-300 focus:ring-emerald-500'
                  }`}
                />
                {addModalFieldErrors.manufacturer && (
                  <span className="text-[11px] text-rose-600 font-semibold block mt-1">
                    {addModalFieldErrors.manufacturer}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Box & Strip Packaging (Cols F - I) */}
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
                  value={addForm.stripQuantityInBox}
                  onChange={(e) => handleAddFormChange('stripQuantityInBox', e.target.value)}
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
                  value={addForm.stripUnitQuantity}
                  onChange={(e) => handleAddFormChange('stripUnitQuantity', e.target.value)}
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
                  value={addForm.totalUnits}
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
                  value={addForm.pharmacyPhysicalUnits}
                  onChange={(e) => handleAddFormChange('pharmacyPhysicalUnits', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-emerald-400 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">Initial physical count.</span>
              </div>
            </div>
          </div>

          {/* Section 3: Strip & Unit Pricing (Cols J - M) */}
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
                  value={addForm.stripPurchasePrice}
                  onChange={(e) => handleAddFormChange('stripPurchasePrice', e.target.value)}
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
                  value={addForm.stripMrpPrice}
                  onChange={(e) => handleAddFormChange('stripMrpPrice', e.target.value)}
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
                  value={addForm.purchaseUnitPrice}
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
                  value={addForm.unitSellingPrice}
                  className="w-full px-3 py-2 text-xs bg-emerald-50/50 border border-emerald-300 rounded-lg font-mono font-bold text-emerald-900 cursor-not-allowed"
                />
                <span className="text-[10px] text-emerald-700 block mt-0.5">MRP per tablet.</span>
              </div>
            </div>
          </div>

          {/* Section 4: Tax, Restriction & Branch */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">GST Rate (%) *</label>
              <select
                value={addForm.gstRate}
                onChange={(e) => handleAddFormChange('gstRate', e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
              >
                <option value="5">5% (CGST 2.5% + SGST 2.5%)</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
                <option value="0">0% (Nil)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Schedule / Restriction</label>
              <select
                value={addForm.prescriptionType}
                onChange={(e) => handleAddFormChange('prescriptionType', e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="OTC">OTC (Over the Counter)</option>
                <option value="Schedule H">Schedule H (Prescription)</option>
                <option value="Schedule H1">Schedule H1 (Controlled Drug)</option>
                <option value="Schedule X">Schedule X (Narcotic/Restricted)</option>
              </select>
            </div>

            {isSuperAdmin && branches.length > 0 && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Target Branch for Stock</label>
                <select
                  value={addForm.targetBranchId}
                  onChange={(e) => handleAddFormChange('targetBranchId', e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-medium"
                >
                  <option value="">Default Branch ({branches[0]?.name || 'Primary Branch'})</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              disabled={isSavingProduct}
              onClick={handleCloseAddModal}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingProduct}
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSavingProduct ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving Medicine...</span>
                </>
              ) : (
                'Save Medicine to Catalogue'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Medicine */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Medicine Master Record" maxWidth="2xl">
        <form onSubmit={handleUpdateProduct} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Brand Name *</label>
              <input
                type="text"
                required
                value={editForm.brandName}
                onChange={(e) => setEditForm({ ...editForm, brandName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-medium"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Manufacturer *</label>
              <input
                type="text"
                required
                value={editForm.manufacturer}
                onChange={(e) => setEditForm({ ...editForm, manufacturer: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-emerald-800 block mb-1">Quantity (Units)</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g., 100"
                value={editForm.quantity}
                onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-emerald-50/50 border border-emerald-300 rounded-lg font-mono font-bold text-emerald-950 focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-[10px] text-slate-500 block mt-0.5 leading-tight">Total available stock units.</span>
            </div>
          </div>

          {/* Pricing Structure: Default Purchase Rate & MRP (Default Selling Rate completely removed) */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Pricing Structure & Rates
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-blue-900 block mb-1">Default Purchase Rate</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 15.00"
                  value={editForm.defaultPurchaseRate}
                  onChange={(e) => setEditForm({ ...editForm, defaultPurchaseRate: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-blue-200 rounded-lg font-mono font-bold text-blue-900 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5 leading-tight">The price paid to purchase one unit from a supplier.</span>
              </div>
              <div>
                <label className="text-xs font-bold text-amber-900 block mb-1">Maximum Retail Price (MRP) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="e.g., 25.00"
                  value={editForm.mrp}
                  onChange={(e) => setEditForm({ ...editForm, mrp: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-amber-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5 leading-tight">The maximum retail price printed on packaging.</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
                HSN Code <span className="text-[10px] text-emerald-600 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={editForm.hsnCode}
                onChange={(e) => setEditForm({ ...editForm, hsnCode: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">GST Rate (%) *</label>
              <select
                value={editForm.gstRate}
                onChange={(e) => setEditForm({ ...editForm, gstRate: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
              >
                <option value="5">5% (CGST 2.5% + SGST 2.5%)</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
                <option value="0">0% (Nil)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Barcode / EAN</label>
              <input
                type="text"
                value={editForm.barcode}
                onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Reorder Alert (Qty)</label>
              <input
                type="number"
                value={editForm.reorderLevel}
                onChange={(e) => setEditForm({ ...editForm, reorderLevel: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Schedule / Restriction</label>
              <select
                value={editForm.prescriptionType}
                onChange={(e) => setEditForm({ ...editForm, prescriptionType: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="OTC">OTC (Over the Counter)</option>
                <option value="Schedule H">Schedule H (Prescription)</option>
                <option value="Schedule H1">Schedule H1 (Controlled Drug)</option>
                <option value="Schedule X">Schedule X (Narcotic/Restricted)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="editProductActive"
                checked={editForm.isActive}
                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                className="rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
              <label htmlFor="editProductActive" className="text-xs font-bold text-slate-700 cursor-pointer">
                Active in Medicine Master Catalogue
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Delete/Archive Confirmation */}
      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Confirm Medicine Deletion / Archival" maxWidth="md">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-bold mb-1">Are you sure you want to remove this medicine?</p>
              <p>
                Medicine: <strong className="font-semibold text-slate-900">{deleteTarget?.brandName}</strong> ({deleteTarget?.internalCode})
              </p>
              <p className="text-[11px] text-rose-700 mt-1">
                If this medicine has historical batch or sales/purchase records, it will be safely deactivated/archived to preserve ledger integrity. If unreferenced, it will be permanently deleted.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteProduct}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs"
            >
              Confirm Remove / Archive
            </button>
          </div>
        </div>
      </Modal>

      {/* Super Admin Bulk Delete Products Modal */}
      {showBulkDeleteProductsModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowBulkDeleteProductsModal(false)}
          title={`Confirm Bulk Deletion: ${selectedProductIds.length} Medicine Products`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                Ledger Integrity & Batch Dependency Check
              </span>
              <p className="text-[11px]">
                You are about to delete <strong>{selectedProductIds.length}</strong> catalogue medicine products. Products with existing stock batches or historical purchase/sales lines will be archived instead of purged to preserve ledger consistency.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 max-h-36 overflow-y-auto space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
                Selected Medicines Preview ({selectedProductIds.length})
              </span>
              {products
                .filter(p => selectedProductIds.includes(p.id))
                .slice(0, 8)
                .map(p => (
                  <div key={p.id} className="flex items-center justify-between text-[11px] py-0.5 border-b border-slate-200/60 last:border-0">
                    <span className="font-semibold text-slate-800 truncate mr-2">{p.brandName}</span>
                    <span className="font-mono text-slate-500 text-[10px] shrink-0">{p.internalCode}</span>
                  </div>
                ))}
              {selectedProductIds.length > 8 && (
                <div className="text-[10px] text-slate-500 text-center pt-1 font-medium">
                  + {selectedProductIds.length - 8} more medicines selected
                </div>
              )}
            </div>
            <p className="text-slate-600">
              Are you sure you want to proceed with deleting the selected medicines?
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowBulkDeleteProductsModal(false)}
                className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-slate-700 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isBulkDeletingProducts}
                onClick={handleBulkDeleteProducts}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-1.5"
              >
                {isBulkDeletingProducts ? 'Deleting...' : 'Confirm Bulk Deletion'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Permission Restriction Modal */}
      <PermissionDeniedModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
      />
    </div>
  );
};
