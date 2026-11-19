export const OFFICE_WHATSAPP_NUMBER = '6302931223';
export const OFFICE_WHATSAPP_CLEAN = '916302931223';

/**
 * Formats a clean, lightweight digital invoice (< 1 KB) for WhatsApp Web & direct redirect.
 * Accurately displays originating branch name and code.
 */
export function formatWhatsAppInvoiceText(invoice: any, officeNumber: string = OFFICE_WHATSAPP_NUMBER): string {
  const branch = invoice.branch || {};
  const branchName = branch.name || 'Central Pharmacy';
  const branchCode = branch.code || 'MAIN';
  const createdDate = new Date(invoice.createdAt || Date.now());
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

  const lines = invoice.lines || [];
  const linesText = lines
    .map((line: any, idx: number) => {
      const expStr = line.expiryDate
        ? new Date(line.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' })
        : '-';
      const discStr = line.discountPercent > 0 ? ` (Disc ${line.discountPercent}%)` : '';
      return `${idx + 1}. *${line.medicineName}*\n   Batch: ${line.batchNumber} | Exp: ${expStr}\n   Qty: ${line.quantity} ${line.unit || 'units'} x ₹${Number(line.unitMrp || 0).toFixed(2)} = *₹${Number(line.lineTotal || 0).toFixed(2)}*${discStr}`;
    })
    .join('\n\n');

  let text = `🏥 *CONFIDOS PHARMA*\n`;
  text += `📍 *Branch:* ${branchName} (Code: *${branchCode}*)\n`;
  if (branch.address) text += `${branch.address}\n`;
  if (branch.gstin) text += `GSTIN: ${branch.gstin} `;
  if (branch.drugLicenseNo) text += `| DL: ${branch.drugLicenseNo}`;
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
  text += `*Payment Mode:* ${invoice.paymentMethod || 'CASH'}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `*ITEMS DISPENSED:*\n\n`;
  text += `${linesText || 'No items listed'}\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Taxable Value: ₹${Number(invoice.subtotal || 0).toFixed(2)}\n`;
  if (invoice.discountTotal > 0) {
    text += `Discount Saved: -₹${Number(invoice.discountTotal || 0).toFixed(2)}\n`;
  }
  text += `CGST: ₹${Number(invoice.cgstTotal || 0).toFixed(2)}\n`;
  text += `SGST: ₹${Number(invoice.sgstTotal || 0).toFixed(2)}\n`;
  text += `Total GST: ₹${Number(invoice.taxTotal || 0).toFixed(2)}\n`;
  if (invoice.roundOff && invoice.roundOff !== 0) {
    text += `Round-off: ${invoice.roundOff > 0 ? `+₹${invoice.roundOff.toFixed(2)}` : `-₹${Math.abs(invoice.roundOff).toFixed(2)}`}\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `💰 *NET PAYABLE: ₹${Number(invoice.grandTotal || 0).toFixed(2)}*\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🙏 *Thank you for choosing Confidos Pharma!*\n`;
  text += `_Digital paperless bill issued by Branch: ${branchName} (${branchCode})._\n`;
  text += `_For refills or support, contact office helpline: *${officeNumber}*_\n`;

  return text;
}

/**
 * Builds the direct WhatsApp Web / App redirect URL with prefilled phone and message.
 */
export function getWhatsAppRedirectUrl(phoneNumber: string, text: string): string {
  const cleanDigits = (phoneNumber || '').replace(/\D/g, '');
  const recipientPhone = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
  return `https://api.whatsapp.com/send?phone=${recipientPhone}&text=${encodeURIComponent(text)}`;
}
