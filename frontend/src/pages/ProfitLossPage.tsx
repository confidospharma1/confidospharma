import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ProfitLossReport, Expense } from '../types';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Plus,
  Trash2,
  AlertCircle,
  HelpCircle,
  CheckCircle,
  ShoppingBag,
  Receipt,
  FileText,
  Boxes,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Filter,
  X,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { FilterButton } from '../components/FilterButton';
import { FilterField, FilterSelect, FilterInput } from '../components/FilterControls';

export const ProfitLossPage: React.FC = () => {
  const { currentBranch, selectedBranchId, isBillingUser, isSuperAdmin } = useAuth();

  const [datePreset, setDatePreset] = useState<'today' | 'this_month' | 'last_30_days' | 'custom'>('this_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Operating Expenses Filter State
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('');
  const [expensePaymentFilter, setExpensePaymentFilter] = useState('');
  const [expenseMinAmount, setExpenseMinAmount] = useState('');
  const [expenseMaxAmount, setExpenseMaxAmount] = useState('');

  const activeExpenseFilterCount = [
    expenseCategoryFilter,
    expensePaymentFilter,
    expenseMinAmount,
    expenseMaxAmount,
  ].filter(Boolean).length;

  const resetExpenseFilters = () => {
    setExpenseCategoryFilter('');
    setExpensePaymentFilter('');
    setExpenseMinAmount('');
    setExpenseMaxAmount('');
  };

  // Filtered Expenses
  const filteredExpenses = expenses.filter((exp) => {
    if (expenseSearch.trim()) {
      const q = expenseSearch.toLowerCase();
      const matchDesc = exp.description?.toLowerCase().includes(q);
      const matchRef = exp.referenceNo?.toLowerCase().includes(q);
      const matchCat = exp.category?.toLowerCase().includes(q);
      if (!matchDesc && !matchRef && !matchCat) return false;
    }
    if (expenseCategoryFilter && exp.category !== expenseCategoryFilter) {
      return false;
    }
    if (expensePaymentFilter && exp.paymentMode !== expensePaymentFilter) {
      return false;
    }
    if (expenseMinAmount && exp.amount < parseFloat(expenseMinAmount)) {
      return false;
    }
    if (expenseMaxAmount && exp.amount > parseFloat(expenseMaxAmount)) {
      return false;
    }
    return true;
  });

  // Record Expense Modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: 'RENT',
    description: '',
    amount: '',
    paymentMode: 'CASH',
    referenceNo: '',
    notes: '',
    expenseDate: new Date().toISOString().split('T')[0],
  });
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);

  // Helper to compute date strings for presets
  const applyPreset = (preset: 'today' | 'this_month' | 'last_30_days' | 'custom') => {
    setDatePreset(preset);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      setStartDate(firstDay);
      setEndDate(todayStr);
    } else if (preset === 'last_30_days') {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      setStartDate(past30);
      setEndDate(todayStr);
    }
  };

  useEffect(() => {
    applyPreset('this_month');
  }, []);

  const fetchReport = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const [plData, expData] = await Promise.all([
        api.getProfitLoss(selectedBranchId, startDate, endDate),
        api.getExpenses({ branchId: selectedBranchId, startDate, endDate }),
      ]);
      setReport(plData);
      setExpenses(expData.expenses || []);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load Profit & Loss report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startDate && endDate) {
      fetchReport();
    }
  }, [selectedBranchId, startDate, endDate]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseSubmitting(true);
    try {
      await api.createExpense({
        branchId: selectedBranchId,
        category: expenseForm.category,
        description: expenseForm.description,
        amount: parseFloat(expenseForm.amount),
        paymentMode: expenseForm.paymentMode,
        referenceNo: expenseForm.referenceNo,
        notes: expenseForm.notes,
        expenseDate: expenseForm.expenseDate,
      });
      setShowExpenseModal(false);
      setExpenseForm({
        category: 'RENT',
        description: '',
        amount: '',
        paymentMode: 'CASH',
        referenceNo: '',
        notes: '',
        expenseDate: new Date().toISOString().split('T')[0],
      });
      fetchReport();
    } catch (err: any) {
      alert(err.message || 'Failed to record expense');
    } finally {
      setExpenseSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this expense record?')) return;
    try {
      await api.deleteExpense(id);
      fetchReport();
    } catch (err: any) {
      alert(err.message || 'Failed to delete expense');
    }
  };

  const formatCurrency = (val: number | undefined) => {
    const num = val || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (isBillingUser) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-3">
        <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Access Restricted</h2>
        <p className="text-xs text-slate-500">
          Profit & Loss financial statements and operating expenditure ledgers are confidential and only accessible to Branch Administrators and Super Administrators.
        </p>
      </div>
    );
  }

  const s = report?.summary;
  const isNetProfit = (s?.netProfit || 0) >= 0;

  return (
    <div className="p-3.5 sm:p-5 md:p-8 space-y-4 sm:space-y-6 max-w-7xl mx-auto overflow-y-auto">
      {/* Page Title & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Profit & Loss Statement</h1>
            <Badge variant="neutral" size="sm">Accrual Basis</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Realized Net Sales, Cost of Goods Sold (COGS), Operating Expenses, and Net Profit for {currentBranch?.name || 'All Branches'}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Presets */}
          <div className="bg-white border border-slate-200 rounded-lg p-1 flex flex-wrap items-center gap-1 text-xs">
            <button
              onClick={() => applyPreset('today')}
              className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                datePreset === 'today' ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => applyPreset('this_month')}
              className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                datePreset === 'this_month' ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => applyPreset('last_30_days')}
              className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                datePreset === 'last_30_days' ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Last 30 Days
            </button>
            <button
              onClick={() => setDatePreset('custom')}
              className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                datePreset === 'custom' ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Custom
            </button>
          </div>

          {datePreset === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 p-1 rounded-lg">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1 text-xs border border-slate-200 rounded font-mono"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1 text-xs border border-slate-200 rounded font-mono"
              />
            </div>
          )}

          <button
            onClick={() => setShowExpenseModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            Record Operating Expense
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Accounting Domain Notice: Purchases vs COGS */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-3">
        <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Understanding Pharmacy Financial Statements:</p>
          <p className="text-[11px] text-blue-800 leading-relaxed">
            In standard accounting, <strong>Purchases</strong> are capital asset additions to your stock room (not expenses).
            <strong> Cost of Goods Sold (COGS)</strong> strictly measures the batch acquisition cost of the medicines that were actually sold to customers during this period.
            Gross Profit reflects customer revenue minus COGS, while Operating Expenses cover overheads such as shop rent, staff salaries, and electricity.
          </p>
        </div>
      </div>

      {/* Executive Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Net Sales */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Net Sales Revenue</span>
            <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <ShoppingBag className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-xl font-bold font-mono text-slate-900">
              {loading ? '...' : formatCurrency(s?.netSales)}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              Gross: {formatCurrency(s?.grossSales)}
            </span>
          </div>
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100 flex justify-between">
            <span>Discounts: {formatCurrency(s?.salesDiscounts)}</span>
            <span>Returns: {formatCurrency(s?.salesReturns)}</span>
          </div>
        </div>

        {/* 2. Cost of Goods Sold */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cost of Goods Sold (COGS)</span>
            <span className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <Boxes className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-xl font-bold font-mono text-slate-900">
              {loading ? '...' : formatCurrency(s?.costOfGoodsSold)}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              Direct batch acquisition cost
            </span>
          </div>
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100">
            <span>Sold stock units at purchase cost</span>
          </div>
        </div>

        {/* 3. Gross Profit */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Gross Profit</span>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-xl font-bold font-mono text-emerald-700">
              {loading ? '...' : formatCurrency(s?.grossProfit)}
            </div>
            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              Margin: {s?.grossMarginPercent?.toFixed(1) || 0}%
            </span>
          </div>
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100">
            <span>Net Sales − COGS</span>
          </div>
        </div>

        {/* 4. Operating Expenses */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Operating Expenses</span>
            <span className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
              <FileText className="w-4 h-4" />
            </span>
          </div>
          <div className="my-2">
            <div className="text-xl font-bold font-mono text-rose-700">
              {loading ? '...' : formatCurrency(s?.operatingExpenses)}
            </div>
            <span className="text-[10px] text-slate-500 font-medium">
              {expenses.length} expense vouchers logged
            </span>
          </div>
          <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100">
            <span>Rent, Salaries, Electricity, etc.</span>
          </div>
        </div>

        {/* 5. Net Profit / Loss */}
        <div className={`p-4 rounded-xl border shadow-xs flex flex-col justify-between ${
          isNetProfit ? 'bg-pharmagreen-50/50 border-pharmagreen-200' : 'bg-rose-50/50 border-rose-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Net Realized Profit</span>
            <span className={`p-1.5 rounded-lg ${isNetProfit ? 'bg-pharmagreen-100 text-pharmagreen-700' : 'bg-rose-100 text-rose-700'}`}>
              {isNetProfit ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            </span>
          </div>
          <div className="my-2">
            <div className={`text-xl font-bold font-mono ${isNetProfit ? 'text-pharmagreen-800' : 'text-rose-800'}`}>
              {loading ? '...' : formatCurrency(s?.netProfit)}
            </div>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
              isNetProfit ? 'bg-pharmagreen-100 text-pharmagreen-800 border-pharmagreen-300' : 'bg-rose-100 text-rose-800 border-rose-300'
            }`}>
              Net Margin: {s?.netProfitMarginPercent?.toFixed(1) || 0}%
            </span>
          </div>
          <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-200/60">
            <span>Gross Profit − Expenses</span>
          </div>
        </div>
      </div>

      {/* Two-Column Breakdown: Inward Inventory Purchases vs Operating Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Inventory Purchases Asset Register (Separate from COGS) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Inventory Purchases (Stock Capital / Asset)</h2>
              <p className="text-[10px] text-slate-500">
                Goods purchased into branch inventory during this period.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-blue-900 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
              {formatCurrency(report?.inventoryPurchasesSummary?.totalPurchases)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[10px] text-slate-400 block uppercase">Supplier Discounts Received</span>
              <span className="font-mono font-bold text-emerald-700">
                {formatCurrency(report?.inventoryPurchasesSummary?.purchaseDiscounts)}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[10px] text-slate-400 block uppercase">Input GST Paid on Purchases</span>
              <span className="font-mono font-bold text-slate-700">
                {formatCurrency(report?.inventoryPurchasesSummary?.purchaseTaxes)}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[10px] text-slate-400 block uppercase">Amount Paid to Suppliers</span>
              <span className="font-mono font-bold text-slate-800">
                {formatCurrency(report?.inventoryPurchasesSummary?.paidAmount)}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-[10px] text-slate-400 block uppercase">Supplier Outstanding (Credit)</span>
              <span className="font-mono font-bold text-amber-700">
                {formatCurrency(report?.inventoryPurchasesSummary?.outstandingAmount)}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            Note: Unsold inventory sits on your pharmacy shelves as current assets. Only items that were sold are deducted as Cost of Goods Sold.
          </p>
        </div>

        {/* Right: Operating Expenses Breakdown */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Operating Expenses by Category</h2>
              <p className="text-[10px] text-slate-500">
                Breakdown of branch operational overheads for this period.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-rose-800 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
              {formatCurrency(s?.operatingExpenses)}
            </span>
          </div>

          {report?.expenseBreakdown && Object.keys(report.expenseBreakdown).length > 0 ? (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {Object.entries(report.expenseBreakdown).map(([cat, amt]) => {
                const total = s?.operatingExpenses || 1;
                const pct = Math.round((amt / total) * 100);
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="text-slate-700">{cat}</span>
                      <span className="font-mono text-slate-900 font-bold">{formatCurrency(amt)} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-rose-500 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              No operating expenses recorded for this period.
            </div>
          )}
        </div>
      </div>

      {/* Operating Expenses Table & Ledger */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Operating Expenses Ledger</h2>
            <p className="text-[10px] text-slate-500">Audited operational vouchers for rent, salaries, utilities, transport, etc.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search description, voucher..."
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-52 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:bg-white transition-colors"
              />
            </div>

            <FilterButton
              activeFilterCount={activeExpenseFilterCount}
              onReset={resetExpenseFilters}
              buttonLabel="Filter Expenses"
              popoverWidth="w-80"
              align="right"
            >
              <div className="space-y-3">
                <FilterField label="Expense Category">
                  <FilterSelect
                    value={expenseCategoryFilter}
                    onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                    options={[
                      { label: 'All Categories', value: '' },
                      { label: 'Store / Shop Rent', value: 'RENT' },
                      { label: 'Staff & Pharmacist Salaries', value: 'SALARIES' },
                      { label: 'Electricity & AC', value: 'ELECTRICITY' },
                      { label: 'Internet & Telephony', value: 'INTERNET' },
                      { label: 'Delivery & Transport', value: 'TRANSPORT' },
                      { label: 'Bags & Packaging', value: 'PACKAGING' },
                      { label: 'Maintenance & Repairs', value: 'MAINTENANCE' },
                      { label: 'Marketing & Advertising', value: 'MARKETING' },
                      { label: 'Other Operating Expenses', value: 'OTHER' },
                    ]}
                  />
                </FilterField>

                <FilterField label="Payment Mode">
                  <FilterSelect
                    value={expensePaymentFilter}
                    onChange={(e) => setExpensePaymentFilter(e.target.value)}
                    options={[
                      { label: 'All Payment Modes', value: '' },
                      { label: 'Cash Counter', value: 'CASH' },
                      { label: 'UPI / QR Code', value: 'UPI' },
                      { label: 'Bank Transfer / NEFT', value: 'BANK_TRANSFER' },
                      { label: 'Debit/Credit Card', value: 'CARD' },
                      { label: 'Cheque', value: 'CHEQUE' },
                    ]}
                  />
                </FilterField>

                <FilterField label="Amount Range (₹)">
                  <div className="grid grid-cols-2 gap-2">
                    <FilterInput
                      type="number"
                      placeholder="Min ₹"
                      value={expenseMinAmount}
                      onChange={(e) => setExpenseMinAmount(e.target.value)}
                    />
                    <FilterInput
                      type="number"
                      placeholder="Max ₹"
                      value={expenseMaxAmount}
                      onChange={(e) => setExpenseMaxAmount(e.target.value)}
                    />
                  </div>
                </FilterField>
              </div>
            </FilterButton>

            <button
              onClick={() => setShowExpenseModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Expense
            </button>
          </div>
        </div>

        {/* Active Expense Filter Badges */}
        {(activeExpenseFilterCount > 0 || expenseSearch) && (
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center flex-wrap gap-2 text-xs">
            <span className="text-slate-500 font-medium text-[11px]">Filtered by:</span>
            {expenseSearch && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 text-[11px]">
                Search: "{expenseSearch}"
                <button onClick={() => setExpenseSearch('')} className="hover:text-rose-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {expenseCategoryFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-[11px]">
                Category: {expenseCategoryFilter}
                <button onClick={() => setExpenseCategoryFilter('')} className="hover:text-rose-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {expensePaymentFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-[11px]">
                Mode: {expensePaymentFilter}
                <button onClick={() => setExpensePaymentFilter('')} className="hover:text-rose-500">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {(expenseMinAmount || expenseMaxAmount) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-800 text-[11px]">
                Amount: ₹{expenseMinAmount || '0'} - ₹{expenseMaxAmount || '∞'}
                <button
                  onClick={() => {
                    setExpenseMinAmount('');
                    setExpenseMaxAmount('');
                  }}
                  className="hover:text-rose-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              onClick={() => {
                setExpenseSearch('');
                resetExpenseFilters();
              }}
              className="text-[11px] text-brand-600 hover:text-brand-800 font-semibold underline ml-1"
            >
              Clear All
            </button>
          </div>
        )}

        <div className="overflow-x-auto touch-scroll">
          <table className="w-full text-left text-xs min-w-[650px]">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-3">Payment Mode</th>
                <th className="py-2.5 px-3">Reference / Voucher</th>
                <th className="py-2.5 px-4 text-right">Amount (₹)</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    {expenses.length === 0
                      ? 'No operating expenses recorded in this period.'
                      : 'No expenses match the selected filters.'}
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-slate-600">
                      {new Date(exp.expenseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-900">{exp.description}</td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">{exp.paymentMode}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{exp.referenceNo || '—'}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                      ₹{exp.amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                        title="Delete Expense"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Margin Contributors Table */}
      {report?.topProducts && report.topProducts.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">Top Medicines by Gross Profit Contribution</h2>
            <p className="text-[10px] text-slate-500">Products delivering the highest realized gross profit in this period.</p>
          </div>
          <div className="overflow-x-auto touch-scroll">
            <table className="w-full text-left text-xs min-w-[650px]">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Medicine Name</th>
                  <th className="py-2.5 px-3 text-right">Units Sold</th>
                  <th className="py-2.5 px-3 text-right">Sales Revenue</th>
                  <th className="py-2.5 px-3 text-right">Acquisition COGS</th>
                  <th className="py-2.5 px-4 text-right">Gross Profit</th>
                  <th className="py-2.5 px-3 text-center">Gross Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {report.topProducts.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 font-sans font-bold text-slate-900">{p.brandName}</td>
                    <td className="py-2.5 px-3 text-right text-slate-700">{p.quantitySold}</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">₹{p.revenue.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-600">₹{p.cogs.toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-emerald-700">₹{p.grossProfit.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-center font-sans">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {p.marginPercent.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Operating Expense Modal */}
      <Modal isOpen={showExpenseModal} onClose={() => setShowExpenseModal(false)} title="Record Operating Expense Voucher" maxWidth="lg">
        <form onSubmit={handleCreateExpense} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Expense Category *</label>
              <select
                required
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-semibold"
              >
                <option value="RENT">Store / Shop Rent</option>
                <option value="SALARIES">Staff & Pharmacist Salaries</option>
                <option value="ELECTRICITY">Electricity & Air Conditioning</option>
                <option value="INTERNET">Internet & Telephony</option>
                <option value="TRANSPORT">Delivery & Transport</option>
                <option value="PACKAGING">Bags & Packaging Materials</option>
                <option value="MAINTENANCE">Maintenance & Repairs</option>
                <option value="MARKETING">Marketing & Advertising</option>
                <option value="OTHER">Other Operating Expenses</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="e.g. 15000"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono font-bold text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Description / Narration *</label>
            <input
              type="text"
              required
              placeholder="e.g. Monthly rent for October 2026 to building owner"
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Payment Mode</label>
              <select
                value={expenseForm.paymentMode}
                onChange={(e) => setExpenseForm({ ...expenseForm, paymentMode: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-semibold"
              >
                <option value="CASH">Cash Counter</option>
                <option value="UPI">UPI / QR Code</option>
                <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                <option value="CARD">Debit/Credit Card</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Reference / Voucher #</label>
              <input
                type="text"
                placeholder="e.g. TXN-998822"
                value={expenseForm.referenceNo}
                onChange={(e) => setExpenseForm({ ...expenseForm, referenceNo: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Expense Date *</label>
              <input
                type="date"
                required
                value={expenseForm.expenseDate}
                onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowExpenseModal(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={expenseSubmitting}
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              {expenseSubmitting ? 'Recording...' : 'Record Expense Voucher'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
