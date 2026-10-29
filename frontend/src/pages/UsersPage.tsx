import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { User } from '../types';
import { Users, Plus, ShieldCheck, Mail, Building2, CheckCircle2, Edit2, Trash2, AlertCircle, Search, Filter, X, CheckSquare } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { FilterButton } from '../components/FilterButton';
import { FilterField, FilterSelect, FilterInput } from '../components/FilterControls';

export const UsersPage: React.FC = () => {
  const { isSuperAdmin, isBranchAdmin, branches, selectedBranchId } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const activeFilterCount = [
    roleFilter,
    branchFilter,
    statusFilter,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setRoleFilter('');
    setBranchFilter('');
    setStatusFilter('');
  };

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

  // Edit User Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    fullName: '',
    email: '',
    role: 'BILLING_USER' as 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'BILLING_USER',
    branchId: '',
    password: '',
    isActive: true,
  });

  // Delete/Deactivate Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeactivatingUser, setIsDeactivatingUser] = useState(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  // Super Admin Bulk Operations
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [showBulkDeleteUsersModal, setShowBulkDeleteUsersModal] = useState(false);
  const [isBulkDeletingUsers, setIsBulkDeletingUsers] = useState(false);

  const toggleSelectUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllUsers = (displayed: User[]) => {
    const displayedIds = displayed.map((u) => u.id);
    const allSelected = displayedIds.length > 0 && displayedIds.every((id) => selectedUserIds.includes(id));
    if (allSelected) {
      setSelectedUserIds((prev) => prev.filter((id) => !displayedIds.includes(id)));
    } else {
      setSelectedUserIds((prev) => Array.from(new Set([...prev, ...displayedIds])));
    }
  };

  const handleBulkDeleteUsers = async () => {
    if (selectedUserIds.length === 0) return;
    setIsBulkDeletingUsers(true);
    try {
      const res = await api.bulkDeleteUsers(selectedUserIds);
      setMessage({
        text: res.message || `Successfully processed bulk deletion for ${selectedUserIds.length} users.`,
        type: 'success',
      });
      setSelectedUserIds([]);
      setShowBulkDeleteUsersModal(false);
      loadUsers();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to bulk delete users.', type: 'error' });
    } finally {
      setIsBulkDeletingUsers(false);
    }
  };

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

  const openEdit = (u: User) => {
    setEditingUser(u);
    setEditUserForm({
      fullName: u.fullName,
      email: u.email,
      role: u.role as any,
      branchId: u.branchId || '',
      password: '',
      isActive: u.isActive !== false,
    });
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setMessage(null);
    try {
      await api.updateUser(editingUser.id, {
        fullName: editUserForm.fullName.trim(),
        email: editUserForm.email.trim(),
        role: editUserForm.role,
        branchId: editUserForm.role === 'SUPER_ADMIN' ? null : (editUserForm.branchId || null),
        password: editUserForm.password ? editUserForm.password : undefined,
        isActive: editUserForm.isActive,
      });
      setMessage({ text: `User account '${editUserForm.fullName}' updated successfully.`, type: 'success' });
      setShowEditModal(false);
      loadUsers();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update user account.', type: 'error' });
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeactivateError(null);
    setIsDeactivatingUser(true);
    try {
      const res = await api.deleteUser(deleteTarget.id);
      setMessage({ text: res.message || `User account '${deleteTarget.fullName}' deactivated.`, type: 'success' });
      setShowDeleteModal(false);
      setDeleteTarget(null);
      loadUsers();
    } catch (err: any) {
      setDeactivateError(err.message || 'Failed to deactivate user.');
    } finally {
      setIsDeactivatingUser(false);
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

  const filteredUsers = users.filter((u) => {
    // Search query matching fullName, username, email, branch name
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.branch && u.branch.name.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }

    // Role filter
    if (roleFilter && u.role !== roleFilter) return false;

    // Branch filter
    if (branchFilter) {
      if (branchFilter === 'UNASSIGNED' && u.branchId) return false;
      if (branchFilter !== 'UNASSIGNED' && u.branchId !== branchFilter) return false;
    }

    // Status filter
    if (statusFilter === 'ACTIVE' && u.isActive === false) return false;
    if (statusFilter === 'INACTIVE' && u.isActive !== false) return false;

    return true;
  });

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
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
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
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff by Name, Username, Email, Branch..."
              className="w-full pl-10 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <FilterButton
              activeCount={activeFilterCount}
              onReset={resetFilters}
              title="Filter Staff Accounts"
              buttonLabel="Filter Staff"
            >
              <div className="space-y-3">
                <FilterField label="Access Role">
                  <FilterSelect
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    options={[
                      { label: 'All Roles', value: '' },
                      { label: 'Super Admin (Full Enterprise)', value: 'SUPER_ADMIN' },
                      { label: 'Branch Admin (Branch Manager)', value: 'BRANCH_ADMIN' },
                      { label: 'Billing Cashier (POS Counter)', value: 'BILLING_USER' },
                    ]}
                  />
                </FilterField>

                <FilterField label="Assigned Branch">
                  <FilterSelect
                    value={branchFilter}
                    onChange={(e) => setBranchFilter(e.target.value)}
                    options={[
                      { label: 'All Branches', value: '' },
                      ...branches.map((b) => ({ label: `${b.name} (${b.code})`, value: b.id })),
                      { label: 'Unassigned / Head Office', value: 'UNASSIGNED' },
                    ]}
                  />
                </FilterField>

                <FilterField label="Account Status">
                  <FilterSelect
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    options={[
                      { label: 'All Account Statuses', value: '' },
                      { label: 'Active Accounts Only', value: 'ACTIVE' },
                      { label: 'Deactivated Accounts Only', value: 'INACTIVE' },
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
            {roleFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Role: {roleFilter}
                <button type="button" onClick={() => setRoleFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {branchFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Branch: {branchFilter === 'UNASSIGNED' ? 'Unassigned' : branches.find((b) => b.id === branchFilter)?.name || branchFilter}
                <button type="button" onClick={() => setBranchFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {statusFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Status: {statusFilter === 'ACTIVE' ? 'Active' : 'Deactivated'}
                <button type="button" onClick={() => setStatusFilter('')} className="hover:text-brand-900">
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

      {/* Super Admin Bulk Users Action Bar */}
      {isSuperAdmin && selectedUserIds.length > 0 && (
        <div className="flex items-center justify-between bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-xs text-rose-800">
          <span className="font-semibold flex items-center gap-1.5">
            <CheckSquare className="w-4 h-4 text-rose-600" />
            {selectedUserIds.length} staff accounts selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedUserIds([])}
              className="px-2.5 py-1 text-slate-600 hover:text-slate-800 text-[11px] font-semibold"
            >
              Clear Selection
            </button>
            <button
              type="button"
              onClick={() => setShowBulkDeleteUsersModal(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete / Deactivate Selected ({selectedUserIds.length})
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                {isSuperAdmin && (
                  <th className="py-3 px-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={filteredUsers.length > 0 && filteredUsers.every((u) => selectedUserIds.includes(u.id))}
                      onChange={() => toggleSelectAllUsers(filteredUsers)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                )}
                <th className="py-3 px-4">Full Name</th>
                <th className="py-3 px-3">Username</th>
                <th className="py-3 px-3">Email Address</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">Assigned Branch</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Last Login</th>
                {(isSuperAdmin || isBranchAdmin) && <th className="py-3 px-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={(isSuperAdmin ? 1 : 0) + ((isSuperAdmin || isBranchAdmin) ? 8 : 7)} className="py-8 text-center text-slate-400">
                    Loading staff accounts...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={(isSuperAdmin ? 1 : 0) + ((isSuperAdmin || isBranchAdmin) ? 8 : 7)} className="py-12 text-center text-slate-400">
                    <p className="text-xs font-semibold text-slate-600">No staff accounts found.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Register additional branch administrators or billing cashiers as needed.</p>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={(isSuperAdmin ? 1 : 0) + ((isSuperAdmin || isBranchAdmin) ? 8 : 7)} className="py-12 text-center text-slate-400">
                    <p className="text-xs font-semibold text-slate-700">No staff accounts match your filter criteria.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Try resetting the filter or search keyword.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        resetFilters();
                      }}
                      className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition-colors"
                    >
                      Clear Filters
                    </button>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    {isSuperAdmin && (
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(u.id)}
                          onChange={() => toggleSelectUser(u.id)}
                          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                    )}
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
                      <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${u.isActive !== false ? 'bg-pharmagreen-500' : 'bg-rose-400'}`}></span>
                      <span className={u.isActive !== false ? 'text-pharmagreen-700 font-bold' : 'text-rose-700 font-bold'}>
                        {u.isActive !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-500 text-[11px]">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : 'Never'}
                    </td>
                    {(isSuperAdmin || isBranchAdmin) && (
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            title="Edit User Details & Permissions"
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(u);
                              setDeactivateError(null);
                              setShowDeleteModal(true);
                            }}
                            title="Deactivate / Remove User"
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
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              Create Account
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit User */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Staff User Account" maxWidth="md">
        <form onSubmit={handleUpdateUser} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={editUserForm.fullName}
              onChange={(e) => setEditUserForm({ ...editUserForm, fullName: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Username</label>
              <input
                type="text"
                disabled
                value={editingUser?.username || ''}
                className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-lg font-mono text-slate-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Email *</label>
              <input
                type="email"
                required
                value={editUserForm.email}
                onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Reset Password <span className="text-[10px] text-slate-400 font-normal">(Leave blank to keep current)</span>
            </label>
            <input
              type="password"
              placeholder="Enter new password if changing..."
              value={editUserForm.password}
              onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Role Permission *</label>
              <select
                value={editUserForm.role}
                disabled={!isSuperAdmin}
                onChange={(e) =>
                  setEditUserForm({
                    ...editUserForm,
                    role: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg disabled:opacity-60"
              >
                {isSuperAdmin && <option value="SUPER_ADMIN">Super Administrator (AP HQ)</option>}
                <option value="BRANCH_ADMIN">Branch Pharmacy Manager</option>
                <option value="BILLING_USER">Counter Billing Cashier</option>
              </select>
            </div>

            {editUserForm.role !== 'SUPER_ADMIN' && isSuperAdmin && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Assigned Branch *</label>
                <select
                  required
                  value={editUserForm.branchId}
                  onChange={(e) => setEditUserForm({ ...editUserForm, branchId: e.target.value })}
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

      {/* Modal: Delete/Deactivate Confirmation */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          if (!isDeactivatingUser) {
            setShowDeleteModal(false);
            setDeactivateError(null);
          }
        }}
        title="Confirm User Account Deactivation"
        maxWidth="md"
      >
        <div className="space-y-4">
          {deactivateError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{deactivateError}</span>
            </div>
          )}

          <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-bold mb-1">Are you sure you want to deactivate or remove this user account?</p>
              <p>
                Staff User: <strong className="font-semibold text-slate-900">{deleteTarget?.fullName}</strong> ({deleteTarget?.username})
              </p>
              <p className="text-[11px] text-rose-700 mt-1">
                Deactivated accounts will immediately lose login privileges. Historical invoices, audit logs, and sales created by this staff member remain safely preserved.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              disabled={isDeactivatingUser}
              onClick={() => {
                setShowDeleteModal(false);
                setDeactivateError(null);
              }}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeactivatingUser}
              onClick={handleDeleteUser}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs disabled:opacity-50 flex items-center gap-1.5"
            >
              {isDeactivatingUser ? 'Deactivating...' : 'Confirm Deactivation'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Bulk Delete Users Confirmation */}
      <Modal
        isOpen={showBulkDeleteUsersModal}
        onClose={() => setShowBulkDeleteUsersModal(false)}
        title="Confirm Bulk Staff Account Deactivation"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-bold mb-1">
                Are you sure you want to delete or deactivate {selectedUserIds.length} selected staff accounts?
              </p>
              <p className="text-[11px] text-rose-700 mt-1">
                Accounts will be safely deactivated or removed. Active accounts will lose immediate access. Historical transactions, sales, and audit trails remain preserved.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 max-h-36 overflow-y-auto space-y-1 text-xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
              Selected Staff Accounts ({selectedUserIds.length})
            </span>
            {users
              .filter(u => selectedUserIds.includes(u.id))
              .slice(0, 8)
              .map(u => (
                <div key={u.id} className="flex items-center justify-between text-[11px] py-0.5 border-b border-slate-200/60 last:border-0">
                  <span className="font-semibold text-slate-800 truncate mr-2">{u.fullName} ({u.role})</span>
                  <span className="font-mono text-slate-500 text-[10px] shrink-0">{u.username}</span>
                </div>
              ))}
            {selectedUserIds.length > 8 && (
              <div className="text-[10px] text-slate-500 text-center pt-1 font-medium">
                + {selectedUserIds.length - 8} more staff accounts
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              disabled={isBulkDeletingUsers}
              onClick={() => setShowBulkDeleteUsersModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleBulkDeleteUsers}
              disabled={isBulkDeletingUsers}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isBulkDeletingUsers ? 'Processing Deactivations...' : `Deactivate ${selectedUserIds.length} Accounts`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
