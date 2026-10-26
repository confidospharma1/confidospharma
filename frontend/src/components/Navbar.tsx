import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Building2, ShoppingCart, LogOut, ShieldCheck, User as UserIcon, Sliders } from 'lucide-react';
import { Badge } from './Badge';
import { SettingsModal } from './SettingsModal';

interface NavbarProps {
  onOpenPOS: () => void;
  activeTab: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenPOS, activeTab }) => {
  const { user, isSuperAdmin, isBranchAdmin, branches, selectedBranchId, setSelectedBranchId, logout, currentBranch } = useAuth();
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-black text-lg tracking-wider shadow-sm">
            CP
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 tracking-tight leading-tight">
              Confidos Pharma
            </h1>
            <p className="text-[11px] font-medium text-slate-500 tracking-wide uppercase">
              Inventory & Billing
            </p>
          </div>
        </div>

        {/* Branch Switcher / Active Branch Indicator */}
        <div className="hidden md:flex items-center gap-2 ml-4 pl-4 border-l border-slate-200">
          <Building2 className="w-4 h-4 text-emerald-600" />
          {isSuperAdmin && branches.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Active Branch:</span>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200/80 border border-slate-300 rounded-md px-2.5 py-1 transition-colors cursor-pointer focus:ring-2 focus:ring-emerald-500"
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
        {/* Quick POS Button */}
        <button
          onClick={onOpenPOS}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
            activeTab === 'pos'
              ? 'bg-emerald-700 text-white shadow-inner'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-sm'
          }`}
          title="Open Point of Sale Billing Counter (Shortcut: F2)"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>POS Billing</span>
          <span className="hidden sm:inline-block px-1.5 py-0.2 bg-emerald-800/60 rounded text-[10px] font-mono">
            F2
          </span>
        </button>

        {/* Admin Settings & Customization Button */}
        {(isSuperAdmin || isBranchAdmin) && (
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-emerald-800 bg-slate-100 hover:bg-emerald-50 border border-slate-300 hover:border-emerald-300 rounded-lg transition-all"
            title="Configure default discount (15%-20%), GST settings, and system defaults"
          >
            <Sliders className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden md:inline">Settings</span>
          </button>
        )}

        {/* User Role Badge & Name */}
        <div className="hidden lg:flex items-center gap-2.5 pl-3 border-l border-slate-200">
          <div className="text-right">
            <p className="text-xs font-bold text-slate-800 leading-tight">{user?.fullName}</p>
            <p className="text-[11px] text-slate-500 font-mono">{user?.email}</p>
          </div>
          <Badge variant={getRoleVariant(user?.role)} size="sm">
            <ShieldCheck className="w-3 h-3" />
            {getRoleLabel(user?.role)}
          </Badge>
        </div>

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
    </header>
  );
};
