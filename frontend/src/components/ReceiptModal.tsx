import React, { useRef } from 'react';
import { SalesInvoice } from '../types';
import { Printer, Download, CheckCircle2 } from 'lucide-react';
import { Modal } from './Modal';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice | null;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  invoice,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const branch = invoice.branch;
  const createdDate = new Date(invoice.createdAt);
  const formattedDate = createdDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = createdDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tax Invoice & Receipt" maxWidth="2xl">
      <div className="space-y-6">
        {/* Success header */}
        <div className="flex items-center gap-3 p-3 bg-pharmagreen-50 border border-pharmagreen-200 rounded-lg text-pharmagreen-800 text-sm print:hidden">
          <CheckCircle2 className="w-5 h-5 text-pharmagreen-600 flex-shrink-0" />
          <div>
            <span className="font-semibold">Invoice Generated Successfully!</span> Stock has been deducted from the branch inventory.
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-3 print:hidden">
          <div className="text-xs text-slate-500">
            Use standard <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-slate-700">Ctrl+P</kbd> or click Print.
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white rounded-lg font-medium shadow-xs transition-colors focus:ring-2 focus:ring-brand-500"
          >
            <Printer className="w-4 h-4" />
            Print Receipt
          </button>
        </div>

        {/* Printable Invoice Container */}
        <div
          id="printable-receipt"
          ref={receiptRef}
          className="border border-slate-200 rounded-lg p-3 sm:p-6 bg-white font-mono text-xs text-slate-800 leading-relaxed shadow-sm"
        >
          {/* Header */}
          <div className="text-center border-b border-dashed border-slate-300 pb-4 mb-4">
            <h1 className="text-base font-bold text-slate-900 tracking-wider">CONFIDOS PHARMA</h1>
            <p className="text-xs font-semibold text-slate-700">{branch?.name || 'Central Pharmacy Branch'}</p>
            <p className="text-[11px] text-slate-600">{branch?.address}</p>
            <p className="text-[11px] text-slate-600">Tel: {branch?.phone}</p>
            <div className="mt-1 flex flex-wrap justify-center gap-2 sm:gap-4 text-[11px] text-slate-700">
              <span><strong>GSTIN:</strong> {branch?.gstin}</span>
              {branch?.drugLicenseNo && <span><strong>DL:</strong> {branch.drugLicenseNo}</span>}
            </div>
            <div className="mt-2 inline-block px-3 py-0.5 border border-slate-400 font-bold uppercase text-[10px] tracking-widest">
              RETAIL TAX INVOICE
            </div>
          </div>

          {/* Invoice Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] border-b border-dashed border-slate-300 pb-3 mb-3">
            <div>
              <p><strong>Invoice No:</strong> {invoice.invoiceNumber}</p>
              <p><strong>Date & Time:</strong> {formattedDate} {formattedTime}</p>
              <p><strong>Payment Mode:</strong> <span className="font-semibold text-brand-700">{invoice.paymentMethod}</span></p>
            </div>
            <div className="sm:text-right">
              <p><strong>Patient/Customer:</strong> {invoice.customerName || 'Retail Customer'}</p>
              {invoice.customerPhone && <p><strong>Mobile:</strong> {invoice.customerPhone}</p>}
              {invoice.doctorName && <p><strong>Dr. Name:</strong> {invoice.doctorName}</p>}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto touch-scroll">
            <table className="w-full text-left text-[11px] mb-3 min-w-[420px]">
              <thead>
                <tr className="border-b border-slate-400 text-slate-900 font-bold">
                  <th className="py-1">#</th>
                  <th className="py-1">Description</th>
                  <th className="py-1 text-center">Batch</th>
                  <th className="py-1 text-center">Exp</th>
                  <th className="py-1 text-center">HSN</th>
                  <th className="py-1 text-right">Qty</th>
                  <th className="py-1 text-right">MRP</th>
                  <th className="py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.lines.map((line, idx) => (
                  <tr key={line.id || idx}>
                    <td className="py-1.5 align-top">{idx + 1}</td>
                    <td className="py-1.5 align-top font-sans font-medium text-slate-900">
                      {line.medicineName}
                      {line.discountPercent > 0 && (
                        <span className="block text-[10px] text-pharmagreen-700 font-mono">
                          (Disc: {line.discountPercent}%)
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-center align-top">{line.batchNumber}</td>
                    <td className="py-1.5 text-center align-top">
                      {line.expiryDate ? new Date(line.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' }) : '-'}
                    </td>
                    <td className="py-1.5 text-center align-top">{line.hsnCode}</td>
                    <td className="py-1.5 text-right font-bold align-top">{line.quantity}</td>
                    <td className="py-1.5 text-right align-top">₹{line.unitMrp.toFixed(2)}</td>
                    <td className="py-1.5 text-right font-bold align-top">₹{line.lineTotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Totals */}
          <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span>Taxable Value:</span>
              <span>₹{invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.discountTotal > 0 && (
              <div className="flex justify-between text-pharmagreen-700">
                <span>Discount ({((invoice.discountTotal / (invoice.subtotal + invoice.discountTotal)) * 100).toFixed(1)}%):</span>
                <span>-₹{invoice.discountTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>CGST ({invoice.subtotal > 0 ? ((invoice.cgstTotal / invoice.subtotal) * 100).toFixed(1) : '2.5'}%):</span>
              <span>₹{invoice.cgstTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>SGST ({invoice.subtotal > 0 ? ((invoice.sgstTotal / invoice.subtotal) * 100).toFixed(1) : '2.5'}%):</span>
              <span>₹{invoice.sgstTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-700 font-medium">
              <span>Total GST ({invoice.subtotal > 0 ? ((invoice.taxTotal / invoice.subtotal) * 100).toFixed(1) : '5.0'}%):</span>
              <span>₹{invoice.taxTotal.toFixed(2)}</span>
            </div>
            {invoice.roundOff !== 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Round-off:</span>
                <span>{invoice.roundOff > 0 ? `+₹${invoice.roundOff.toFixed(2)}` : `-₹${Math.abs(invoice.roundOff).toFixed(2)}`}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-400 pt-1.5 mt-1">
              <span>NET PAYABLE:</span>
              <span className="text-base text-brand-900 font-black">₹{invoice.grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Footer terms */}
          <div className="mt-4 pt-3 border-t border-dashed border-slate-300 text-center text-[10px] text-slate-500 space-y-0.5">
            <p>Medicines once sold will be taken back only within 7 days in original pack with this bill.</p>
            <p>Schedule H / H1 drugs dispensed strictly on registered medical practitioner prescription.</p>
            <p className="font-semibold text-slate-700 mt-1">*** Thank you for choosing Confidos Pharma. Wish you a speedy recovery! ***</p>
          </div>
        </div>
      </div>
    </Modal>
  );
};
