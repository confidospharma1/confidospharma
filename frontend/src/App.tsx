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
