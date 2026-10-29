import React, { useState, useEffect } from 'react';
import { useAuth, AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';

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

  useEffect(() => {
    if (user) {
      if (isBillingUser) {
        setActiveTab('pos');
      } else {
        setActiveTab('dashboard');
      }
    }
  }, [user, isBillingUser]);

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
      <Navbar onOpenPOS={() => setActiveTab('pos')} activeTab={activeTab} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'pos' && <POSBillingPage />}
          {activeTab === 'dashboard' && <DashboardPage onNavigate={setActiveTab} />}
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
