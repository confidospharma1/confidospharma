import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { User } from '../types';
import { Users, Plus, ShieldCheck, Mail, Building2, CheckCircle2 } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';

export const UsersPage: React.FC = () => {
  const { isSuperAdmin, isBranchAdmin, branches, selectedBranchId } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // New User Modal
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    fullName: '',
    password: '',
    role: 'BILLING_USER' as 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'BILLING_USER',
    branchId: selectedBranchId || '',
  });

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      await api.createUser(formData);
      setMessage({ text: `Account for '${formData.fullName}' created successfully.`, type: 'success' });
      setShowModal(false);
      setFormData({
        username: '',
        email: '',
        fullName: '',
        password: '',
        role: 'BILLING_USER',
        branchId: selectedBranchId || '',
      });
      loadUsers();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to create user account.', type: 'error' });
    }
  };

  const getRoleVariant = (role?: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'danger';
      case 'BRANCH_ADMIN':
        return 'info';
      default:
        return 'success';
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Staff Accounts & Permissions</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Role-Based Access Control (RBAC): Super Admin, Branch Admin, and Billing Cashiers.
          </p>
        </div>

        {(isSuperAdmin || isBranchAdmin) && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Staff Account
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

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Full Name</th>
                <th className="py-3 px-3">Username</th>
                <th className="py-3 px-3">Email Address</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">Assigned Branch</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading staff accounts...
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">{u.fullName}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">{u.username}</td>
                    <td className="py-3 px-3 text-slate-600">{u.email}</td>
                    <td className="py-3 px-3">
                      <Badge variant={getRoleVariant(u.role)} size="sm">
                        {u.role}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-800">
                      {u.branch?.name || (u.role === 'SUPER_ADMIN' ? 'Head Office (All Branches)' : 'Unassigned')}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1.5"></span>
                      <span className="text-emerald-700 font-bold">Active</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-500 text-[11px]">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : 'Never'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add User */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Staff User Account" maxWidth="md">
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Full Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Ramesh Varma"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Username *</label>
              <input
                type="text"
                required
                placeholder="e.g. ramesh_vja"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono focus:bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Email *</label>
              <input
                type="email"
                required
                placeholder="ramesh@confidospharma.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Initial Password *</label>
            <input
              type="password"
              required
              placeholder="••••••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Role *</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                {isSuperAdmin && <option value="SUPER_ADMIN">Super Admin</option>}
                {isSuperAdmin && <option value="BRANCH_ADMIN">Branch Admin</option>}
                <option value="BILLING_USER">Billing User (Cashier)</option>
              </select>
            </div>
            {formData.role !== 'SUPER_ADMIN' && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Assigned Branch *</label>
                <select
                  required
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                >
                  <option value="">-- Choose Branch --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
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
              Create Account
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
