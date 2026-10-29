export type Role = 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'BILLING_USER';

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string;
  phone: string;
  email?: string | null;
  gstin: string;
  drugLicenseNo?: string | null;
  isActive: boolean;
  _count?: {
    users?: number;
    batches?: number;
    salesInvoices?: number;
  };
}

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: Role;
  branchId: string | null;
  branch?: Branch | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface MedicineProduct {
  id: string;
  internalCode: string;
  brandName: string;
  genericName: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  packSize: string;
  baseUnit: string;
  hsnCode?: string | null;
  gstRate: number;
  mrp: number;
  defaultPurchaseRate?: number | null;
  defaultSellingRate?: number | null;
  reorderLevel?: number | null;
  barcode?: string | null;
  prescriptionType: string;
  storageNotes?: string | null;
  isActive: boolean;
  packageUnit?: string | null;
  conversionFactor?: number | null;
  unitConfig?: any;
  totalAvailableStock?: number;
  activeBatches?: StockBatch[];
}

export interface StockBatch {
  id: string;
  branchId: string;
  medicineId: string;
  batchNumber: string;
  expiryDate: string;
  quantityReceived: number;
  availableQuantity: number;
  purchaseRate: number;
  mrp: number;
  sellingPrice: number;
  supplierId?: string | null;
  purchaseInvoiceRef?: string | null;
  receiptDate: string;
  status: 'ACTIVE' | 'QUARANTINE' | 'BLOCKED' | 'EXPIRED' | 'DEPLETED';
  medicine?: MedicineProduct;
  branch?: Branch;
  supplier?: { id: string; name: string };
}

export interface SalesInvoiceLine {
  id: string;
  medicineId: string;
  batchId?: string;
  medicineName: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  unit?: string | null;
  conversionFactor?: number | null;
  baseQuantity?: number | null;
  unitMrp: number;
  unitRate: number;
  discountPercent: number;
  discountAmount: number;
  hsnCode: string;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  lineTotal: number;
  purchaseRate?: number | null;
  medicine?: MedicineProduct;
}

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  branchId: string;
  cashierId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  doctorName?: string | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  roundOff: number;
  grandTotal: number;
  paymentMethod: 'CASH' | 'UPI' | 'CARD' | 'MIXED';
  status: 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
  cancellationReason?: string | null;
  notes?: string | null;
  createdAt: string;
  lines: SalesInvoiceLine[];
  branch?: Branch;
}

export interface PurchaseInvoiceLine {
  id?: string;
  purchaseInvoiceId?: string;
  medicineId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  freeQuantity?: number;
  unit?: string | null;
  conversionFactor?: number | null;
  baseQuantity?: number | null;
  purchaseRate: number;
  sellingRate?: number | null;
  mrp: number;
  discountPercent?: number;
  discountAmount?: number;
  gstRate: number;
  taxAmount?: number;
  lineTotal: number;
  medicine?: MedicineProduct;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  supplierInvoiceNumber: string;
  supplierId: string;
  branchId: string;
  invoiceDate: string;
  subtotal: number;
  discountTotal?: number;
  taxTotal: number;
  additionalCharges?: number;
  grandTotal: number;
  paymentMode?: string;
  paidAmount?: number;
  outstandingAmount?: number;
  status: 'DRAFT' | 'RECEIVED' | 'CANCELLED';
  receivedByUserId: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: Supplier;
  branch?: Branch;
  lines: PurchaseInvoiceLine[];
  _count?: { lines?: number; returns?: number };
}

export interface PurchaseReturnLine {
  id?: string;
  purchaseReturnId?: string;
  medicineId: string;
  batchId?: string;
  batchNumber: string;
  quantity: number;
  purchaseRate: number;
  gstRate: number;
  taxAmount: number;
  lineTotal: number;
  medicine?: MedicineProduct;
}

