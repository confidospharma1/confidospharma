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
  hsnCode: string;
  gstRate: number;
  mrp: number;
  barcode?: string | null;
  prescriptionType: string;
  storageNotes?: string | null;
  isActive: boolean;
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
  unitMrp: number;
  unitRate: number;
  discountPercent: number;
  discountAmount: number;
  hsnCode: string;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  lineTotal: number;
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
