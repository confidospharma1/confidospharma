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

        {/* Printable Invoice Container - Formatted for 3-inch (76mm–80mm) Thermal Printer */}
        <div
          id="printable-receipt"
          ref={receiptRef}
          className="border border-slate-300 rounded-xl p-5 bg-white font-mono text-[11px] text-slate-800 leading-normal shadow-sm w-full max-w-[340px] sm:max-w-[350px] mx-auto text-center"
        >
          {/* Centered Logo on the very top */}
          <div className="mb-2.5">
            <img
              src="/confidos-logo.png"
              alt="Confidos Pharma"
              className="h-10 w-auto max-w-[150px] object-contain mx-auto block mb-1.5"
            />
            {/* Pharmacy Branch & Legal Info - Centered under the logo */}
            <h2 className="text-xs font-bold text-slate-900 tracking-wide uppercase">
              {branch?.name || 'Central Pharmacy Branch'}
            </h2>
            {branch?.address && (
              <p className="text-[10px] text-slate-600 mt-0.5 leading-tight">{branch.address}</p>
            )}
            {branch?.phone && (
              <p className="text-[10px] text-slate-600 leading-tight">Tel: {branch.phone}</p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-x-2.5 text-[9.5px] text-slate-700 mt-0.5">
              <span><strong>GSTIN:</strong> {branch?.gstin || 'N/A'}</span>
              {branch?.drugLicenseNo && <span><strong>DL:</strong> {branch.drugLicenseNo}</span>}
            </div>
            <div className="mt-1.5 inline-block px-2.5 py-0.5 border border-slate-700 font-bold uppercase text-[9px] tracking-widest text-slate-900 rounded-xs">
              RETAIL TAX INVOICE
            </div>
          </div>

          {/* Invoice & Patient Details - Centered Block with Spacing */}
          <div className="border-t border-b border-dashed border-slate-300 py-2.5 my-2.5 text-[10px] space-y-1 text-slate-700">
            <div className="flex justify-between items-center px-1">
              <span className="font-semibold text-slate-600">Invoice No:</span>
              <span className="font-bold text-slate-900 font-mono">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between items-center px-1">
              <span className="font-semibold text-slate-600">Date & Time:</span>
              <span className="text-slate-800">{formattedDate} {formattedTime}</span>
            </div>
            <div className="flex justify-between items-center px-1">
              <span className="font-semibold text-slate-600">Payment Mode:</span>
              <span className="font-bold text-brand-700 uppercase">{invoice.paymentMethod}</span>
            </div>
            <div className="flex justify-between items-center px-1">
              <span className="font-semibold text-slate-600">Patient/Customer:</span>
              <span className="font-bold text-slate-900">{invoice.customerName || 'Retail Customer'}</span>
            </div>
            {invoice.customerPhone && (
              <div className="flex justify-between items-center px-1">
                <span className="font-semibold text-slate-600">Mobile:</span>
                <span className="text-slate-800">{invoice.customerPhone}</span>
              </div>
            )}
            {invoice.doctorName && (
              <div className="flex justify-between items-center px-1">
                <span className="font-semibold text-slate-600">Dr. Name:</span>
                <span className="text-slate-800">{invoice.doctorName}</span>
              </div>
            )}
          </div>

          {/* Items Table - Scaled for 3-inch (76mm) thermal rolls without clipping */}
          <div className="w-full mb-2.5">
            <table className="w-full text-left text-[10px] border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-800 text-slate-900 font-bold uppercase text-[9px]">
                  <th className="py-1 text-left w-5/12">Item Description</th>
                  <th className="py-1 text-center w-2/12">Qty</th>
                  <th className="py-1 text-right w-2/12">MRP</th>
                  <th className="py-1 text-right w-3/12">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoice.lines.map((line, idx) => {
                  const expStr = line.expiryDate
                    ? new Date(line.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' })
                    : '-';
                  return (
                    <tr key={line.id || idx}>
                      <td className="py-1.5 pr-1 align-top text-left">
                        <div className="font-bold text-slate-900 leading-tight">
                          {idx + 1}. {line.medicineName}
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono leading-tight mt-0.5">
                          B:{line.batchNumber} | Exp:{expStr} {line.hsnCode ? `| HSN:${line.hsnCode}` : ''}
                        </div>
                        {line.discountPercent > 0 && (
                          <div className="text-[9px] text-emerald-700 font-semibold font-mono">
                            (Disc: {line.discountPercent}%)
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 px-1 text-center font-bold align-top font-mono text-slate-900">
                        {line.quantity}
                      </td>
                      <td className="py-1.5 px-1 text-right align-top font-mono text-slate-700">
                        ₹{line.unitMrp.toFixed(2)}
                      </td>
                      <td className="py-1.5 pl-1 text-right font-bold align-top font-mono text-slate-900">
                        ₹{line.lineTotal.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Financial Totals */}
          <div className="border-t border-dashed border-slate-300 pt-2 space-y-0.5 text-[10px] text-slate-700">
            <div className="flex justify-between px-1">
              <span>Taxable Value:</span>
              <span className="font-mono">₹{invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.discountTotal > 0 && (
              <div className="flex justify-between px-1 text-emerald-700 font-semibold">
                <span>Discount ({((invoice.discountTotal / (invoice.subtotal + invoice.discountTotal)) * 100).toFixed(1)}%):</span>
                <span className="font-mono">-₹{invoice.discountTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between px-1 text-slate-600">
              <span>CGST ({invoice.subtotal > 0 ? ((invoice.cgstTotal / invoice.subtotal) * 100).toFixed(1) : '2.5'}%):</span>
              <span className="font-mono">₹{invoice.cgstTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between px-1 text-slate-600">
              <span>SGST ({invoice.subtotal > 0 ? ((invoice.sgstTotal / invoice.subtotal) * 100).toFixed(1) : '2.5'}%):</span>
              <span className="font-mono">₹{invoice.sgstTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between px-1 text-slate-700 font-semibold">
              <span>Total GST ({invoice.subtotal > 0 ? ((invoice.taxTotal / invoice.subtotal) * 100).toFixed(1) : '5.0'}%):</span>
              <span className="font-mono">₹{invoice.taxTotal.toFixed(2)}</span>
            </div>
            {invoice.roundOff !== 0 && (
              <div className="flex justify-between px-1 text-slate-500">
                <span>Round-off:</span>
                <span className="font-mono">{invoice.roundOff > 0 ? `+₹${invoice.roundOff.toFixed(2)}` : `-₹${Math.abs(invoice.roundOff).toFixed(2)}`}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-xs font-bold text-slate-900 border-t-2 border-slate-800 pt-1.5 mt-1.5 px-1">
              <span className="tracking-wider">NET PAYABLE:</span>
              <span className="text-sm font-black font-mono">₹{invoice.grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Footer terms */}
          <div className="mt-3 pt-2.5 border-t border-dashed border-slate-300 text-center text-[8.5px] text-slate-500 space-y-0.5">
            <p>Medicines once sold will be taken back only within 7 days in original pack with this bill.</p>
            <p>Schedule H / H1 drugs dispensed strictly on registered medical practitioner prescription.</p>
            <p className="font-bold text-slate-800 mt-1">*** Thank you for choosing Confidos Pharma ***</p>
            <p className="text-slate-500">Wish you a speedy recovery!</p>
          </div>
        </div>
      </div>
    </Modal>
  );
};
