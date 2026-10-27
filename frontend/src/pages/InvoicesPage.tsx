import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { SalesInvoice } from '../types';
import { Receipt, Search, Printer, Ban, AlertCircle } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { ReceiptModal } from '../components/ReceiptModal';

export const InvoicesPage: React.FC = () => {
  const { currentBranch, selectedBranchId, isBillingUser } = useAuth();

  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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
        invoiceNumber: search,
      });
      setInvoices(data.invoices || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, [selectedBranchId, search]);

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

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Invoice # (e.g. INV-VJA-)"
            className="w-full pl-10 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
          />
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
                    <p className="text-sm font-bold text-slate-800">No sales recorded yet.</p>
                    <p className="text-xs text-slate-500 mt-1">Invoices generated from the POS counter will appear here in real-time.</p>
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
