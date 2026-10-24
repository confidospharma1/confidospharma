import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Branch } from '../types';
import { Building2, Plus, Phone, MapPin, FileText, CheckCircle2 } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';

export const BranchesPage: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

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
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
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

      {/* Branch Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {branches.map((b) => (
          <div
            key={b.id}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <Badge variant="brand" size="sm">
                  {b.code}
                </Badge>
                <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Active
                </span>
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
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
            >
              Register Branch
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
