import React, { useRef, useEffect } from 'react';
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

interface NavigationContentProps {
  activeTab: string;
  handleItemClick: (tab: string) => void;
  isBillingUser: boolean;
  isSuperAdmin: boolean;
  isBranchAdmin: boolean;
  branches: any[];
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
  currentBranch: any;
  isMobileDrawer?: boolean;
}

const navItemClass = (active: boolean) => `
  group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all text-left
  ${
    active
      ? 'bg-brand-50 text-brand-700 border-l-4 border-brand-500 shadow-xs font-bold'
      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 active:bg-slate-100'
  }
`;

const iconClass = (active: boolean) => `
  w-4 h-4 transition-colors shrink-0
  ${active ? 'text-brand-500' : 'text-slate-400 group-hover:text-slate-600'}
`;

const NavigationContent: React.FC<NavigationContentProps> = ({
  activeTab,
  handleItemClick,
  isBillingUser,
  isSuperAdmin,
  isBranchAdmin,
  branches,
  selectedBranchId,
  setSelectedBranchId,
  currentBranch,
  isMobileDrawer = false,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Preserve scroll state and gently ensure active tab is in view without jumping
  useEffect(() => {
    const activeEl = scrollContainerRef.current?.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeTab]);

  return (
    <div className="flex flex-col justify-between h-full">
      <div ref={scrollContainerRef} className="p-4 space-y-5 overflow-y-auto flex-1 touch-scroll">
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
              data-active={activeTab === 'pos'}
              className={navItemClass(activeTab === 'pos')}
            >
              <ShoppingCart className={iconClass(activeTab === 'pos')} />
              <span>POS Billing Counter</span>
            </button>
            <button
              onClick={() => handleItemClick('invoices')}
              data-active={activeTab === 'invoices'}
              className={navItemClass(activeTab === 'invoices')}
            >
              <Receipt className={iconClass(activeTab === 'invoices')} />
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
                data-active={activeTab === 'dashboard'}
                className={navItemClass(activeTab === 'dashboard')}
              >
                <LayoutDashboard className={iconClass(activeTab === 'dashboard')} />
                <span>Branch Dashboard</span>
              </button>
              <button
                onClick={() => handleItemClick('stock-monitoring')}
                data-active={activeTab === 'stock-monitoring'}
                className={navItemClass(activeTab === 'stock-monitoring')}
              >
                <Layers className={iconClass(activeTab === 'stock-monitoring')} />
                <span>Stock Monitoring</span>
              </button>
              <button
                onClick={() => handleItemClick('inventory')}
                data-active={activeTab === 'inventory'}
                className={navItemClass(activeTab === 'inventory')}
              >
                <Boxes className={iconClass(activeTab === 'inventory')} />
                <span>Inventory Management</span>
              </button>
              <button
                onClick={() => handleItemClick('catalogue')}
                data-active={activeTab === 'catalogue'}
                className={navItemClass(activeTab === 'catalogue')}
              >
                <Pill className={iconClass(activeTab === 'catalogue')} />
                <span>Medicine Catalogue</span>
              </button>
              <button
                onClick={() => handleItemClick('purchases')}
                data-active={activeTab === 'purchases'}
                className={navItemClass(activeTab === 'purchases')}
              >
                <Truck className={iconClass(activeTab === 'purchases')} />
                <span>Purchases & Suppliers</span>
              </button>
              <button
                onClick={() => handleItemClick('transfers')}
                data-active={activeTab === 'transfers'}
                className={navItemClass(activeTab === 'transfers')}
              >
                <ArrowLeftRight className={iconClass(activeTab === 'transfers')} />
                <span>Branch Transfers</span>
              </button>
            </nav>
          </div>
        )}

        {/* Reports & Financial Analytics */}
        {!isBillingUser && (
          <div>
            <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Financial & Audit
            </p>
            <nav className="space-y-1">
              <button
                onClick={() => handleItemClick('reports')}
                data-active={activeTab === 'reports'}
                className={navItemClass(activeTab === 'reports')}
              >
                <BarChart3 className={iconClass(activeTab === 'reports')} />
                <span>Reports & Analytics</span>
              </button>
              <button
                onClick={() => handleItemClick('profit-loss')}
                data-active={activeTab === 'profit-loss'}
                className={navItemClass(activeTab === 'profit-loss')}
              >
                <TrendingUp className={iconClass(activeTab === 'profit-loss')} />
                <span>Profit & Loss Statement</span>
              </button>
              {isSuperAdmin && (
                <button
                  onClick={() => handleItemClick('audit')}
                  data-active={activeTab === 'audit'}
                  className={navItemClass(activeTab === 'audit')}
                >
                  <ShieldCheck className={iconClass(activeTab === 'audit')} />
                  <span>Audit Event Log</span>
                </button>
              )}
            </nav>
          </div>
        )}

        {/* Administration & Configuration */}
        {!isBillingUser && (
          <div>
            <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Administration
            </p>
            <nav className="space-y-1">
              {(isSuperAdmin || isBranchAdmin) && (
                <button
                  onClick={() => handleItemClick('users')}
                  data-active={activeTab === 'users'}
                  className={navItemClass(activeTab === 'users')}
                >
                  <Users className={iconClass(activeTab === 'users')} />
                  <span>Staff & Cashiers</span>
                </button>
              )}
              {isSuperAdmin && (
                <button
                  onClick={() => handleItemClick('branches')}
                  data-active={activeTab === 'branches'}
                  className={navItemClass(activeTab === 'branches')}
                >
                  <Building className={iconClass(activeTab === 'branches')} />
                  <span>Pharmacy Branches</span>
                </button>
              )}
              <button
                onClick={() => handleItemClick('legal')}
                data-active={activeTab === 'legal'}
                className={navItemClass(activeTab === 'legal')}
              >
                <Scale className={iconClass(activeTab === 'legal')} />
                <span>Compliance & Legal</span>
              </button>
            </nav>
          </div>
        )}
      </div>

      {/* Footer Info / Regulatory Notice */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/50">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            CDSCO / GST Ready
          </span>
          <span className="flex items-center gap-1 text-[10px] font-bold text-pharmagreen-700 bg-pharmagreen-50 px-2 py-0.5 rounded-full border border-pharmagreen-200/50">
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
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const { isSuperAdmin, isBranchAdmin, isBillingUser, branches, selectedBranchId, setSelectedBranchId, currentBranch } = useAuth();

  const handleItemClick = (tab: string) => {
    setActiveTab(tab);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <>
      {/* 1. Desktop Persistent Sidebar (Laptop & Desktop screens >= 1024px) */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 flex-col justify-between h-[calc(100vh-4rem)] select-none shrink-0">
        <NavigationContent
          activeTab={activeTab}
          handleItemClick={handleItemClick}
          isBillingUser={isBillingUser}
          isSuperAdmin={isSuperAdmin}
          isBranchAdmin={isBranchAdmin}
          branches={branches}
          selectedBranchId={selectedBranchId}
          setSelectedBranchId={setSelectedBranchId}
          currentBranch={currentBranch}
          isMobileDrawer={false}
        />
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
          <NavigationContent
            activeTab={activeTab}
            handleItemClick={handleItemClick}
            isBillingUser={isBillingUser}
            isSuperAdmin={isSuperAdmin}
            isBranchAdmin={isBranchAdmin}
            branches={branches}
            selectedBranchId={selectedBranchId}
            setSelectedBranchId={setSelectedBranchId}
            currentBranch={currentBranch}
            isMobileDrawer={true}
          />
        </div>
      </aside>
    </>
  );
};
