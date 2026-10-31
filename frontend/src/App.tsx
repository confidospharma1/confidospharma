import React, { useState, useEffect } from 'react';
import { useAuth, AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import {
  ShoppingCart,
  LayoutDashboard,
  Layers,
  Receipt,
  Menu,
} from 'lucide-react';

// Pages
import { LoginPage } from './pages/LoginPage';
import { POSBillingPage } from './pages/POSBillingPage';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { StockMonitoringPage } from './pages/StockMonitoringPage';
import { ProductsPage } from './pages/ProductsPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { TransfersPage } from './pages/TransfersPage';
import { BulkImportPage } from './pages/BulkImportPage';
import { ReportsPage } from './pages/ReportsPage';
import { ProfitLossPage } from './pages/ProfitLossPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { UsersPage } from './pages/UsersPage';
import { BranchesPage } from './pages/BranchesPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { LegalPage } from './pages/LegalPage';

const MainLayout: React.FC = () => {
  const { user, loading, isBillingUser } = useAuth();
  const [activeTab, setActiveTab] = useState('pos');
  const [prefilledPurchaseData, setPrefilledPurchaseData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (user) {
      if (isBillingUser) {
        setActiveTab('pos');
      } else {
        setActiveTab('dashboard');
      }
    }
  }, [user, isBillingUser]);

  // Close mobile sidebar on route change
  const handleSelectTab = (tab: string) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  // Global Keyboard Shortcuts Suite
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      // F2: From ANY page/section, jump to POS Billing Counter and focus search
      if (e.key === 'F2') {
        e.preventDefault();
        handleSelectTab('pos');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('pharmacy:focus-pos-search'));
        }, 60);
        return;
      }

      // F3: Quick search / jump to Medicine Master Catalogue
      if (e.key === 'F3') {
        e.preventDefault();
        if (!isBillingUser) {
          handleSelectTab('catalogue');
        }
        return;
      }

      // F4: Trigger checkout in POS
      if (e.key === 'F4') {
        e.preventDefault();
        if (activeTab === 'pos') {
          window.dispatchEvent(new CustomEvent('pharmacy:pos-checkout'));
        } else {
          handleSelectTab('pos');
        }
        return;
      }

      // F6: Quick jump to Sales Invoices list
      if (e.key === 'F6') {
        e.preventDefault();
        handleSelectTab('invoices');
        return;
      }

      // F7: Quick jump to Stock Batches (FEFO Inventory)
      if (e.key === 'F7') {
        e.preventDefault();
        if (!isBillingUser) {
          handleSelectTab('inventory');
        }
        return;
      }

      // Alt + 1: Quick jump to Counter Operations / POS
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        handleSelectTab('pos');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('pharmacy:focus-pos-search'));
        }, 60);
        return;
      }

      // Alt + 2: Quick jump to Medicine Catalogue
      if (e.altKey && e.key === '2') {
        e.preventDefault();
        if (!isBillingUser) {
          handleSelectTab('catalogue');
        }
        return;
      }

      // Ctrl + Enter: Submit active modal / primary action
      if (e.ctrlKey && e.key === 'Enter') {
        window.dispatchEvent(new CustomEvent('pharmacy:ctrl-enter'));
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [activeTab, isBillingUser]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500 text-xs">
        <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mb-3"></div>
        <p className="font-semibold text-slate-700">Initializing Confidos Pharma Platform...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col antialiased">
      <Navbar
        onOpenPOS={() => handleSelectTab('pos')}
        activeTab={activeTab}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
      />
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={handleSelectTab}
          isOpenMobile={isSidebarOpen}
          onCloseMobile={() => setIsSidebarOpen(false)}
        />
        <main className="flex-1 overflow-y-auto w-full min-w-0 pb-16 lg:pb-0 touch-scroll">
          {activeTab === 'pos' && <POSBillingPage />}
          {activeTab === 'dashboard' && <DashboardPage onNavigate={handleSelectTab} />}
          {activeTab === 'stock-monitoring' && <StockMonitoringPage />}
          {activeTab === 'inventory' && <InventoryPage />}
          {activeTab === 'catalogue' && <ProductsPage />}
          {activeTab === 'purchases' && (
            <PurchasesPage
              prefilledIndent={prefilledPurchaseData}
              onClearPrefill={() => setPrefilledPurchaseData(null)}
            />
          )}
          {activeTab === 'transfers' && <TransfersPage />}
          {activeTab === 'imports' && <BulkImportPage />}
          {activeTab === 'reports' && <ReportsPage />}
          {activeTab === 'profit-loss' && <ProfitLossPage />}
          {activeTab === 'invoices' && <InvoicesPage />}
          {activeTab === 'users' && <UsersPage />}
          {activeTab === 'branches' && <BranchesPage />}
          {activeTab === 'audit' && <AuditLogsPage />}
          {activeTab === 'legal' && <LegalPage />}
        </main>
      </div>

      {/* Mobile Sticky Bottom Navigation Bar (Handheld optimized) */}
      <nav
        aria-label="Mobile Navigation Bar"
        className="fixed bottom-0 inset-x-0 z-30 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 flex items-center justify-around lg:hidden shadow-lg select-none"
      >
        <button
          type="button"
          onClick={() => handleSelectTab('pos')}
          className={`flex flex-col items-center justify-center flex-1 py-1 px-1 transition-colors ${
            activeTab === 'pos' ? 'text-brand-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">POS</span>
        </button>

        {!isBillingUser && (
          <button
            type="button"
            onClick={() => handleSelectTab('dashboard')}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 transition-colors ${
              activeTab === 'dashboard' ? 'text-brand-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Dashboard</span>
          </button>
        )}

        {!isBillingUser && (
          <button
            type="button"
            onClick={() => handleSelectTab('inventory')}
            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 transition-colors ${
              activeTab === 'inventory' ? 'text-brand-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Inventory</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => handleSelectTab('invoices')}
          className={`flex flex-col items-center justify-center flex-1 py-1 px-1 transition-colors ${
            activeTab === 'invoices' ? 'text-brand-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span className="text-[10px] mt-0.5">Invoices</span>
        </button>

        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className="flex flex-col items-center justify-center flex-1 py-1 px-1 text-slate-500 hover:text-slate-800 transition-colors"
          aria-label="Open Full Menu"
        >
          <Menu className="w-4 h-4 text-slate-600" />
          <span className="text-[10px] mt-0.5">More</span>
        </button>
      </nav>

    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
