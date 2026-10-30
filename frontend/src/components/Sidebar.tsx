import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Boxes,
  Pill,
  Truck,
  ArrowLeftRight,
  BarChart3,
  TrendingUp,
  Users,
  Building,
  Scale,
  ShieldCheck,
  FileSpreadsheet,
  Layers,
  X,
  Building2,
} from 'lucide-react';
import { Badge } from './Badge';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const { user, isSuperAdmin, isBranchAdmin, isBillingUser, branches, selectedBranchId, setSelectedBranchId, currentBranch } = useAuth();

  const handleItemClick = (tab: string) => {
    setActiveTab(tab);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const navItemClass = (tab: string) => `
    group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all text-left
    ${
      activeTab === tab
        ? 'bg-brand-50 text-brand-700 border-l-4 border-brand-500 shadow-xs font-bold'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 active:bg-slate-100'
    }
  `;

  const iconClass = (tab: string) => `
    w-4 h-4 transition-colors shrink-0
    ${activeTab === tab ? 'text-brand-500' : 'text-slate-400 group-hover:text-slate-600'}
  `;

  // Reusable navigation contents
  const NavigationContent = ({ isMobileDrawer = false }: { isMobileDrawer?: boolean }) => (
    <div className="flex flex-col justify-between h-full">
      <div className="p-4 space-y-5 overflow-y-auto flex-1">
        {/* Mobile branch switcher */}
        {isMobileDrawer && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 mb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-brand-500" />
                Active Branch
              </span>
              <Badge variant="brandGreen" size="sm">Active</Badge>
            </div>
            {isSuperAdmin && branches.length > 0 ? (
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-brand-500"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs">
                <p className="font-bold text-slate-800">{currentBranch?.name || 'Local Branch'}</p>
                <p className="text-[11px] text-slate-500 font-mono">Code: {currentBranch?.code}</p>
              </div>
            )}
          </div>
        )}

        {/* Core Billing Section */}
        <div>
          <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Counter Operations
          </p>
          <nav className="space-y-1">
            <button
              onClick={() => handleItemClick('pos')}
              className={navItemClass('pos')}
            >
              <ShoppingCart className={iconClass('pos')} />
              <span>POS Billing Counter</span>
            </button>
            <button
              onClick={() => handleItemClick('invoices')}
              className={navItemClass('invoices')}
            >
              <Receipt className={iconClass('invoices')} />
              <span>Sales Invoices</span>
            </button>
          </nav>
        </div>

        {/* Inventory & Pharmacy Management */}
        {!isBillingUser && (
          <div>
            <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Pharmacy Inventory
            </p>
            <nav className="space-y-1">
              <button
                onClick={() => handleItemClick('dashboard')}
                className={navItemClass('dashboard')}
              >
                <LayoutDashboard className={iconClass('dashboard')} />
                <span>Branch Dashboard</span>
              </button>
              <button
                onClick={() => handleItemClick('inventory')}
                className={navItemClass('inventory')}
              >
                <Layers className={iconClass('inventory')} />
                <span>Inventory Management</span>
              </button>
              <button
                onClick={() => handleItemClick('stock-monitoring')}
                className={navItemClass('stock-monitoring')}
              >
                <Boxes className={iconClass('stock-monitoring')} />
                <span>Stock Monitoring</span>
              </button>
              <button
                onClick={() => handleItemClick('catalogue')}
                className={navItemClass('catalogue')}
              >
                <Pill className={iconClass('catalogue')} />
                <span>Medicine Catalogue</span>
              </button>
              <button
                onClick={() => handleItemClick('purchases')}
                className={navItemClass('purchases')}
              >
                <Truck className={iconClass('purchases')} />
                <span>Purchases & Suppliers</span>
              </button>
              <button
                onClick={() => handleItemClick('transfers')}
                className={navItemClass('transfers')}
              >
                <ArrowLeftRight className={iconClass('transfers')} />
                <span>Branch Transfers</span>
              </button>
              <button
                onClick={() => handleItemClick('imports')}
                className={navItemClass('imports')}
              >
                <FileSpreadsheet className={iconClass('imports')} />
                <span>Bulk Inward Import</span>
              </button>
              <button
                onClick={() => handleItemClick('reports')}
                className={navItemClass('reports')}
              >
                <BarChart3 className={iconClass('reports')} />
                <span>Reports & GST Summary</span>
              </button>
              <button
                onClick={() => handleItemClick('profit-loss')}
                className={navItemClass('profit-loss')}
              >
                <TrendingUp className={iconClass('profit-loss')} />
                <span>Profit & Loss Statement</span>
              </button>
            </nav>
          </div>
        )}

        {/* Administration Section */}
        {(isSuperAdmin || isBranchAdmin) && (
          <div>
            <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Administration
            </p>
            <nav className="space-y-1">
              <button
                onClick={() => handleItemClick('users')}
                className={navItemClass('users')}
              >
                <Users className={iconClass('users')} />
                <span>Staff & Cashiers</span>
              </button>
              {isSuperAdmin && (
                <>
                  <button
                    onClick={() => handleItemClick('branches')}
                    className={navItemClass('branches')}
                  >
                    <Building className={iconClass('branches')} />
                    <span>Branches Setup</span>
                  </button>
                  <button
                    onClick={() => handleItemClick('audit')}
                    className={navItemClass('audit')}
                  >
                    <ShieldCheck className={iconClass('audit')} />
                    <span>Security & Audit Logs</span>
                  </button>
                </>
              )}
            </nav>
          </div>
        )}

        {/* Compliance & Legal */}
        <div>
          <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Governance & Legal
          </p>
          <nav className="space-y-1">
            <button
              onClick={() => handleItemClick('legal')}
              className={navItemClass('legal')}
            >
              <Scale className={iconClass('legal')} />
              <span>Policies & Privacy Portal</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/60 text-[11px] text-slate-500 space-y-1 shrink-0">
        <div className="flex items-center justify-between font-mono">
          <span>v1.0.0-PROD</span>
          <span className="flex items-center gap-1 text-pharmagreen-600 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-pharmagreen-500 animate-pulse"></span>
            Online
          </span>
        </div>
        <p className="text-[10px] text-slate-400 leading-tight">
          Licensed to Confidos Healthcare & Pharmaceuticals Pvt Ltd.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* 1. Desktop Persistent Sidebar (Laptop & Desktop screens >= 1024px) */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 flex-col justify-between h-[calc(100vh-4rem)] select-none shrink-0">
        <NavigationContent />
      </aside>

      {/* 2. Mobile & Tablet Off-Canvas Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden transition-opacity duration-200"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* 3. Mobile & Tablet Drawer (< 1024px) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white border-r border-slate-200 flex flex-col justify-between select-none shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        aria-label="Mobile Navigation"
      >
        {/* Mobile Header with Logo & Close Button */}
        <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2">
            <img
              src="/confidos-logo.png"
              alt="Confidos Pharma"
              className="h-7 w-auto max-w-[135px] object-contain"
            />
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors focus:ring-2 focus:ring-brand-500"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Scrollable Navigation */}
        <div className="flex-1 overflow-hidden">
          <NavigationContent isMobileDrawer />
        </div>
      </aside>
    </>
  );
};

