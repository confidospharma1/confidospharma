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
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { isSuperAdmin, isBranchAdmin, isBillingUser } = useAuth();

  const navItemClass = (tab: string) => `
    group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all
    ${
      activeTab === tab
        ? 'bg-brand-50 text-brand-700 border-l-4 border-brand-500 shadow-xs font-bold'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
    }
  `;

  const iconClass = (tab: string) => `
    w-4 h-4 transition-colors
    ${activeTab === tab ? 'text-brand-500' : 'text-slate-400 group-hover:text-slate-600'}
  `;

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between h-[calc(100vh-4rem)] select-none">
      <div className="p-4 space-y-6 overflow-y-auto">
        {/* Core Billing Section */}
        <div>
          <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Counter Operations
          </p>
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('pos')}
              className={navItemClass('pos')}
            >
              <ShoppingCart className={iconClass('pos')} />
              <span>POS Billing Counter</span>
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={navItemClass('invoices')}
            >
              <Receipt className={iconClass('invoices')} />
              <span>Sales Invoices</span>
            </button>
          </nav>
        </div>

        {/* Inventory & Pharmacy Management */}
        {(!isBillingUser) && (
          <div>
            <p className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Pharmacy Inventory
            </p>
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={navItemClass('dashboard')}
              >
                <LayoutDashboard className={iconClass('dashboard')} />
                <span>Branch Dashboard</span>
              </button>
              <button
                onClick={() => setActiveTab('stock-monitoring')}
                className={navItemClass('stock-monitoring')}
              >
                <Boxes className={iconClass('stock-monitoring')} />
                <span>Stock Monitoring</span>
              </button>
              <button
                onClick={() => setActiveTab('catalogue')}
                className={navItemClass('catalogue')}
              >
                <Pill className={iconClass('catalogue')} />
                <span>Medicine Catalogue</span>
              </button>
              <button
                onClick={() => setActiveTab('purchases')}
                className={navItemClass('purchases')}
              >
                <Truck className={iconClass('purchases')} />
                <span>Purchases & Suppliers</span>
              </button>
              <button
                onClick={() => setActiveTab('transfers')}
                className={navItemClass('transfers')}
              >
                <ArrowLeftRight className={iconClass('transfers')} />
                <span>Branch Transfers</span>
              </button>
              <button
                onClick={() => setActiveTab('imports')}
                className={navItemClass('imports')}
              >
                <FileSpreadsheet className={iconClass('imports')} />
                <span>Bulk Inward Import</span>
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={navItemClass('reports')}
              >
                <BarChart3 className={iconClass('reports')} />
                <span>Reports & GST Summary</span>
              </button>
              <button
                onClick={() => setActiveTab('profit-loss')}
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
                onClick={() => setActiveTab('users')}
                className={navItemClass('users')}
              >
                <Users className={iconClass('users')} />
                <span>Staff & Cashiers</span>
              </button>
              {isSuperAdmin && (
                <>
                  <button
                    onClick={() => setActiveTab('branches')}
                    className={navItemClass('branches')}
                  >
                    <Building className={iconClass('branches')} />
                    <span>Branches Setup</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('audit')}
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
              onClick={() => setActiveTab('legal')}
              className={navItemClass('legal')}
            >
              <Scale className={iconClass('legal')} />
              <span>Policies & Privacy Portal</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/60 text-[11px] text-slate-500 space-y-1">
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
    </aside>
  );
};
