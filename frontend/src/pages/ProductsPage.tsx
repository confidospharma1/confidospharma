import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MedicineProduct } from '../types';
import { Pill, Plus, Search, Filter, AlertCircle, CheckCircle, Barcode, DollarSign, Edit2, Trash2, X, CheckSquare } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { FilterButton } from '../components/FilterButton';
import { FilterField, FilterSelect, FilterInput } from '../components/FilterControls';
import { PermissionDeniedModal } from '../components/PermissionDeniedModal';

export const ProductsPage: React.FC = () => {
  const { isSuperAdmin, isBillingUser } = useAuth();

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

  // Add Product Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    internalCode: '',
    brandName: '',
    genericName: '',
    strength: '',
    dosageForm: 'Tablet',
    manufacturer: '',
    packSize: '10 Tablets',
    baseUnit: 'Strip',
    hsnCode: '',
    gstRate: '5',
    mrp: '',
    defaultPurchaseRate: '',
    defaultSellingRate: '',
    reorderLevel: '10',
    barcode: '',
    prescriptionType: 'Schedule H',
    storageNotes: '',
  });

  // Edit Product Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<MedicineProduct | null>(null);
  const [editForm, setEditForm] = useState({
    brandName: '',
    genericName: '',
    strength: '',
    dosageForm: 'Tablet',
    manufacturer: '',
    packSize: '10 Tablets',
    baseUnit: 'Strip',
    hsnCode: '',
    gstRate: '5',
    mrp: '',
    defaultPurchaseRate: '',
    defaultSellingRate: '',
    reorderLevel: '10',
    barcode: '',
    prescriptionType: 'Schedule H',
    storageNotes: '',
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
    if (selectedProductIds.length === displayed.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(displayed.map((p) => p.id));
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
      const data = await api.getProducts({ search, limit: 100 });
      setProducts(data.products || []);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      await api.createProduct({
        ...addForm,
        hsnCode: addForm.hsnCode.trim() || undefined,
        defaultPurchaseRate: addForm.defaultPurchaseRate ? parseFloat(addForm.defaultPurchaseRate) : undefined,
        defaultSellingRate: addForm.defaultSellingRate ? parseFloat(addForm.defaultSellingRate) : undefined,
        reorderLevel: addForm.reorderLevel ? parseInt(addForm.reorderLevel) : 10,
      });
      setMessage({ text: `Medicine '${addForm.brandName}' added to master catalogue.`, type: 'success' });
      setShowAddModal(false);
      setAddForm({
        internalCode: '',
        brandName: '',
        genericName: '',
        strength: '',
        dosageForm: 'Tablet',
        manufacturer: '',
        packSize: '10 Tablets',
        baseUnit: 'Strip',
        hsnCode: '',
        gstRate: '5',
        mrp: '',
        defaultPurchaseRate: '',
        defaultSellingRate: '',
        reorderLevel: '10',
        barcode: '',
        prescriptionType: 'Schedule H',
        storageNotes: '',
      });
      loadProducts();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create medicine.', type: 'error' });
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
      genericName: p.genericName,
      strength: p.strength,
      dosageForm: p.dosageForm,
      manufacturer: p.manufacturer,
      packSize: p.packSize || '10 Tablets',
      baseUnit: p.baseUnit || 'Strip',
      hsnCode: p.hsnCode || '',
      gstRate: String(p.gstRate ?? 5),
      mrp: String(p.mrp ?? 0),
      defaultPurchaseRate: p.defaultPurchaseRate !== undefined && p.defaultPurchaseRate !== null ? String(p.defaultPurchaseRate) : '',
      defaultSellingRate: p.defaultSellingRate !== undefined && p.defaultSellingRate !== null ? String(p.defaultSellingRate) : '',
      reorderLevel: String(p.reorderLevel || 10),
      barcode: p.barcode || '',
      prescriptionType: p.prescriptionType || 'Schedule H',
      storageNotes: p.storageNotes || '',
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
        ...editForm,
        hsnCode: editForm.hsnCode.trim() || undefined,
        defaultPurchaseRate: editForm.defaultPurchaseRate ? parseFloat(editForm.defaultPurchaseRate) : null,
        defaultSellingRate: editForm.defaultSellingRate ? parseFloat(editForm.defaultSellingRate) : null,
        reorderLevel: editForm.reorderLevel ? parseInt(editForm.reorderLevel) : 10,
        mrp: parseFloat(editForm.mrp),
        gstRate: parseFloat(editForm.gstRate),
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
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Medicine Master Catalogue</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Central pharmaceutical master data with distinct MRP, Default Purchase Rate, Default Selling Rate, and optional HSN.
          </p>
        </div>

        {!isBillingUser && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors self-start"
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
              placeholder="Search by Brand Name, Generic, Manufacturer, Barcode..."
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                {isSuperAdmin && (
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredProducts.length > 0 &&
                        selectedProductIds.length === filteredProducts.length
                      }
                      onChange={() => toggleSelectAllProducts(filteredProducts)}
                      className="rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                  </th>
                )}
                <th className="py-3 px-4">Internal Code</th>
                <th className="py-3 px-4">Brand & Generic Name</th>
                <th className="py-3 px-3">Strength & Form</th>
                <th className="py-3 px-3">Manufacturer</th>
                <th className="py-3 px-3 text-center">HSN Code</th>
                <th className="py-3 px-3 text-center">GST</th>
                <th className="py-3 px-3 text-right bg-blue-50/50 text-blue-900">Default Pur Rate</th>
                <th className="py-3 px-3 text-right bg-brand-50/50 text-brand-900">Default Sell Rate</th>
                <th className="py-3 px-3 text-right bg-amber-50/50 text-amber-900">Standard MRP</th>
                <th className="py-3 px-3 text-center">Reorder Lvl</th>
                <th className="py-3 px-4 text-center">Category</th>
                {!isBillingUser && <th className="py-3 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={isSuperAdmin ? (isBillingUser ? 12 : 13) : (isBillingUser ? 11 : 12)} className="py-8 text-center text-slate-400">
                    Loading medicines catalogue...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? (isBillingUser ? 12 : 13) : (isBillingUser ? 11 : 12)} className="py-12 text-center text-slate-500">
                    <p className="text-sm font-bold text-slate-800">No medicines found.</p>
                    <p className="text-xs text-slate-500 mt-1">Add a medicine to begin managing your inventory catalogue.</p>
                    {!isBillingUser && (
                      <button
                        onClick={() => setShowAddModal(true)}
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
                      <span className="text-[11px] text-slate-500">{p.genericName}</span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">
                      <div>{p.strength}</div>
                      <span className="text-[10px] text-slate-500 font-sans">{p.dosageForm}</span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 truncate max-w-[140px]">{p.manufacturer}</td>
                    <td className="py-3 px-3 text-center font-mono text-slate-600">
                      {p.hsnCode || <span className="text-slate-400 italic">None</span>}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">{p.gstRate}%</td>
                    <td className="py-3 px-3 text-right font-mono text-blue-800 bg-blue-50/20">
                      {p.defaultPurchaseRate ? `₹${p.defaultPurchaseRate.toFixed(2)}` : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-brand-900 bg-brand-50/20">
                      {p.defaultSellingRate ? `₹${p.defaultSellingRate.toFixed(2)}` : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 bg-amber-50/20">
                      ₹{p.mrp.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-600">
                      {p.reorderLevel || 10}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge
                        variant={
                          p.prescriptionType === 'OTC'
                            ? 'success'
                            : p.prescriptionType === 'Schedule H1'
                            ? 'danger'
                            : 'neutral'
                        }
                        size="sm"
                      >
                        {p.prescriptionType}
                      </Badge>
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
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Medicine to Master Catalogue" maxWidth="2xl">
        <form onSubmit={handleCreateProduct} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Brand Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Dolo 650"
                value={addForm.brandName}
                onChange={(e) => setAddForm({ ...addForm, brandName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-medium"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Generic / Active Ingredient *</label>
              <input
                type="text"
                required
                placeholder="e.g. Paracetamol"
                value={addForm.genericName}
                onChange={(e) => setAddForm({ ...addForm, genericName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Strength *</label>
              <input
                type="text"
                required
                placeholder="e.g. 650 mg"
                value={addForm.strength}
                onChange={(e) => setAddForm({ ...addForm, strength: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Dosage Form *</label>
              <select
                value={addForm.dosageForm}
                onChange={(e) => setAddForm({ ...addForm, dosageForm: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Tablet">Tablet</option>
                <option value="Capsule">Capsule</option>
                <option value="Syrup">Syrup</option>
                <option value="Injection">Injection</option>
                <option value="Ointment">Ointment</option>
                <option value="Drops">Drops</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Manufacturer *</label>
              <input
                type="text"
                required
                placeholder="e.g. Micro Labs Ltd"
                value={addForm.manufacturer}
                onChange={(e) => setAddForm({ ...addForm, manufacturer: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Pricing & GST Classification Section */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Pricing Structure & Rates (Kept Strictly Separate)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-blue-900 block mb-1">Default Purchase Rate</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 15.00"
                  value={addForm.defaultPurchaseRate}
                  onChange={(e) => setAddForm({ ...addForm, defaultPurchaseRate: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-blue-200 rounded-lg font-mono font-bold text-blue-900 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5 leading-tight">The usual price paid to purchase one unit of this medicine from a supplier. Enter the amount in your currency.</span>
              </div>
              <div>
                <label className="text-xs font-bold text-emerald-900 block mb-1">Default Selling Rate</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 20.00"
                  value={addForm.defaultSellingRate}
                  onChange={(e) => setAddForm({ ...addForm, defaultSellingRate: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-emerald-200 rounded-lg font-mono font-bold text-emerald-900 focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5 leading-tight">The usual price charged to the customer for one unit. This is a default value, not necessarily the final billed price.</span>
              </div>
              <div>
                <label className="text-xs font-bold text-amber-900 block mb-1">Maximum Retail Price (MRP) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="e.g., 25.00"
                  value={addForm.mrp}
                  onChange={(e) => setAddForm({ ...addForm, mrp: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-amber-300 rounded-lg font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5 leading-tight">The maximum retail price printed on the medicine packaging for the specified pack or unit.</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Pack Size *</label>
              <input
                type="text"
                placeholder="15 Tablets"
                value={addForm.packSize}
                onChange={(e) => setAddForm({ ...addForm, packSize: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1">
                HSN Code <span className="text-[10px] text-emerald-600 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. 30049060"
                value={addForm.hsnCode}
                onChange={(e) => setAddForm({ ...addForm, hsnCode: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">GST Rate (%) *</label>
              <select
                value={addForm.gstRate}
                onChange={(e) => setAddForm({ ...addForm, gstRate: e.target.value })}
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
              <label className="text-xs font-bold text-slate-700 block mb-1">Reorder Alert (Qty)</label>
              <input
                type="number"
                placeholder="10"
                value={addForm.reorderLevel}
                onChange={(e) => setAddForm({ ...addForm, reorderLevel: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Barcode / EAN</label>
              <input
                type="text"
                placeholder="8901117001014"
                value={addForm.barcode}
                onChange={(e) => setAddForm({ ...addForm, barcode: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Schedule / Restriction</label>
              <select
                value={addForm.prescriptionType}
                onChange={(e) => setAddForm({ ...addForm, prescriptionType: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="OTC">OTC (Over the Counter)</option>
                <option value="Schedule H">Schedule H (Prescription)</option>
                <option value="Schedule H1">Schedule H1 (Controlled Drug)</option>
                <option value="Schedule X">Schedule X (Narcotic/Restricted)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              Save Medicine to Catalogue
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Medicine */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Medicine Master Record" maxWidth="2xl">
        <form onSubmit={handleUpdateProduct} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
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
              <label className="text-xs font-bold text-slate-700 block mb-1">Generic / Active Ingredient *</label>
              <input
                type="text"
                required
                value={editForm.genericName}
                onChange={(e) => setEditForm({ ...editForm, genericName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Strength *</label>
              <input
                type="text"
                required
                value={editForm.strength}
                onChange={(e) => setEditForm({ ...editForm, strength: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Dosage Form *</label>
              <select
                value={editForm.dosageForm}
                onChange={(e) => setEditForm({ ...editForm, dosageForm: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Tablet">Tablet</option>
                <option value="Capsule">Capsule</option>
                <option value="Syrup">Syrup</option>
                <option value="Injection">Injection</option>
                <option value="Ointment">Ointment</option>
                <option value="Drops">Drops</option>
              </select>
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
          </div>

          {/* Pricing & GST Classification Section */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Pricing Structure & Rates (Kept Strictly Separate)
            </p>
            <div className="grid grid-cols-3 gap-3">
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
                <span className="text-[10px] text-slate-500 block mt-0.5 leading-tight">The usual price paid to purchase one unit of this medicine from a supplier. Enter the amount in your currency.</span>
              </div>
              <div>
                <label className="text-xs font-bold text-emerald-900 block mb-1">Default Selling Rate</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 20.00"
                  value={editForm.defaultSellingRate}
                  onChange={(e) => setEditForm({ ...editForm, defaultSellingRate: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-emerald-200 rounded-lg font-mono font-bold text-emerald-900 focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5 leading-tight">The usual price charged to the customer for one unit. This is a default value, not necessarily the final billed price.</span>
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
                <span className="text-[10px] text-slate-500 block mt-0.5 leading-tight">The maximum retail price printed on the medicine packaging for the specified pack or unit.</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Pack Size *</label>
              <input
                type="text"
                value={editForm.packSize}
                onChange={(e) => setEditForm({ ...editForm, packSize: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
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
              <label className="text-xs font-bold text-slate-700 block mb-1">Reorder Alert (Qty)</label>
              <input
                type="number"
                value={editForm.reorderLevel}
                onChange={(e) => setEditForm({ ...editForm, reorderLevel: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