export interface PurchaseReturn {
  id: string;
  returnNumber: string;
  purchaseInvoiceId?: string | null;
  supplierId: string;
  branchId: string;
  returnDate: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  reason: string;
  status: 'COMPLETED' | 'CANCELLED';
  createdById: string;
  createdAt: string;
  supplier?: Supplier;
  branch?: Branch;
  lines: PurchaseReturnLine[];
}

export interface Expense {
  id: string;
  branchId: string;
  expenseDate: string;
  category: string;
  description: string;
  amount: number;
  paymentMode: string;
  referenceNo?: string | null;
  notes?: string | null;
  createdById: string;
  createdAt: string;
  branch?: Branch;
}

export interface ProfitLossReport {
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    grossSales: number;
    salesDiscounts: number;
    salesReturns: number;
    netSales: number;
    costOfGoodsSold: number;
    grossProfit: number;
    grossMarginPercent: number;
    operatingExpenses: number;
    netProfit: number;
    netProfitMarginPercent: number;
  };
  inventoryPurchasesSummary: {
    totalPurchases: number;
    purchaseDiscounts: number;
    purchaseTaxes: number;
    purchaseReturns: number;
    paidAmount: number;
    outstandingAmount: number;
    note: string;
  };
  expenseBreakdown: Record<string, number>;
  paymentBreakdown: Record<string, number>;
  topProducts: Array<{
    brandName: string;
    quantitySold: number;
    revenue: number;
    cogs: number;
    grossProfit: number;
    marginPercent: number;
  }>;
  counts: {
    completedInvoices: number;
    cancelledInvoices: number;
    purchasesCount: number;
    expensesCount: number;
    missingCostLinesCount: number;
  };
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string | null;
  phone: string;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  dlNumber?: string | null;
  isActive: boolean;
  _count?: {
    batches?: number;
    purchases?: number;
  };
}

export interface SystemSettings {
  DEFAULT_PURCHASE_DISCOUNT_PERCENT: string;
  DEFAULT_CGST_RATE: string;
  DEFAULT_SGST_RATE: string;
  DEFAULT_COMBINED_GST_RATE: string;
  DEFAULT_GST_RATE?: string;
  ALLOW_MANUAL_DISCOUNT?: string;
  MAX_DISCOUNT_PERCENT?: string;
  NEAR_EXPIRY_THRESHOLD_DAYS?: string;
  COMPANY_NAME?: string;
  [key: string]: string | undefined;
}

export interface StockTransfer {
  id: string;
  transferNumber: string;
  sourceBranchId: string;
  destinationBranchId: string;
  medicineId: string;
  batchNumber: string;
  quantity: number;
  status: 'REQUESTED' | 'APPROVED' | 'DISPATCHED' | 'RECEIVED' | 'CANCELLED' | 'REJECTED';
  dispatchDate?: string | null;
  receiptDate?: string | null;
  notes?: string | null;
  createdAt: string;
  sourceBranch?: Branch;
  destinationBranch?: Branch;
}

export interface AuditEvent {
  id: string;
  branchId?: string | null;
  userId: string;
  action: string;
  targetEntity: string;
  entityId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  branch?: Branch | null;
}

export interface PurchaseIndentItem {
  id?: string;
  indentId?: string;
  medicineId: string;
  requestedQuantity: number;
  approvedQuantity?: number | null;
  unit?: string;
  conversionFactor?: number;
  estimatedRate?: number | null;
  estimatedTotal?: number | null;
  medicine?: MedicineProduct;
}

export interface PurchaseIndent {
  id: string;
  indentNumber: string;
  branchId: string;
  supplierId?: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONVERTED' | 'CANCELLED';
  requestedDate: string;
  requiredByDate?: string | null;
  totalEstimatedAmount?: number;
  notes?: string | null;
  reviewNotes?: string | null;
  createdById: string;
  approvedById?: string | null;
  approvedAt?: string | null;
  purchaseInvoiceId?: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: Supplier | null;
  branch?: Branch;
  items: PurchaseIndentItem[];
}

