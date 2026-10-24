import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MedicineProduct } from '../types';
import { Pill, Plus, Search, Filter, AlertCircle, CheckCircle, Barcode } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';

export const ProductsPage: React.FC = () => {
  const { isBillingUser } = useAuth();

  const [products, setProducts] = useState<MedicineProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formFilter, setFormFilter] = useState('');

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
    hsnCode: '30049099',
    gstRate: '12',
    mrp: '',
    barcode: '',
    prescriptionType: 'Schedule H',
    storageNotes: '',
  });

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
      await api.createProduct(addForm);
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
        hsnCode: '30049099',
        gstRate: '12',
        mrp: '',
        barcode: '',
        prescriptionType: 'Schedule H',
        storageNotes: '',
      });
      loadProducts();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create medicine.', type: 'error' });
    }
  };

  const filteredProducts = products.filter((p) => {
    if (!formFilter) return true;
    return p.dosageForm.toLowerCase() === formFilter.toLowerCase();
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Medicine Master Catalogue</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Central pharmaceutical master data shared across all physical pharmacy branches.
          </p>
        </div>

        {!isBillingUser && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors self-start"
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

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Brand Name, Generic, Manufacturer, Barcode..."
            className="w-full pl-10 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={formFilter}
            onChange={(e) => setFormFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:bg-white focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Dosage Forms</option>
            <option value="Tablet">Tablets</option>
            <option value="Capsule">Capsules</option>
            <option value="Syrup">Syrups & Liquids</option>
            <option value="Injection">Injections</option>
            <option value="Ointment">Ointments & Creams</option>
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Internal Code</th>
                <th className="py-3 px-4">Brand & Generic Name</th>
                <th className="py-3 px-3">Strength</th>
                <th className="py-3 px-3">Form</th>
                <th className="py-3 px-3">Manufacturer</th>
                <th className="py-3 px-3 text-center">HSN Code</th>
                <th className="py-3 px-3 text-center">GST Rate</th>
                <th className="py-3 px-3 text-right">Standard MRP</th>
                <th className="py-3 px-4 text-center">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Loading medicines catalogue...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No medicine records found.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">{p.internalCode}</td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{p.brandName}</span>
                      <span className="text-[11px] text-slate-500">{p.genericName}</span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700">{p.strength}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 font-medium">
                        {p.dosageForm}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 truncate max-w-[150px]">{p.manufacturer}</td>
                    <td className="py-3 px-3 text-center font-mono text-slate-600">{p.hsnCode}</td>
                    <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">{p.gstRate}%</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">₹{p.mrp.toFixed(2)}</td>
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
              <label className="text-xs font-bold text-slate-700 block mb-1">HSN Code *</label>
              <input
                type="text"
                required
                placeholder="30049060"
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
                <option value="5">5%</option>
                <option value="12">12% (Standard)</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">MRP (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="33.50"
                value={addForm.mrp}
                onChange={(e) => setAddForm({ ...addForm, mrp: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono font-bold"
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
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
            >
              Save Medicine
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
