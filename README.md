# Confidos Pharma Enterprise OS

> Multi-Branch Pharmacy Inventory, Batch Expiry Tracking, FEFO Allocation, and Point-of-Sale Billing Platform.  
> Built strictly according to the **Confidos Pharma Product Requirements Document (PRD)**.

---

## 🏛️ System Architecture

Confidos Pharma is built as a high-performance **modular monolith** with strong database-level consistency and strict branch isolation:

```
                            ┌──────────────────────────────────────┐
                            │    Pharmacy Staff Desktop / POS     │
                            └──────────────────┬───────────────────┘
                                               │ HTTPS / REST
                                               ▼
                            ┌──────────────────────────────────────┐
                            │   React 18 + Vite + Tailwind CSS     │
                            │   Keyboard-First POS, Barcode, Print │
                            └──────────────────┬───────────────────┘
                                               │ REST API (port 5000)
                                               ▼
                            ┌──────────────────────────────────────┐
                            │      Node.js + Express + Prisma      │
                            │  RBAC & Cross-Branch Isolation Guard │
                            └──────┬───────────┬────────────┬──────┘
                                   │           │            │
            ┌──────────────────────┴┐   ┌──────┴─────┐   ┌──┴───────────────────┐
            │ Point of Sale Engine  │   │ Inventory  │   │  2-Stage Bulk Import │
            │ Decimal CGST/SGST/Rnd │   │ FEFO Batch │   │  Excel/CSV Staging   │
            └───────────┬───────────┘   └──────┬─────┘   └──────────┬───────────┘
                        └──────────────────────┼────────────────────┘
                                               ▼
                            ┌──────────────────────────────────────┐
                            │       PostgreSQL / SQLite DB         │
                            │  Atomic Transactions & Audit Ledger  │
                            └──────────────────────────────────────┘
```

---

## 🚀 Key Features Built

### 1. Multi-Branch Isolation & RBAC (PRD Sections 2 & 3)
- **Super Admin**: Company-wide reporting, branch creation, user role management, consolidated non-mixed reports.
- **Branch Admin**: Scoped strictly to assigned branch (`Vijayawada`, `Guntur`, or `Tenali`). Cannot query or mutate other branches' stock or invoices (403 Forbidden).
- **Billing User (Cashier)**: High-speed counter billing, barcode scanning, recent bills. Strictly barred from catalogue editing or inventory tampering.

### 2. High-Performance Point of Sale (POS) Billing (PRD Section 8)
- **Fast Search**: Instant debounced search by brand name, generic ingredient, or barcode (`F2` shortcut).
- **Keyboard Navigation**: `ArrowUp` / `ArrowDown` to navigate, `Enter` to add to cart, `Escape` to close.
- **Automatic FEFO Allocation**: The system automatically queries and assigns the earliest expiring, active, non-expired batch.
- **Safety Locks**: Expired or blocked batches can **never** be sold. Bills cannot oversell available branch quantity.
- **Decimal-Safe Tax Calculation**: Accurate CGST (6%) and SGST (6%) reverse calculations from MRP, discounts (policy max 10%), and standard round-off.
- **Printable Tax Invoices**: Standard 80mm thermal receipt counter slip and A4 GST invoice with drug license numbers and statutory disclaimer.

### 3. Inventory & Batch Expiry Tracking (PRD Section 5)
- Separate physical stock tracking per branch (Vijayawada: 100 Dolo, Guntur: 35 Dolo, Tenali: 0 Dolo).
- Batch status lifecycle: `ACTIVE`, `QUARANTINE`, `BLOCKED`, `EXPIRED`, `DEPLETED`.
- Near-expiry alerts (<60 days) and quarantine filters.
- Traceable **Stock Movement Ledger** recording every delta (`PURCHASE_RECEIPT`, `SALE`, `CUSTOMER_RETURN`, `STOCK_CORRECTION`, `TRANSFER_OUT`, `TRANSFER_IN`).
- Supervised stock adjustment with mandatory audit reason.

