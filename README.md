# Confidos Pharma Enterprise OS

> Enterprise Multi-Branch Pharmacy Management, Batch Expiry Tracking, FEFO Allocation, and Point-of-Sale Billing Platform.  
> Built strictly according to the **Confidos Pharma Product Requirements Document (PRD)**.

📖 **For end-to-end operational instructions, step-by-step guides, CSV/Excel templates, and troubleshooting, refer to [USER_MANUAL.md](file:///f:/pharma/USER_MANUAL.md).**

---

## 🏛️ System Architecture

Confidos Pharma is built as a high-performance **modular monolith** with strong database-level consistency, transaction safety, and strict cross-branch isolation:

```
                            ┌──────────────────────────────────────┐
                            │    Pharmacy Staff Desktop / Mobile   │
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
                            │      PostgreSQL (Neon) Database      │
                            │  Atomic Transactions & Audit Ledger  │
                            └──────────────────────────────────────┘
```

---

## 🚀 Key Features Built

### 1. Multi-Branch Isolation & RBAC
- **Super Admin:** Company-wide reporting, branch creation, user role management, and consolidated non-mixed reports.
- **Branch Admin:** Scoped strictly to assigned branch (`Vijayawada`, `Guntur`, or `Tenali`). Cannot query or mutate other branches' stock or invoices (`403 Forbidden`).
- **Billing User (Cashier):** High-speed counter billing, barcode scanning, and recent bills. Strictly barred from catalogue editing or inventory tampering.

### 2. High-Performance Point of Sale (POS) Billing
- **Fast Search:** Instant debounced search by brand name, generic ingredient, or barcode (`F2` shortcut).
- **Keyboard Navigation:** `ArrowUp` / `ArrowDown` to navigate, `Enter` to add to cart, `Escape` to close, `F8` to checkout.
- **Automatic FEFO Allocation:** The system automatically queries and assigns the earliest-expiring, active, non-expired batch.
- **Safety Locks:** Expired or blocked batches can **never** be sold. Bills cannot oversell available branch quantity.
- **Decimal-Safe Tax Calculation:** Accurate CGST and SGST reverse calculations from MRP, discounts (policy max 10%), and standard round-off.
- **Printable Tax Invoices:** Standard 80mm thermal receipt counter slip and full A4 GST invoice with doctor details, drug license numbers, and statutory disclaimers.

### 3. Inventory & Batch Expiry Tracking
- Separate physical stock tracking per branch (Vijayawada, Guntur, Tenali).
- Batch status lifecycle: `ACTIVE`, `QUARANTINE`, `BLOCKED`, `EXPIRED`, `DEPLETED`.
- Near-expiry alerts (< 60 days) and quarantine filters.
- Traceable **Stock Movement Ledger** recording every delta (`PURCHASE_RECEIPT`, `SALE`, `CUSTOMER_RETURN`, `STOCK_CORRECTION`, `TRANSFER_OUT`, `TRANSFER_IN`).
- Supervised stock adjustments with mandatory audit reasons.

### 4. Deterministic 2-Stage Bulk Import
- Supports `.xlsx`, `.xls`, and `.csv`.
- **Catalogue Import (Type A):** Master data creation without injecting live stock.
- **Stock Receipt Import (Type B):** Incoming goods validation tied to branch stock batches.
- **Preview Metrics:** Live counts of Total Rows, Valid Rows, Errors, Duplicates, and Warnings.
- **Downloadable Error CSV:** Users can download rejected rows with row numbers and exact error descriptions.
- **Downloadable Sample Templates:** Built-in templates for catalogue, stock receipts, and inward purchases.

### 5. Inter-Branch Stock Transfers & Requisitions
- Explicit multi-branch transfers with unique reference numbers (`TRF-xxxxx`).
- Deducts stock from source branch upon dispatch. Stock is only credited to the destination branch upon supervisor confirmation.
- **Indent Management:** Branch staff can requisition medicines; approved indents convert to inward purchase invoices in one click.

### 6. Compliance, Governance & Data Subject Rights
- Indian DPDP Act compliant disclosures and transparent data minimization.
- Published Grievance Officer details, corporate CIN, and licensing authority.
- Digital Schedule H, H1, and Schedule X registers capturing patient, doctor council number, and batch tracking.
- Self-service **Data Subject Rights (DSR)** request portal with tracking tickets.
- Append-only immutable audit trail for logins, sales, cancellations, and stock movements.

---

## 🔑 First-Time Setup & Authentication

### Pure Empty Database Mode (Default)
When starting with a clean database, navigating to the application automatically opens the **Initial Database Onboarding Wizard** (`GET /api/auth/setup-status` returns `needsSetup: true`), prompting you to create the initial Super Administrator and primary branch.

### Demo Seed Accounts (Optional)
If you wish to populate the database with demonstration branches, sample medicines, and test accounts, run:
```bash
npm run seed
```
Demo accounts seeded by the script:
| Role | Username | Password | Branch Assigned |
|---|---|---|---|
| **Super Admin**             | `superadmin` | `Pharma@2026` | Head Office (All Branches) |
| **Branch Admin (VJA)**      | `admin_vja`  | `Pharma@2026` | Vijayawada Central Branch |
| **Branch Admin (GNT)**      | `admin_gnt`  | `Pharma@2026` | Guntur Hospital Road Branch |
| **Branch Admin (TNL)**      | `admin_tnl`  | `Pharma@2026` | Tenali Market Branch |
| **Billing Cashier 1 (VJA)** | `bill_vja_1` | `Pharma@2026` | Vijayawada Central Branch |

---

## 🛠️ Quick Start & Developer Commands

### 1. Run Everything (Development)
```bash
# Start backend on http://localhost:5000
npm run dev:backend

# Start frontend on http://localhost:3000
npm run dev:frontend
```

### 2. Reset Database to Clean State
```bash
# Reset database to empty production-ready state (preserves schema & settings)
npm run prisma:reset-empty
```

### 3. Run Automated Test Suite
```bash
# Run Vitest test suite across all 13 test files
npm test
```
*Validates health check, branch isolation (403 denial), FEFO selection, expired batch blocking, atomic POS billing, GST calculations, purchase inwards, bulk imports, and oversell prevention.*

### 4. Build Production Bundles
```bash
# Production typecheck and build for backend and frontend
npm run build
```

---

## 🧪 Automated Test Verification

All 13 test suites execute and pass:
```text
Test Files  13 passed (13)
     Tests  211 passed (211)
  Duration  ~530s
```
Core test files verified:
- `tests/api.test.ts`
- `tests/audit_fixes.test.ts`
- `tests/dummy_data_verification.test.ts`
- `tests/enterprise_defects_verification.test.ts`
- `tests/imports.test.ts`
- `tests/inventory_ledger_management.test.ts`
- `tests/medicine_stock_and_navigation_enhancements.test.ts`
- `tests/pos_unit_selector_enhancements.test.ts`
- `tests/purchase_import.test.ts`
- `tests/quality_audit_fixes_regression.test.ts`
- `tests/reports_and_bulk_delete_regression.test.ts`
- `tests/stock_monitoring_and_purchase_fix.test.ts`
- `tests/unit_pricing_conversion.test.ts`

---

## 📚 Complete User Manual

For thorough instructions on every screen, detailed workflows, validation rules, CSV schemas, and beginner walkthroughs, please consult:
👉 **[USER_MANUAL.md](file:///f:/pharma/USER_MANUAL.md)**
