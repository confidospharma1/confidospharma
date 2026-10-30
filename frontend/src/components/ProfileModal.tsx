import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { User as UserIcon, ShieldCheck, Building2, Mail, Phone, Lock, CheckCircle2, AlertCircle } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user: authUser, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [profileData, setProfileData] = useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    role: '',
    branchName: '',
    isActive: true,
    newPassword: '',
    confirmPassword: '',
  });

  const loadProfile = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await api.getProfile();
      if (data && data.user) {
        setProfileData({
          fullName: data.user.fullName || '',
          username: data.user.username || '',
          email: data.user.email || '',
          phone: data.user.phone || '',
          role: data.user.role || '',
          branchName: data.user.branch?.name || (data.user.role === 'SUPER_ADMIN' ? 'Head Office (All Branches)' : 'Unassigned'),
          isActive: data.user.isActive !== false,
          newPassword: '',
          confirmPassword: '',
        });
      }
    } catch (err: any) {
      console.error('Error fetching profile:', err);
      // Fallback to authUser context
      if (authUser) {
        setProfileData({
          fullName: authUser.fullName || '',
          username: authUser.username || '',
          email: authUser.email || '',
          phone: '',
          role: authUser.role || '',
          branchName: authUser.branch?.name || (authUser.role === 'SUPER_ADMIN' ? 'Head Office (All Branches)' : 'Unassigned'),
          isActive: true,
          newPassword: '',
          confirmPassword: '',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadProfile();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (profileData.newPassword && profileData.newPassword !== profileData.confirmPassword) {
      setMessage({ text: 'New password and confirmation do not match.', type: 'error' });
      return;
    }

    if (profileData.newPassword && profileData.newPassword.length < 6) {
      setMessage({ text: 'Password must be at least 6 characters.', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const payload: { fullName?: string; phone?: string; password?: string } = {
        fullName: profileData.fullName.trim(),
        phone: profileData.phone.trim(),
      };
      if (profileData.newPassword) {
        payload.password = profileData.newPassword;
      }

      const res = await api.updateProfile(payload);
      setMessage({ text: res.message || 'Profile updated successfully.', type: 'success' });
      
      // Update global auth context
      await refreshProfile();

      setProfileData((prev) => ({ ...prev, newPassword: '', confirmPassword: '' }));
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to update profile.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const getRoleVariant = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'danger';
      case 'BRANCH_ADMIN':
        return 'info';
      default:
        return 'brandGreen';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Administrator Profile & Security" maxWidth="md">
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Loading administrator profile...</div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {message && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-pharmagreen-50 text-pharmagreen-800 border border-pharmagreen-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-pharmagreen-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              )}
              <span className="font-medium">{message.text}</span>
            </div>
          )}

          {/* Account Overview Cards */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
                  {profileData.fullName ? profileData.fullName.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">{profileData.fullName || 'Staff User'}</p>
                  <p className="text-[11px] text-slate-500 font-mono">@{profileData.username}</p>
                </div>
              </div>
              <Badge variant={getRoleVariant(profileData.role)} size="sm">
                <ShieldCheck className="w-3 h-3" />
                {profileData.role}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-xs">
              <div>
                <span className="text-[11px] text-slate-500 block">Assigned Branch:</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5">
                  <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{profileData.branchName}</span>
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Account Status:</span>
                <span className="inline-flex items-center gap-1 mt-0.5 text-pharmagreen-700 font-bold">
                  <span className="w-2 h-2 rounded-full bg-pharmagreen-500"></span>
                  {profileData.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          {/* Editable Contact Fields */}
          <div className="space-y-3 pt-1">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Profile Information</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Full Name / Display Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <UserIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={profileData.fullName}
                    onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
                    placeholder="Enter full name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Phone / Mobile</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Email Address (Managed by Super Admin)
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  disabled
                  value={profileData.email}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed font-medium"
                />
              </div>
            </div>
          </div>

          {/* Change Password (Optional) */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Change Password (Optional)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">New Password</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={profileData.newPassword}
                    onChange={(e) => setProfileData({ ...profileData, newPassword: e.target.value })}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="Leave blank to keep current"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Confirm New Password</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={profileData.confirmPassword}
                    onChange={(e) => setProfileData({ ...profileData, confirmPassword: e.target.value })}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              {saving ? 'Saving...' : 'Update Profile'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
