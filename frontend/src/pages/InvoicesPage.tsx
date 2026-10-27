import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { SalesInvoice } from '../types';
import { Receipt, Search, Printer, Ban, AlertCircle, Filter, X } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { ReceiptModal } from '../components/ReceiptModal';
import { FilterButton } from '../components/FilterButton';
import { FilterField, FilterSelect, FilterInput } from '../components/FilterControls';

export const InvoicesPage: React.FC = () => {
  const { currentBranch, selectedBranchId, isBillingUser } = useAuth();

  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Filter State
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const activeFilterCount = [
    statusFilter,
    paymentMethodFilter,
    startDate,
    endDate,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setStatusFilter('');
    setPaymentMethodFilter('');
    setStartDate('');
    setEndDate('');
  };

  // View Receipt Modal
  const [activeInvoice, setActiveInvoice] = useState<SalesInvoice | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Cancel Modal
  const [cancelInvoiceTarget, setCancelInvoiceTarget] = useState<SalesInvoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const data = await api.getInvoices({
        branchId: selectedBranchId,
        invoiceNumber: search.trim() || undefined,
        status: statusFilter || undefined,
        paymentMethod: paymentMethodFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setInvoices(data.invoices || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadInvoices();
    }, 200);
    return () => clearTimeout(timer);
  }, [selectedBranchId, search, statusFilter, paymentMethodFilter, startDate, endDate]);

  const handleOpenReceipt = async (id: string) => {
    try {
      const inv = await api.getInvoice(id);
      setActiveInvoice(inv);
      setShowReceiptModal(true);
    } catch (e) {}
  };

  const handleCancelInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelInvoiceTarget) return;

    setIsCancelling(true);
    setMessage(null);
    try {
      await api.cancelInvoice(cancelInvoiceTarget.id, cancelReason);
      setMessage({
        text: `Invoice ${cancelInvoiceTarget.invoiceNumber} cancelled and medicine stock restored to branch.`,
        type: 'success',
      });
      setCancelInvoiceTarget(null);
      setCancelReason('');
      loadInvoices();
    } catch (err: any) {
      setMessage({ text: err.message || 'Failed to cancel invoice.', type: 'error' });
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto overflow-y-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Sales Invoices Register</h1>
            <Badge variant="neutral" size="sm">
              {currentBranch?.name} ({currentBranch?.code})
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable transaction record, reprint receipts, and audited cancellation management.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-lg text-xs flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-pharmagreen-50 text-pharmagreen-800 border border-pharmagreen-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="font-bold underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar: Search & Filter Button */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Invoice # (e.g. INV-VJA-), customer name, or phone..."
              className="w-full pl-10 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <FilterButton
              activeCount={activeFilterCount}
              onReset={resetFilters}
              title="Filter Sales Invoices"
              buttonLabel="Filter Invoices"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FilterField label="Invoice Status">
                  <FilterSelect
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    options={[
                      { label: 'All Invoices (Completed & Cancelled)', value: '' },
                      { label: 'Completed Invoices Only', value: 'COMPLETED' },
                      { label: 'Cancelled / Voided Only', value: 'CANCELLED' },
                    ]}
                  />
                </FilterField>

                <FilterField label="Payment Method">
                  <FilterSelect
                    value={paymentMethodFilter}
                    onChange={(e) => setPaymentMethodFilter(e.target.value)}
                    options={[
                      { label: 'All Payment Modes', value: '' },
                      { label: 'Cash Payment', value: 'CASH' },
                      { label: 'UPI / QR Code', value: 'UPI' },
                      { label: 'Card (Credit/Debit)', value: 'CARD' },
                    ]}
                  />
                </FilterField>

                <FilterField label="From Date">
                  <FilterInput
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </FilterField>

                <FilterField label="To Date">
                  <FilterInput
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </FilterField>
              </div>
            </FilterButton>
          </div>
        </div>

        {/* Active Filter Badges */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
            <span className="text-[11px] font-semibold text-slate-500 mr-1">Active Filters:</span>
            {statusFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Status: {statusFilter}
                <button type="button" onClick={() => setStatusFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {paymentMethodFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Payment: {paymentMethodFilter}
                <button type="button" onClick={() => setPaymentMethodFilter('')} className="hover:text-brand-900">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {(startDate || endDate) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-200">
                Date: {startDate || 'Start'} to {endDate || 'Now'}
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="hover:text-brand-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] text-slate-500 hover:text-rose-600 font-semibold underline ml-1"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-3">Date & Time</th>
                <th className="py-3 px-3">Customer / Patient</th>
                <th className="py-3 px-3 text-center">Payment</th>
                <th className="py-3 px-3 text-right">Taxable</th>
                <th className="py-3 px-3 text-right">GST Tax</th>
                <th className="py-3 px-4 text-right">Grand Total</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Loading invoices...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <p className="text-sm font-bold text-slate-800">
                      {activeFilterCount > 0 || search
                        ? 'No sales invoices match your filter criteria.'
                        : 'No sales recorded yet.'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {activeFilterCount > 0 || search
                        ? 'Try clearing the applied filters or adjusting the invoice number search.'
                        : 'Invoices generated from the POS counter will appear here in real-time.'}
                    </p>
                    {(activeFilterCount > 0 || search) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          resetFilters();
                        }}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold transition-colors"
                      >
                        Clear Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {new Date(inv.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-3 text-slate-800">
                      {inv.customerName || 'Retail Customer'}
                      {inv.customerPhone && <span className="block text-[11px] text-slate-400 font-mono">{inv.customerPhone}</span>}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant="neutral" size="sm">
                        {inv.paymentMethod}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600">₹{inv.subtotal.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600">₹{inv.taxTotal.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-brand-900">
                      ₹{inv.grandTotal.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant={inv.status === 'COMPLETED' ? 'brandGreen' : 'danger'} size="sm">
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenReceipt(inv.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-xs transition-colors"
                          title="Print or view tax invoice"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </button>
                        {inv.status === 'COMPLETED' && !isBillingUser && (
                          <button
                            onClick={() => {
                              setCancelInvoiceTarget(inv);
                              setCancelReason('');
                            }}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Cancel Invoice & Restore Stock"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Controlled Invoice Cancellation */}
      <Modal
        isOpen={!!cancelInvoiceTarget}
        onClose={() => setCancelInvoiceTarget(null)}
        title="Audited Invoice Cancellation"
        maxWidth="md"
      >
        {cancelInvoiceTarget && (
          <form onSubmit={handleCancelInvoice} className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Cancellation Rule Notice (PRD 8.5):</p>
                <p className="mt-0.5 text-slate-700">
                  Completed invoices cannot be silently deleted. Cancelling this bill will preserve the original record, restore sold medicine units back to active branch stock, and write an immutable audit log.
                </p>
              </div>
            </div>

            <div className="text-xs space-y-1">
              <p><strong>Invoice Number:</strong> {cancelInvoiceTarget.invoiceNumber}</p>
              <p><strong>Total Amount:</strong> ₹{cancelInvoiceTarget.grandTotal.toFixed(2)}</p>
              <p><strong>Customer:</strong> {cancelInvoiceTarget.customerName || 'Retail Customer'}</p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Mandatory Reason for Cancellation *
              </label>
              <textarea
                required
                rows={3}
                placeholder="e.g. Customer returned unopened medicines with bill within policy period..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCancelInvoiceTarget(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600"
              >
                Go Back
              </button>
              <button
                type="submit"
                disabled={isCancelling}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
              >
                {isCancelling ? 'Reversing...' : 'Confirm Cancellation'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Tax Receipt Modal */}
      <ReceiptModal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        invoice={activeInvoice}
      />
    </div>
  );
};
