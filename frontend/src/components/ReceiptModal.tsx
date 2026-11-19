import React, { useRef, useState, useEffect } from 'react';
import { SalesInvoice } from '../types';
import { api } from '../services/api';
import { CheckCircle2, MessageCircle, Send, Copy, Check, Printer, Smartphone, Building2, ExternalLink, Zap } from 'lucide-react';
import { Modal } from './Modal';

export const OFFICE_PHONE = '6302931223';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice | null;
}

/**
 * Formats a lightweight plain-text digital receipt (< 1 KB) optimized for WhatsApp delivery.
 * Accurately displays originating branch name and branch code.
 */
export const formatWhatsAppBillText = (invoice: SalesInvoice, officeNumber = OFFICE_PHONE): string => {
  const branch = invoice.branch;
  const branchName = branch?.name || 'Central Pharmacy Branch';
  const branchCode = branch?.code || 'MAIN';
  const createdDate = new Date(invoice.createdAt);
  const formattedDate = createdDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = createdDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const linesText = (invoice.lines || [])
    .map((line, idx) => {
      const expStr = line.expiryDate
        ? new Date(line.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' })
        : '-';
      const discStr = line.discountPercent > 0 ? ` (Disc ${line.discountPercent}%)` : '';
      return `${idx + 1}. *${line.medicineName}*\n   Batch: ${line.batchNumber} | Exp: ${expStr}\n   Qty: ${line.quantity} ${line.unit || 'units'} x ₹${line.unitMrp.toFixed(2)} = *₹${line.lineTotal.toFixed(2)}*${discStr}`;
    })
    .join('\n\n');

  let text = `🏥 *CONFIDOS PHARMA*\n`;
  text += `📍 *Branch:* ${branchName} (Code: *${branchCode}*)\n`;
  if (branch?.address) text += `${branch.address}\n`;
  if (branch?.gstin) text += `GSTIN: ${branch.gstin} `;
  if (branch?.drugLicenseNo) text += `| DL: ${branch.drugLicenseNo}`;
  text += `\n📞 *Office/Helpline: ${officeNumber}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🧾 *DIGITAL TAX INVOICE*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `*Invoice No:* #${invoice.invoiceNumber}\n`;
  text += `*Originating Branch:* ${branchName} (${branchCode})\n`;
  text += `*Date:* ${formattedDate} ${formattedTime}\n`;
  text += `*Customer:* ${invoice.customerName || 'Retail Customer'}\n`;
  if (invoice.customerPhone) text += `*Mobile:* ${invoice.customerPhone}\n`;
  if (invoice.doctorName) text += `*Doctor:* ${invoice.doctorName}\n`;
  text += `*Payment Mode:* ${invoice.paymentMethod}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `*ITEMS DISPENSED:*\n\n`;
  text += `${linesText}\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Taxable Value: ₹${invoice.subtotal.toFixed(2)}\n`;
  if (invoice.discountTotal > 0) {
    text += `Discount Saved: -₹${invoice.discountTotal.toFixed(2)}\n`;
  }
  text += `CGST: ₹${invoice.cgstTotal.toFixed(2)}\n`;
  text += `SGST: ₹${invoice.sgstTotal.toFixed(2)}\n`;
  text += `Total GST: ₹${invoice.taxTotal.toFixed(2)}\n`;
  if (invoice.roundOff !== 0) {
    text += `Round-off: ${invoice.roundOff > 0 ? `+₹${invoice.roundOff.toFixed(2)}` : `-₹${Math.abs(invoice.roundOff).toFixed(2)}`}\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💰 *NET PAYABLE: ₹${invoice.grandTotal.toFixed(2)}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🙏 *Thank you for choosing Confidos Pharma!*\n`;
  text += `_Digital paperless bill issued by Branch: ${branchName} (${branchCode})._\n`;
  text += `_For refills or support, contact office helpline: *${officeNumber}*_\n`;

  return text;
};

export const getWhatsAppSendUrl = (phoneNumber: string, text: string): string => {
  const cleanDigits = (phoneNumber || '').replace(/\D/g, '');
  const fullNumber = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
  return `https://api.whatsapp.com/send?phone=${fullNumber}&text=${encodeURIComponent(text)}`;
};

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  invoice,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [isDirectSending, setIsDirectSending] = useState(false);
  const [directSendSuccess, setDirectSendSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (invoice) {
      setCustomerPhoneInput(invoice.customerPhone || '');
      setCopied(false);
      setPhoneError('');
      if (invoice.customerPhone) {
        setDirectSendSuccess(`Direct automated WhatsApp dispatch initialized from Office (${OFFICE_PHONE}) to ${invoice.customerPhone}`);
      } else {
        setDirectSendSuccess(null);
      }
    }
  }, [invoice]);

  if (!invoice) return null;

  const branch = invoice.branch;
  const branchName = branch?.name || 'Central Pharmacy Branch';
  const branchCode = branch?.code || 'MAIN';
  const createdDate = new Date(invoice.createdAt);
  const formattedDate = createdDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = createdDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const billText = formatWhatsAppBillText(invoice, OFFICE_PHONE);

  // Direct automated WhatsApp dispatch without redirection
  const handleDirectSendFromOffice = async () => {
    const cleanDigits = customerPhoneInput.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 10) {
      setPhoneError('Please enter a valid 10-digit WhatsApp phone number.');
      return;
    }
    setPhoneError('');
    setIsDirectSending(true);
    setDirectSendSuccess(null);

    try {
      await api.sendInvoiceWhatsApp(invoice.id, customerPhoneInput);
      setDirectSendSuccess(`Automated bill sent directly from Office (${OFFICE_PHONE}) to +91 ${cleanDigits} without redirecting!`);
      setTimeout(() => setDirectSendSuccess(null), 6000);
    } catch (err: any) {
      setPhoneError(err.message || 'Failed to dispatch WhatsApp message');
    } finally {
      setIsDirectSending(false);
    }
  };

  // Optional manual fallback link (only if user explicitly opens web)
  const handleOpenManualWhatsAppWeb = () => {
    const cleanDigits = customerPhoneInput.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 10) {
      setPhoneError('Please enter a valid 10-digit phone number.');
      return;
    }
    const url = getWhatsAppSendUrl(customerPhoneInput, billText);
    window.open(url, '_blank');
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(billText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
    }
  };

  const handleOptionalPrint = () => {
    window.print();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Digital Tax Invoice & Direct WhatsApp Bill" maxWidth="2xl">
      <div className="space-y-4">
        {/* Success / Status header */}
        <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs sm:text-sm print:hidden">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <div className="flex-1">
            <span className="font-bold">Invoice #{invoice.invoiceNumber} Saved to Database!</span>
            <span className="block text-[11px] text-emerald-700">
              Originating Branch: <strong>{branchName}</strong> (Code: <code className="font-mono bg-emerald-100 px-1 py-0.2 rounded font-bold">{branchCode}</code>) • Stock deducted from branch.
            </span>
          </div>
        </div>

        {/* WhatsApp Direct Automated Messaging Control Panel */}
        <div className="bg-slate-50 border border-emerald-200/80 rounded-xl p-3.5 print:hidden space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-600 text-white rounded-lg">
                <Zap className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  Direct Automated WhatsApp Messaging
                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-600 text-white rounded font-normal">
                    From Office: {OFFICE_PHONE}
                  </span>
                </h4>
                <p className="text-[10px] text-slate-500">
                  Sends directly from company office number ({OFFICE_PHONE}) without page or window redirection.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
              Size: ~{Math.round(billText.length / 1024 * 10) / 10 || '< 1'} KB
            </span>
          </div>

          {/* Status feedback banner */}
          {directSendSuccess && (
            <div className="p-2.5 bg-emerald-100/80 border border-emerald-300 text-emerald-900 rounded-lg text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <span className="font-medium">{directSendSuccess}</span>
            </div>
          )}

          {/* Customer Phone Input and Direct Automated Send Button */}
          <div className="space-y-1.5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                  <Smartphone className="w-3.5 h-3.5" />
                </div>
                <input
                  type="text"
                  maxLength={15}
                  value={customerPhoneInput}
                  onChange={(e) => {
                    setCustomerPhoneInput(e.target.value);
                    if (phoneError) setPhoneError('');
                  }}
                  placeholder="Customer WhatsApp Number (10 digits)"
                  className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <button
                type="button"
                onClick={handleDirectSendFromOffice}
                disabled={isDirectSending}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
              >
                {isDirectSending ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Sending from Office...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Direct Send from Office ({OFFICE_PHONE})
                  </>
                )}
              </button>
            </div>

            {phoneError && (
              <p className="text-[11px] text-rose-600 font-medium pl-1">{phoneError}</p>
            )}
          </div>

          {/* Secondary Actions: Copy and Manual Web Link */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyText}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    Copy Bill Text
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenManualWhatsAppWeb}
                className="flex items-center gap-1 px-2.5 py-1.5 text-slate-500 hover:text-slate-700 text-[11px] font-medium"
                title="Optional: Open chat in WhatsApp Web manually"
              >
                <ExternalLink className="w-3 h-3" />
                Manual WhatsApp Web
              </button>
            </div>

            {/* Optional Print Button (non-intrusive fallback) */}
            <button
              type="button"
              onClick={handleOptionalPrint}
              className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1 py-1 px-2"
              title="Print only if physical paper receipt is specifically requested"
            >
              <Printer className="w-3 h-3" />
              Optional: Print Thermal
            </button>
          </div>
        </div>

        {/* Printable / Preview Invoice Container */}
        <div
          id="printable-receipt"
          ref={receiptRef}
          className="border border-slate-300 rounded-xl p-5 bg-white font-mono text-[11px] text-slate-800 leading-normal shadow-sm w-full max-w-[340px] sm:max-w-[350px] mx-auto text-center"
        >
          {/* Centered Logo on top */}
          <div className="mb-2.5">
            <img
              src="/confidos-logo.png"
              alt="Confidos Pharma"
              className="h-10 w-auto max-w-[150px] object-contain mx-auto block mb-1.5"
            />
            {/* Pharmacy Branch Name & Code - Prominently Displayed */}
            <h2 className="text-xs font-bold text-slate-900 tracking-wide uppercase">
              {branchName}
            </h2>
            <div className="text-[10px] font-bold text-slate-800 font-mono tracking-wide mt-0.5">
              BRANCH CODE: <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-900 font-black">{branchCode}</span>
            </div>
            {branch?.address && (
              <p className="text-[10px] text-slate-600 mt-0.5 leading-tight">{branch.address}</p>
            )}
            <p className="text-[10px] text-emerald-800 font-semibold mt-0.5 leading-tight">
              Office / Helpline: {OFFICE_PHONE}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-2.5 text-[9.5px] text-slate-700 mt-0.5">
              <span><strong>GSTIN:</strong> {branch?.gstin || 'N/A'}</span>
              {branch?.drugLicenseNo && <span><strong>DL:</strong> {branch.drugLicenseNo}</span>}
            </div>
            <div className="mt-1.5 inline-block px-2.5 py-0.5 border border-slate-700 font-bold uppercase text-[9px] tracking-widest text-slate-900 rounded-xs">
              RETAIL TAX INVOICE
            </div>
          </div>

          {/* Invoice & Patient Details */}
          <div className="border-t border-b border-dashed border-slate-300 py-2.5 my-2.5 text-[10px] space-y-1 text-slate-700">
            <div className="flex justify-between items-center px-1">
              <span className="font-semibold text-slate-600">Invoice No:</span>
              <span className="font-bold text-slate-900 font-mono">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between items-center px-1">
              <span className="font-semibold text-slate-600">Originating Branch:</span>
              <span className="font-bold text-slate-900 font-mono">{branchName} ({branchCode})</span>
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
              <span className="font-semibold text-slate-600">Customer:</span>
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

          {/* Items Table */}
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
                {(invoice.lines || []).map((line, idx) => {
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
                <span>Discount Saved:</span>
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
              <span>Total GST:</span>
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
            <p>Medicines once sold will be taken back only within 7 days in original pack with this digital bill.</p>
            <p className="font-bold text-slate-800 mt-1">*** Thank you for choosing Confidos Pharma ***</p>
            <p className="text-emerald-800 font-semibold">Customer Helpline / Office: {OFFICE_PHONE}</p>
            <p className="text-slate-500">Wish you a speedy recovery!</p>
          </div>
        </div>
      </div>
    </Modal>
  );
};
