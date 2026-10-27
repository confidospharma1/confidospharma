import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Branch } from '../types';
import { Building2, Plus, Phone, MapPin, FileText, CheckCircle2, Edit2, Trash2, AlertCircle, Search, Filter, X } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { FilterButton } from '../components/FilterButton';
import { FilterField, FilterSelect, FilterInput } from '../components/FilterControls';

export const BranchesPage: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [complianceFilter, setComplianceFilter] = useState('');

  const activeFilterCount = [
    statusFilter,
    cityFilter,
    complianceFilter,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setStatusFilter('');
    setCityFilter('');
    setComplianceFilter('');
  };

  // New Branch Modal
  const [showModal, setShowModal] = useState(false);
  const [branchForm, setBranchForm] = useState({
    code: '',
    name: '',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    drugLicenseNo: '',
  });

  // Edit Branch Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editBranchForm, setEditBranchForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    drugLicenseNo: '',
  });

  // Delete/Archive Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadBranches = async () => {
    setLoading(true);
    try {
      const data = await api.getBranches();
      setBranches(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      await api.createBranch(branchForm);
      setMessage({ text: `Branch '${branchForm.name}' (${branchForm.code}) added successfully.`, type: 'success' });
      setShowModal(false);
      setBranchForm({
        code: '',
        name: '',
        address: '',
        phone: '',
        email: '',
        gstin: '',
        drugLicenseNo: '',
      });
      loadBranches();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create branch.', type: 'error' });
    }
  };

  const openEdit = (b: Branch) => {
    setEditingBranch(b);
    setEditBranchForm({
      name: b.name,
      address: b.address,
      phone: b.phone,
      email: b.email || '',
      gstin: b.gstin,
      drugLicenseNo: b.drugLicenseNo || '',
    });
    setShowEditModal(true);
  };

  const handleUpdateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch) return;
    setMessage(null);
    try {
      await api.updateBranch(editingBranch.id, {
        ...editBranchForm,
        email: editBranchForm.email.trim() || null,
        drugLicenseNo: editBranchForm.drugLicenseNo.trim() || null,
      });
      setMessage({ text: `Branch '${editBranchForm.name}' updated successfully.`, type: 'success' });
      setShowEditModal(false);
      loadBranches();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update branch.', type: 'error' });
    }
  };

  const handleDeleteBranch = async () => {
    if (!deleteTarget) return;
    setMessage(null);
    try {
      const res = await api.deleteBranch(deleteTarget.id);
      setMessage({ text: res.message || `Branch '${deleteTarget.name}' archived/removed successfully.`, type: 'success' });
      setShowDeleteModal(false);
      setDeleteTarget(null);
      loadBranches();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to delete/archive branch.', type: 'error' });
    }
  };

  const filteredBranches = branches.filter((b) => {
    // Search query matching name, code, phone, address, gstin, dl
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        b.name.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.phone.toLowerCase().includes(q) ||
        b.address.toLowerCase().includes(q) ||
        b.gstin.toLowerCase().includes(q) ||
        (b.drugLicenseNo && b.drugLicenseNo.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }

    // Status filter
    if (statusFilter === 'ACTIVE' && b.isActive === false) return false;
    if (statusFilter === 'INACTIVE' && b.isActive !== false) return false;

    // City / Region filter
    if (cityFilter.trim() && !b.address.toLowerCase().includes(cityFilter.toLowerCase().trim())) {
      return false;
    }

    // Compliance filter
    if (complianceFilter === 'WITH_DL' && !b.drugLicenseNo) return false;
    if (complianceFilter === 'WITHOUT_DL' && b.drugLicenseNo) return false;
    if (complianceFilter === 'WITH_GSTIN' && !b.gstin) return false;

    return true;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pharmacy Branches Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configurable physical pharmacy branches across Andhra Pradesh with separate stock and tax identity.
          </p>
        </div>

        {isSuperAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add New Branch
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
      {branches.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
            <div className="relative flex-1 w-full max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search branches by Name, Code, City, Phone, GSTIN..."
                className="w-full pl-10 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
              />
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <FilterButton
                activeCount={activeFilterCount}
                onReset={resetFilters}
                title="Filter Pharmacy Branches"
                buttonLabel="Filter Branches"
              >
                <div className="space-y-3">
                  <FilterField label="Operating Status">
                    <FilterSelect
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      options={[
                        { label: 'All Statuses (Active & Suspended)', value: '' },
                        { label: 'Active Branches Only', value: 'ACTIVE' },
                        { label: 'Suspended / Archived Only', value: 'INACTIVE' },
                      ]}
                    />
                  </FilterField>

                  <FilterField label="City / Region in Address">
                    <FilterInput
                      type="text"
                      placeholder="e.g. Vijayawada, Guntur, Tirupati..."
                      value={cityFilter}
                      onChange={(e) => setCityFilter(e.target.value)}
                    />
                  </FilterField>

                  <FilterField label="Regulatory Compliance">
                    <FilterSelect
                      value={complianceFilter}
                      onChange={(e) => setComplianceFilter(e.target.value)}
                      options={[
                        { label: 'All Compliance Statuses', value: '' },
                        { label: 'With Drug License Registered', value: 'WITH_DL' },
                        { label: 'Missing Drug License Number', value: 'WITHOUT_DL' },
                        { label: 'With GSTIN Configured', value: 'WITH_GSTIN' },
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
                  Status: {statusFilter === 'ACTIVE' ? 'Active Only' : 'Inactive Only'}
                  <button type="button" onClick={() => setStatusFilter('')} className="hover:text-brand-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {cityFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                  City: {cityFilter}
                  <button type="button" onClick={() => setCityFilter('')} className="hover:text-brand-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {complianceFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                  Compliance: {complianceFilter === 'WITH_DL' ? 'Has DL' : complianceFilter === 'WITHOUT_DL' ? 'No DL' : 'Has GSTIN'}
                  <button type="button" onClick={() => setComplianceFilter('')} className="hover:text-brand-900">
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
      )}

      {/* Branch Cards Grid or Empty State */}
      {branches.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-xs space-y-4">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <Building2 className="w-6 h-6 text-slate-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">No pharmacy branches registered yet</h3>
            <p className="text-xs text-slate-500 mt-1">
              Add your first branch location to begin configuring segregated inventory and billing counters.
            </p>
          </div>
          {isSuperAdmin && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Add Your First Branch
            </button>
          )}
        </div>
      ) : filteredBranches.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-xs space-y-3">
          <Building2 className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">No branches match your filters</h3>
          <p className="text-xs text-slate-500">
            Try adjusting your search query or filter parameters to find matching branches.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              resetFilters();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition-colors"
          >
            Clear Filters & Search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filteredBranches.map((b) => (
            <div
              key={b.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="brand" size="sm">
                    {b.code}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-pharmagreen-700 font-bold">
                      <span className="w-2 h-2 rounded-full bg-pharmagreen-500"></span>
                      Active
                    </span>
                    {isSuperAdmin && (
                      <div className="flex items-center gap-1 ml-2 border-l border-slate-200 pl-2">
                        <button
                          type="button"
                          onClick={() => openEdit(b)}
                          title="Edit Branch Details"
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTarget(b);
                            setShowDeleteModal(true);
                          }}
                          title="Archive / Remove Branch"
                          className="p-1 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <h2 className="text-base font-bold text-slate-900 mb-2">{b.name}</h2>

                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span className="leading-tight">{b.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span>{b.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="font-mono"><strong>GSTIN:</strong> {b.gstin}</span>
                  </div>
                  {b.drugLicenseNo && (
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="font-mono"><strong>DL No:</strong> {b.drugLicenseNo}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>Staff: <strong className="text-slate-800">{b._count?.users || 0}</strong></span>
                <span>Batches: <strong className="text-slate-800">{b._count?.batches || 0}</strong></span>
                <span>Bills: <strong className="text-slate-800">{b._count?.salesInvoices || 0}</strong></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Add New Branch */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Register New Pharmacy Branch" maxWidth="lg">
        <form onSubmit={handleCreateBranch} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Branch Code *</label>
              <input
                type="text"
                required
                placeholder="e.g. B-ELR"
                value={branchForm.code}
                onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg uppercase font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Branch Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Eluru City Branch"
                value={branchForm.name}
                onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-medium"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Physical Address *</label>
            <textarea
              required
              rows={2}
              placeholder="Full physical counter address with pin code..."
              value={branchForm.address}
              onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Phone *</label>
              <input
                type="text"
                required
                placeholder="+91 8812 233445"
                value={branchForm.phone}
                onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Email</label>
              <input
                type="email"
                placeholder="eluru.branch@confidospharma.com"
                value={branchForm.email}
                onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">GSTIN *</label>
              <input
                type="text"
                required
                placeholder="37AAAAA1234A1Z8"
                value={branchForm.gstin}
                onChange={(e) => setBranchForm({ ...branchForm, gstin: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg uppercase font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Drug License Number</label>
              <input
                type="text"
                placeholder="20B/21B-AP/ELR/4092"
                value={branchForm.drugLicenseNo}
                onChange={(e) => setBranchForm({ ...branchForm, drugLicenseNo: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
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
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              Register Branch
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Branch */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Pharmacy Branch Record" maxWidth="lg">
        <form onSubmit={handleUpdateBranch} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Branch Name *</label>
            <input
              type="text"
              required
              value={editBranchForm.name}
              onChange={(e) => setEditBranchForm({ ...editBranchForm, name: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-medium"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Physical Address *</label>
            <textarea
              required
              rows={2}
              value={editBranchForm.address}
              onChange={(e) => setEditBranchForm({ ...editBranchForm, address: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Phone *</label>
              <input
                type="text"
                required
                value={editBranchForm.phone}
                onChange={(e) => setEditBranchForm({ ...editBranchForm, phone: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Email</label>
              <input
                type="email"
                value={editBranchForm.email}
                onChange={(e) => setEditBranchForm({ ...editBranchForm, email: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">GSTIN *</label>
              <input
                type="text"
                required
                value={editBranchForm.gstin}
                onChange={(e) => setEditBranchForm({ ...editBranchForm, gstin: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg uppercase font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Drug License Number</label>
              <input
                type="text"
                value={editBranchForm.drugLicenseNo}
                onChange={(e) => setEditBranchForm({ ...editBranchForm, drugLicenseNo: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600"
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
      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Confirm Branch Deactivation / Archival" maxWidth="md">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-bold mb-1">Are you sure you want to deactivate or remove this branch?</p>
              <p>
                Branch: <strong className="font-semibold text-slate-900">{deleteTarget?.name}</strong> ({deleteTarget?.code})
              </p>
              <p className="text-[11px] text-rose-700 mt-1">
                If this branch has active users, inventory batches, or invoices, it will be safely deactivated/archived to protect financial and tax audits. If completely unreferenced, it will be deleted.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteBranch}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
            >
              Confirm Deactivate / Remove
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