### 4. Deterministic 2-Stage Bulk Import (PRD Section 7)
- Supports `.xlsx`, `.xls`, and `.csv`.
- **Catalogue Import**: Master data creation without injecting live stock.
- **Stock Receipt Import**: Incoming goods validation tied to branch stock batches.
- **Preview Metrics**: Live counts of Total Rows, Valid Rows, Errors, Duplicates, and Warnings.
- **Downloadable Error CSV**: Users can download rejected rows with row numbers and exact error descriptions.
- **Downloadable Sample Templates** for CSV imports.
- Zero LLM dependency: deterministic, fast, and repeatable.

### 5. Inter-Branch Stock Transfers (PRD Section 3.3)
- Explicit multi-branch transfers with unique reference numbers (`TRF-xxxxx`).
- Deducts stock from source branch upon dispatch.
- Protects against double-receipt; stock is only credited to the destination branch upon supervisor confirmation.

### 6. Compliance, Governance & Data Subject Rights (PRD Sections 14, 15, 17)
- Indian DPDP Act compliant disclosures and transparent data minimization.
- Published Grievance Officer details, corporate CIN, and licensing authority.
- 7-day medicine return & refund policy guidelines with cold-chain exemptions.
- Self-service **Data Subject Rights (DSR)** request portal with tracking tickets.
- Append-only immutable audit trail for logins, sales, cancellations, and stock movements.

---

## 🔑 Demo Credentials (PRD Section 2.5: Initial 10 Accounts)

| Role | Username | Password | Branch Assigned |
|---|---|---|---|
| **Super Admin**             | `superadmin` | `Pharma@2026` | Head Office (All Branches) |
| **Branch Admin (VJA)**      | `admin_vja`  | `Pharma@2026` | Vijayawada Central Branch |
| **Branch Admin (GNT)**      | `admin_gnt`  | `Pharma@2026` | Guntur Hospital Road Branch |
| **Branch Admin (TNL)**      | `admin_tnl`  | `Pharma@2026` | Tenali Market Branch |
| **Billing Cashier 1 (VJA)** | `bill_vja_1` | `Pharma@2026` | Vijayawada Central Branch |
| **Billing Cashier 2 (VJA)** | `bill_vja_2` | `Pharma@2026` | Vijayawada Central Branch |
| **Billing Cashier 1 (GNT)** | `bill_gnt_1` | `Pharma@2026` | Guntur Hospital Road Branch |
| **Billing Cashier 2 (GNT)** | `bill_gnt_2` | `Pharma@2026` | Guntur Hospital Road Branch |
| **Billing Cashier 1 (TNL)** | `bill_tnl_1` | `Pharma@2026` | Tenali Market Branch |
| **Billing Cashier 2 (TNL)** | `bill_tnl_2` | `Pharma@2026` | Tenali Market Branch |

---

## 🛠️ Quick Start & Developer Commands

### 1. Run Everything (Development)
```bash
# Start backend on http://localhost:5000
npm run dev:backend

# Start frontend on http://localhost:3000
npm run dev:frontend
```

### 2. Seed Database
```bash
npm run seed
```

### 3. Run Automated Test Suite
```bash
npm test
```
*Validates health check, branch isolation (403 denial), FEFO selection, expired batch blocking, atomic POS billing, GST calculations, and oversell prevention.*

### 4. Build Production Bundles
```bash
npm run build
```

---

## 🧪 Automated Test Verification

All 7 core test suites execute and pass:
```text
 ✓ tests/api.test.ts (7 tests)
   ✓ Health check endpoint returns status healthy
   ✓ Enforces branch isolation: Guntur Admin CANNOT access Vijayawada stock batches
   ✓ Billing User CANNOT create or edit catalogue products (PRD 2.3)
   ✓ FEFO Algorithm returns the earliest non-expired batch for Vijayawada
   ✓ Prevents selling expired stock batch (PRD 5.2)
   ✓ Point of sale billing calculates GST, deducts stock atomically, and logs sale
   ✓ Overselling rejection: Cannot sell more stock than available in branch
```
