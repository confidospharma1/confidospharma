import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Building2, ShoppingCart, LogOut, ShieldCheck, User as UserIcon, Sliders } from 'lucide-react';
import { Badge } from './Badge';
import { SettingsModal } from './SettingsModal';
import { ProfileModal } from './ProfileModal';

interface NavbarProps {
  onOpenPOS: () => void;
  activeTab: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenPOS, activeTab }) => {
  const { user, isSuperAdmin, isBranchAdmin, branches, selectedBranchId, setSelectedBranchId, logout, currentBranch } = useAuth();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const getRoleVariant = (role?: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'danger';
      case 'BRANCH_ADMIN':
        return 'info';
      default:
        return 'brandGreen';
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'Super Admin';
      case 'BRANCH_ADMIN':
        return 'Branch Admin';
      case 'BILLING_USER':
        return 'Billing Cashier';
      default:
        return role;
    }
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between shadow-xs">
      {/* Brand logo & Branch display */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <img
            src="/confidos-logo.png"
            alt="Confidos Pharma"
            className="h-9 w-auto max-w-[165px] object-contain"
          />
        </div>

        {/* Branch Switcher / Active Branch Indicator */}
        <div className="hidden md:flex items-center gap-2 ml-3 pl-4 border-l border-slate-200">
          <Building2 className="w-4 h-4 text-brand-500" />
          {isSuperAdmin && branches.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Branch:</span>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md px-2.5 py-1 transition-colors cursor-pointer focus:ring-2 focus:ring-brand-500"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs">
              <span className="font-semibold text-slate-800">{currentBranch?.name || 'Local Branch'}</span>
              <span className="ml-1.5 text-slate-500 font-mono text-[11px]">({currentBranch?.code})</span>
            </div>
          )}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Quick POS Button - Primary Brand Blue */}
        <button
          onClick={onOpenPOS}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
            activeTab === 'pos'
              ? 'bg-brand-600 text-white shadow-inner'
              : 'bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white hover:shadow-sm'
          }`}
          title="Open Point of Sale Billing Counter (Shortcut: F2)"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>POS Billing</span>
          <span className="hidden sm:inline-block px-1.5 py-0.2 bg-brand-700/60 rounded text-[10px] font-mono">
            F2
          </span>
        </button>

        {/* Admin Settings & Customization Button */}
        {(isSuperAdmin || isBranchAdmin) && (
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-brand-700 bg-slate-50 hover:bg-brand-50 border border-slate-200 hover:border-brand-200 rounded-lg transition-all"
            title="Configure default discount, GST settings, and system defaults"
          >
            <Sliders className="w-3.5 h-3.5 text-brand-500" />
            <span className="hidden md:inline">Settings</span>
          </button>
        )}

        {/* User Role Badge & Name (Clickable Profile) */}
        <button
          type="button"
          onClick={() => setShowProfileModal(true)}
          className="hidden lg:flex items-center gap-2.5 pl-3 border-l border-slate-200 hover:bg-slate-50 p-1 rounded-lg transition-colors text-left"
          title="View & Edit Administrator Profile"
        >
          <div className="text-right">
            <p className="text-xs font-bold text-slate-800 leading-tight">{user?.fullName}</p>
            <p className="text-[11px] text-slate-500 font-mono">{user?.email}</p>
          </div>
          <Badge variant={getRoleVariant(user?.role)} size="sm">
            <ShieldCheck className="w-3 h-3" />
            {getRoleLabel(user?.role)}
          </Badge>
        </button>

        {/* Sign Out */}
        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
          title="Sign out of system"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
    </header>
  );
};
