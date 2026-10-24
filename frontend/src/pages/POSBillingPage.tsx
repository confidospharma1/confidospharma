import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MedicineProduct, StockBatch, SalesInvoice } from '../types';
import {
  Search,
  Barcode,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  AlertCircle,
  CreditCard,
  Banknote,
  QrCode,
  Printer,
  Sparkles,
  Calendar,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { ReceiptModal } from '../components/ReceiptModal';

interface BillItem {
  medicineId: string;
  brandName: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  hsnCode: string;
  gstRate: number;
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  availableStock: number;
  quantity: number;
  unitMrp: number;
  discountPercent: number;
}

export const POSBillingPage: React.FC = () => {
  const { currentBranch, selectedBranchId } = useAuth();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MedicineProduct[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);

  // Bill items state
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'MIXED'>('CASH');

  // Submitting & receipt modal
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [completedInvoice, setCompletedInvoice] = useState<SalesInvoice | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount and F2 key press
  useEffect(() => {
    searchInputRef.current?.focus();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Debounced product search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.getProducts({
          search: searchQuery,
          branchId: selectedBranchId,
          limit: 10,
        });
        setSearchResults(res.products || []);
        setShowDropdown(true);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedBranchId]);

  // Keyboard navigation inside search dropdown
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedProduct = searchResults[selectedIndex];
      if (selectedProduct) {
        addItemToBill(selectedProduct);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  // Add medicine to draft bill
  const addItemToBill = async (product: MedicineProduct) => {
    setErrorMessage('');
    setShowDropdown(false);
    setSearchQuery('');

    // Check if branch has active eligible batches
    if (!product.activeBatches || product.activeBatches.length === 0) {
      setErrorMessage(`No saleable stock batch available for ${product.brandName} in ${currentBranch?.name || 'current branch'}.`);
      return;
    }

    // Default FEFO batch: first active non-expired batch
    const bestBatch = product.activeBatches[0];

    // Check if medicine with this batch is already in draft
    const existingIndex = billItems.findIndex(
      (item) => item.medicineId === product.id && item.batchId === bestBatch.id
    );

    if (existingIndex > -1) {
      const existing = billItems[existingIndex];
      if (existing.quantity + 1 > bestBatch.availableQuantity) {
        setErrorMessage(`Cannot add more: Max available stock for Batch ${bestBatch.batchNumber} is ${bestBatch.availableQuantity}.`);
        return;
      }

      const updated = [...billItems];
      updated[existingIndex].quantity += 1;
      setBillItems(updated);
    } else {
      const newItem: BillItem = {
        medicineId: product.id,
        brandName: product.brandName,
        genericName: product.genericName,
        strength: product.strength,
        dosageForm: product.dosageForm,
        hsnCode: product.hsnCode,
        gstRate: product.gstRate,
        batchId: bestBatch.id,
        batchNumber: bestBatch.batchNumber,
        expiryDate: bestBatch.expiryDate,
        availableStock: bestBatch.availableQuantity,
        quantity: 1,
        unitMrp: bestBatch.sellingPrice || bestBatch.mrp,
        discountPercent: 0,
      };

      setBillItems((prev) => [...prev, newItem]);
    }

    searchInputRef.current?.focus();
  };

  const updateQuantity = (index: number, newQty: number) => {
    const item = billItems[index];
    if (newQty <= 0) {
      removeItem(index);
      return;
    }
    if (newQty > item.availableStock) {
      setErrorMessage(`Cannot exceed available stock of ${item.availableStock} for batch ${item.batchNumber}`);
      return;
    }
    setErrorMessage('');
    const updated = [...billItems];
    updated[index].quantity = newQty;
    setBillItems(updated);
  };

  const updateDiscount = (index: number, disc: number) => {
    if (disc < 0) disc = 0;
    if (disc > 10) {
      setErrorMessage('Maximum policy discount limit is 10%.');
      disc = 10;
    } else {
      setErrorMessage('');
    }
    const updated = [...billItems];
    updated[index].discountPercent = disc;
    setBillItems(updated);
  };

  const removeItem = (index: number) => {
    setBillItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Financial calculations
  let subtotal = 0;
  let totalDiscount = 0;
  let totalGst = 0;

  billItems.forEach((item) => {
    const gross = item.unitMrp * item.quantity;
    const disc = (gross * item.discountPercent) / 100;
    const net = gross - disc;

    const basePrice = net / (1 + item.gstRate / 100);
    const tax = net - basePrice;

    subtotal += basePrice;
    totalDiscount += disc;
    totalGst += tax;
  });

  const netTotal = subtotal + totalGst;
  const grandTotal = Math.round(netTotal);
  const roundOff = grandTotal - netTotal;
  const cgst = totalGst / 2;
  const sgst = totalGst / 2;

  // Complete bill submission
  const handleCompleteBill = async () => {
    if (billItems.length === 0) {
      setErrorMessage('Please add at least one medicine to the bill.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const payload = {
        branchId: selectedBranchId,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        doctorName: doctorName.trim() || undefined,
        paymentMethod,
        items: billItems.map((item) => ({
          medicineId: item.medicineId,
          batchId: item.batchId,
          quantity: item.quantity,
          discountPercent: item.discountPercent,
        })),
      };

      const invoice = await api.createInvoice(payload);
      setCompletedInvoice(invoice);
      setShowReceiptModal(true);

      // Reset cart
      setBillItems([]);
      setCustomerName('');
      setCustomerPhone('');
      setDoctorName('');
      setPaymentMethod('CASH');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to complete sales invoice.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col md:flex-row overflow-hidden bg-slate-100">
      {/* Left Area: Medicine Search & Cart Table */}
      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden space-y-4">
        {/* Top Search Card */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs relative">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search medicine by Brand, Generic name, or Scan Barcode... (F2 to focus)"
                className="w-full pl-11 pr-24 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 font-medium text-slate-900 transition-all placeholder:text-slate-400"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-slate-400">
                <Barcode className="w-4 h-4 text-slate-500" />
                <span className="font-mono text-[10px] bg-slate-200/80 px-1.5 py-0.5 rounded text-slate-600">
                  SCAN
                </span>
              </div>
            </div>
          </div>

          {/* Search Dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-300 rounded-xl shadow-2xl z-40 max-h-80 overflow-y-auto divide-y divide-slate-100">
              {searchResults.map((prod, index) => {
                const isSelected = index === selectedIndex;
                const hasStock = (prod.totalAvailableStock || 0) > 0;
                const fefoBatch = prod.activeBatches?.[0];

                return (
                  <div
                    key={prod.id}
                    onClick={() => addItemToBill(prod)}
                    className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-50/80 border-l-4 border-emerald-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{prod.brandName}</span>
                        <span className="text-xs text-slate-500 font-medium">({prod.genericName} - {prod.strength})</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-semibold">
                          {prod.dosageForm}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>Pack: {prod.packSize}</span>
                        <span>•</span>
                        <span>HSN: {prod.hsnCode}</span>
                        <span>•</span>
                        <span>GST: {prod.gstRate}%</span>
                        {fefoBatch && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-700 font-mono text-[11px] font-semibold flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-emerald-600" />
                              FEFO Batch: {fefoBatch.batchNumber} (Exp: {new Date(fefoBatch.expiryDate).toLocaleDateString('en-IN', { month: '2-digit', year: '2-digit' })})
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-900">
                        ₹{(fefoBatch?.sellingPrice || prod.mrp).toFixed(2)}
                      </div>
                      <div className="mt-0.5">
                        {hasStock ? (
                          <Badge variant="success" size="sm">
                            {prod.totalAvailableStock} in stock
                          </Badge>
                        ) : (
                          <Badge variant="danger" size="sm">
                            Out of stock
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showDropdown && searchResults.length === 0 && !isSearching && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-300 rounded-xl shadow-xl z-40 p-4 text-center text-xs text-slate-500">
              No matching medicine found in catalogue for &quot;{searchQuery}&quot;.
            </div>
          )}
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage('')} className="text-rose-600 hover:text-rose-800 font-bold ml-2">
              Dismiss
            </button>
          </div>
        )}

        {/* Items Table Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Selected Bill Items
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                {billItems.length}
              </span>
            </div>
            {billItems.length > 0 && (
              <button
                onClick={() => setBillItems([])}
                className="text-xs font-medium text-rose-600 hover:text-rose-800 hover:underline"
              >
                Clear Cart
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {billItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                <Search className="w-12 h-12 stroke-1 text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-600">Cart is empty</p>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Type a medicine brand name or scan product barcode above to add items to the current bill.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-4">Item & Batch</th>
                    <th className="py-2.5 px-3 text-center">Expiry</th>
                    <th className="py-2.5 px-3 text-right">Unit MRP</th>
                    <th className="py-2.5 px-3 text-center w-28">Quantity</th>
                    <th className="py-2.5 px-3 text-center w-20">Disc %</th>
                    <th className="py-2.5 px-3 text-center">GST</th>
                    <th className="py-2.5 px-4 text-right">Total</th>
                    <th className="py-2.5 px-3 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {billItems.map((item, idx) => {
                    const gross = item.unitMrp * item.quantity;
                    const lineNet = gross - (gross * item.discountPercent) / 100;

                    return (
                      <tr key={`${item.medicineId}_${item.batchId}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900">{item.brandName}</p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                            Batch: <span className="font-semibold text-slate-700">{item.batchNumber}</span> (Avail: {item.availableStock})
                          </p>
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-[11px] text-slate-600">
                          {new Date(item.expiryDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-800">
                          ₹{item.unitMrp.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => updateQuantity(idx, item.quantity - 1)}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                              title="Decrease quantity"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              max={item.availableStock}
                              value={item.quantity}
                              onChange={(e) => updateQuantity(idx, parseInt(e.target.value) || 0)}
                              className="w-12 text-center py-1 bg-white border border-slate-300 rounded text-xs font-bold font-mono focus:ring-1 focus:ring-emerald-500"
                            />
                            <button
                              onClick={() => updateQuantity(idx, item.quantity + 1)}
                              className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                              title="Increase quantity"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={item.discountPercent}
                            onChange={(e) => updateDiscount(idx, parseFloat(e.target.value) || 0)}
                            className="w-14 text-center py-1 bg-white border border-slate-300 rounded text-xs font-mono text-slate-800 focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-slate-600 text-[11px]">
                          {item.gstRate}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          ₹{lineNet.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => removeItem(idx)}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Right Area: Customer Details & Checkout Card */}
      <div className="w-full md:w-96 bg-white border-l border-slate-200 p-5 flex flex-col justify-between overflow-y-auto shadow-sm">
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Customer Details (Optional)
            </h3>
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Customer / Patient Name
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Phone (10-digit)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="98480xxxxx"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Doctor Name
                  </label>
                  <input
                    type="text"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="Dr. Rao"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Payment Method
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('CASH')}
                className={`py-2 px-2 text-xs font-bold rounded-lg border flex flex-col items-center gap-1 transition-all ${
                  paymentMethod === 'CASH'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>Cash</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('UPI')}
                className={`py-2 px-2 text-xs font-bold rounded-lg border flex flex-col items-center gap-1 transition-all ${
                  paymentMethod === 'UPI'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <QrCode className="w-4 h-4 text-emerald-600" />
                <span>UPI / QR</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('CARD')}
                className={`py-2 px-2 text-xs font-bold rounded-lg border flex flex-col items-center gap-1 transition-all ${
                  paymentMethod === 'CARD'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span>Card</span>
              </button>
            </div>
          </div>

          {/* Bill Calculation Summary */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Taxable Value (Subtotal):</span>
              <span className="font-mono font-medium">₹{subtotal.toFixed(2)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount Applied:</span>
                <span className="font-mono font-medium">-₹{totalDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>CGST (Intra-state Tax):</span>
              <span className="font-mono">₹{cgst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-500 text-[11px]">
              <span>SGST (State Tax):</span>
              <span className="font-mono">₹{sgst.toFixed(2)}</span>
            </div>
            {roundOff !== 0 && (
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Round-off:</span>
                <span className="font-mono">
                  {roundOff > 0 ? `+₹${roundOff.toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`}
                </span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-2 flex justify-between items-baseline">
              <span className="text-sm font-bold text-slate-900">Total Payable:</span>
              <span className="text-2xl font-black font-mono text-emerald-700">
                ₹{grandTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Complete Bill Button */}
        <div className="mt-6 pt-4 border-t border-slate-200">
          <button
            onClick={handleCompleteBill}
            disabled={isSubmitting || billItems.length === 0}
            className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all focus:ring-4 focus:ring-emerald-500/20 ${
              billItems.length === 0 || isSubmitting
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
            }`}
          >
            {isSubmitting ? (
              <span className="inline-block animate-pulse">Processing & Deducting Stock...</span>
            ) : (
              <>
                <Printer className="w-5 h-5" />
                <span>Complete Bill & Print (₹{grandTotal.toFixed(2)})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Printable Receipt Modal */}
      <ReceiptModal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        invoice={completedInvoice}
      />
    </div>
  );
};
