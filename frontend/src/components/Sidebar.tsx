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
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
  Users,
  Building,
  History,
  Scale,
  ShieldCheck,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { isSuperAdmin, isBranchAdmin, isBillingUser } = useAuth();

  const navItemClass = (tab: string) => `
    w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all
    ${
      activeTab === tab
        ? 'bg-emerald-50 text-emerald-800 border-l-4 border-emerald-600 shadow-xs'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
    }
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
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
              <span>POS Billing Counter</span>
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={navItemClass('invoices')}
            >
              <Receipt className="w-4 h-4 text-slate-500" />
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
                <LayoutDashboard className="w-4 h-4 text-slate-500" />
                <span>Branch Dashboard</span>
              </button>
              <button
                onClick={() => setActiveTab('inventory')}
                className={navItemClass('inventory')}
              >
                <Boxes className="w-4 h-4 text-slate-500" />
                <span>Stock Batches & FEFO</span>
              </button>
              <button
                onClick={() => setActiveTab('catalogue')}
                className={navItemClass('catalogue')}
              >
                <Pill className="w-4 h-4 text-slate-500" />
                <span>Medicine Catalogue</span>
              </button>
              <button
                onClick={() => setActiveTab('purchases')}
                className={navItemClass('purchases')}
              >
                <Truck className="w-4 h-4 text-slate-500" />
                <span>Purchases & Suppliers</span>
              </button>
              <button
                onClick={() => setActiveTab('transfers')}
                className={navItemClass('transfers')}
              >
                <ArrowLeftRight className="w-4 h-4 text-slate-500" />
                <span>Branch Transfers</span>
              </button>
              <button
                onClick={() => setActiveTab('imports')}
                className={navItemClass('imports')}
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                <span>Bulk Import (Excel/CSV)</span>
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={navItemClass('reports')}
              >
                <BarChart3 className="w-4 h-4 text-slate-500" />
                <span>Reports & GST Summary</span>
              </button>
              <button
                onClick={() => setActiveTab('profit-loss')}
                className={navItemClass('profit-loss')}
              >
                <TrendingUp className="w-4 h-4 text-emerald-600" />
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
                <Users className="w-4 h-4 text-slate-500" />
                <span>Staff & Cashiers</span>
              </button>
              {isSuperAdmin && (
                <>
                  <button
                    onClick={() => setActiveTab('branches')}
                    className={navItemClass('branches')}
                  >
                    <Building className="w-4 h-4 text-slate-500" />
                    <span>Branches Setup</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('audit')}
                    className={navItemClass('audit')}
                  >
                    <History className="w-4 h-4 text-slate-500" />
                    <span>Audit Trail Log</span>
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
              <Scale className="w-4 h-4 text-slate-500" />
              <span>Policies & Privacy Portal</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-200 bg-slate-50/60 text-[11px] text-slate-500 space-y-1">
        <div className="flex items-center justify-between font-mono">
          <span>v1.0.0-PROD</span>
          <span className="flex items-center gap-1 text-emerald-600 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
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
