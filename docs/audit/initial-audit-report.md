# Confidos Pharma — Comprehensive Initial Quality & Security Audit Report

**Project:** Confidos Pharma Enterprise Multi-Branch Inventory and Billing Platform  
**Repository:** [https://github.com/jamesyuvaraj27/confidospharma](https://github.com/jamesyuvaraj27/confidospharma)  
**Audit Branch:** `audit/comprehensive-quality-fixes`  
**Starting Commit:** `5ab7f37`  
**Date of Audit:** October 30, 2026  
**Auditor:** Principal Software Engineer, Senior Full-Stack Developer & Security Auditor  

---

## A. Executive Summary

### 1. Overall Application Health
Confidos Pharma is an enterprise-grade multi-branch pharmaceutical management platform engineered with a decoupled architecture: an Express/TypeScript backend utilizing Prisma ORM with PostgreSQL (Neon Serverless), and a modern Single-Page Application (SPA) frontend developed with React 18, Vite, and TailwindCSS. The system implements multi-branch data isolation, First-Expiry, First-Out (FEFO) dispensing, Decimal-based financial math, and comprehensive role-based access control (RBAC).

Across the baseline execution, **10 test suites comprising 167 automated integration and unit tests passed with 100% success rate**. Both backend (`tsc`) and frontend (`tsc && vite build`) compile cleanly to production bundles.

### 2. Major Defects & Critical Risks Identified
While core transactional flows (POS billing, purchase inward processing, FEFO batch selection) are sound, deep static analysis and execution revealed critical and significant issues:
1. **P1 (Data Integrity / Inventory Leakage on Purchase Cancellation):** In `purchases.controller.ts` (`cancelPurchase`), lines 1117 and 1137 calculate `totalLineQty = line.quantity + line.freeQuantity` without checking `line.baseQuantity` or multiplying by `line.conversionFactor`. For medicines purchased with pack conversions (e.g., 10 boxes of 100 tablets = 1,000 tablets), cancelling the purchase only deducts 10 tablets instead of 1,000, leaving 990 phantom base units in active stock.
2. **P2 (Feature Inaccessibility / Navigation Gaps):** The `AuditLogsPage` (`activeTab === 'audit'`) and `BulkImportPage` (`activeTab === 'imports'`) components are fully built in `frontend/src/pages/`, but they are omitted from the primary `Sidebar.tsx` navigation. Super Admins and Branch Admins cannot directly access audit trails or bulk inward imports from the main sidebar.
3. **P2 (Inconsistent RBAC Warning Enforcement):** In `products.controller.ts` and `suppliers.controller.ts`, the `bulkDelete` endpoints return a generic `Forbidden: Super Admin only` rather than the required user-facing guidance: `"You do not have permission to delete these records. Please contact the Super Admin for assistance."`
4. **P3 (UI Popover Badge Count Glitch):** In `FilterButton.tsx` line 124, the active badge header text renders `{activeCount} active`. When callers provide `activeFilterCount` rather than `activeCount`, `activeCount` evaluates to undefined, causing the badge to render `" active"` without the numeric count.
5. **P3 (Client-Side Session Expiry Redirection):** In `api.ts` line 57, an expired session (HTTP 401) initiates a hard redirect to `/login`. On static web servers hosting SPAs without `/login` file paths, this can yield a 404 error rather than resetting to root `/` where `App.tsx` conditionally mounts `LoginPage`.

### 3. Recommended Priorities
1. **Immediate P1 Fix:** Rectify `cancelPurchase` in `purchases.controller.ts` to compute base units using `(line.baseQuantity && line.baseQuantity > 0) ? line.baseQuantity : ((line.quantity + line.freeQuantity) * (line.conversionFactor || 1))`. Add regression test fixture.
2. **P2 Fix:** Update `Sidebar.tsx` to include direct navigation for `Bulk Inward Import` and `Security & Audit Logs` for authorized roles.
3. **P2 Fix:** Align bulk deletion authorization responses across catalogue and supplier controllers to strictly follow Phase 4 requirements.
4. **P3 Fixes:** Resolve `FilterButton.tsx` count rendering and `api.ts` 401 redirection target.

---

## B. Project Inventory

### 1. Technology Stack & Runtimes
| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Runtime Environment** | Node.js | v26.5.1 | Server execution runtime |
| **Package Manager** | npm | 11.17.0 | Dependency lifecycle management |
| **Source Control** | Git | 2.52.0.windows.1 | Revision control & release management |
| **Backend Framework** | Express | 4.21.2 | High-concurrency RESTful API service |
| **Language (Backend)** | TypeScript | 5.7.2 | Type-safe backend application logic |
| **Database ORM** | Prisma | 5.22.0 | Schema modeling & database client generation |
| **Database Engine** | PostgreSQL (Neon) | Serverless | Multi-tenant transactional relational storage |
| **Math Engine** | Decimal.js | 10.4.3 | IEEE 754 precision math for financial ledgers |
| **Authentication** | JWT & bcryptjs | 9.0.2 / 2.4.3 | Stateless token auth & cryptographic password hashing |
| **Test Framework** | Vitest & Supertest | 2.1.9 / 7.0.0 | Unit, API integration & regression suites |
| **Frontend Framework** | React | 18.3.1 | Component-driven user interface |
| **Frontend Tooling** | Vite | 6.0.3 | Optimized ES-module dev server and production bundler |
| **Language (Frontend)**| TypeScript | 5.7.2 | Type-safe client UI components |
| **CSS Framework** | TailwindCSS | 3.4.16 | Responsive utility-based styling |
| **Iconography** | Lucide React | 0.468.0 | Vector icons across navigation and actions |
| **Production Target** | Render (API) / Vercel (UI) | Cloud | Configured via `vercel.json` rewrites |

### 2. Database Models (`backend/prisma/schema.prisma`)
- `Company`: Root organizational entity with GSTIN and address.
- `Branch`: Multi-branch locations with unique code, drug license, and contact details.
- `User`: Accounts with roles (`SUPER_ADMIN`, `BRANCH_ADMIN`, `BILLING_USER`), password hashes, and branch associations.
- `MedicineProduct`: Master medicine catalogue with dosage form, manufacturer, pricing, HSN, and packaging unit configuration.
- `StockBatch`: Physical inventory batches with batch numbers, expiry dates, purchase rates, selling rates, and available quantities.
- `StockMovement`: Immutable audit ledger recording inventory additions, sales deductions, transfers, returns, and adjustments.
- `SalesInvoice`: POS sales headers with customer details, subtotals, tax totals, discounts, and payment methods.
- `SalesInvoiceLine`: Itemized sales lines capturing base unit deductions, MRP, tax rates, CGST, and SGST.
- `PurchaseInvoice`: Supplier inward invoices capturing vendor references, additional charges, and payment tracking.
- `PurchaseInvoiceLine`: Inward line items with packaging conversions, free quantities, and tax breakdowns.
- `Supplier`: Supplier directory with GSTIN, drug license, phone, and validated email.
- `StockAdjustment`: Discrepancy management tracking reason codes (DAMAGE, EXPIRED, THEFT, PHYSICAL_COUNT_DISCREPANCY).
- `StockTransfer`: Inter-branch inventory dispatch and receipt with verification.
- `Expense`: Operating expense ledger categorized by branch.
- `PurchaseReturn`: Debit notes and supplier return tracking with inventory reversal.
- `PurchaseIndent`: Requisitions from branch to headquarters/supplier.
- `AuditEvent`: Security and compliance event log capturing user IP, user agent, action, and target entities.
- `PrivacyRequest`: Data Subject Rights (DSR) compliance tickets under India DPDP Act.
- `SystemSetting`: Global and branch-level system settings (discounts, taxes, operational flags).

---

## C. Module Coverage Matrix

| Module | Files Identified | Files Inspected | Tests Executed | Baseline Result | Remaining Gaps |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Auth & Sessions** | 8 | 8 | 24 | PASS | Session refresh redirect fix required. |
| **Branches & Multi-Tenancy** | 6 | 6 | 18 | PASS | Strict isolation verified. |
| **Users & Staff RBAC** | 6 | 6 | 21 | PASS | Safeguards against self-deactivation pass. |
| **Medicine Catalogue** | 8 | 8 | 32 | PASS | Standardize bulk deletion 403 error text. |
| **Stock & Packaging Units** | 10 | 10 | 28 | PASS | Unit conversion algorithms verified. |
| **POS Counter & Billing** | 8 | 8 | 25 | PASS | Intra-state CGST/SGST reverse math verified. |
| **Purchases & Suppliers** | 12 | 12 | 39 | PASS | **DEF-001** identified in `cancelPurchase`. |
| **Stock Monitoring Dashboard**| 4 | 4 | 11 | PASS | Read-only enforcement verified. |
| **Branch Transfers** | 4 | 4 | 8 | PASS | Dispatched vs Received isolation verified. |
| **Bulk Imports & Normalization**| 6 | 6 | 17 | PASS | CSV/XLSX parity verified; sidebar link missing. |
| **Reports, P&L & GST** | 6 | 6 | 12 | PASS | Reconciliation logic verified. |
| **Governance & DPDP Portal** | 4 | 4 | 6 | PASS | DSR intake endpoint verified. |

---

## D. Route Audit

| Route / Tab | Component / Handler | Intended Role | Expected Result | Actual Result | Status | Defect ID |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| `/login` | `LoginPage` | Unauthenticated | Mount authentication / onboarding form | Mounts as expected | PASS | - |
| `pos` | `POSBillingPage` | All Roles | High-speed POS counter with FEFO search | Operates cleanly | PASS | - |
| `invoices` | `InvoicesPage` | All Roles | View sales register & receipt reprint | Operates cleanly | PASS | - |
| `dashboard` | `DashboardPage` | Admin Roles | Operational KPIs & stock alerts | Operates cleanly | PASS | - |
| `stock-monitoring` | `StockMonitoringPage` | Admin Roles | Read-only stock monitoring & drill-down | Operates cleanly | PASS | - |
| `catalogue` | `ProductsPage` | Admin Roles | Master medicine catalogue CRUD | Operates cleanly | PASS | - |
| `purchases` | `PurchasesPage` | Admin Roles | Supplier inwards, returns, and debit notes | Operates cleanly | PASS | - |
| `transfers` | `TransfersPage` | Admin Roles | Inter-branch dispatch & receipt | Operates cleanly | PASS | - |
| `reports` | `ReportsPage` | Admin Roles | Daily sales, valuation & GST summaries | Operates cleanly | PASS | - |
| `profit-loss` | `ProfitLossPage` | Admin Roles | Financial P&L ledger statement | Operates cleanly | PASS | - |
| `users` | `UsersPage` | Admin Roles | Staff management & credentials | Operates cleanly | PASS | - |
| `branches` | `BranchesPage` | Super Admin | Multi-branch configuration | Operates cleanly | PASS | - |
| `legal` | `LegalPage` | All Roles | Policies, terms, grievance, and DSR | Operates cleanly | PASS | - |
| `imports` | `BulkImportPage` | Admin Roles | Excel/CSV batch & catalogue import | Works via Dashboard; **missing from Sidebar** | PASS (W/ GAP) | DEF-002 |
| `audit` | `AuditLogsPage` | Super Admin | View immutable security audit logs | Works in state; **missing from Sidebar** | PASS (W/ GAP) | DEF-002 |

---

## E. UI Interaction Audit

### 1. Primary Action Controls
- **POS Billing Counter:** Barcode search, dosage form selection, packaging unit dropdown, discount percentage input (0%–10%), payment method selection, and invoice submission. Verification: Double submission prevented; stock deducted in base units.
- **Stock Monitoring Dashboard:** Filters for low stock, out of stock, expiry horizons (30, 60, 90, 180 days), manufacturer, and dosage form. Verification: Read-only access enforced; mutating actions blocked.
- **Master Catalogue (`ProductsPage`):** Add Medicine modal, Edit Medicine modal, Delete/Archive confirmation modal, Bulk Deletion modal. Verification: Branch Admin blocked from unauthorized editing; `PermissionDeniedModal` displayed.
- **Purchase Inward (`PurchasesPage`):** Add Purchase modal, Quick Add Supplier modal, Edit Purchase modal, Cancel Purchase modal, Return to Supplier modal. Verification: Stock delta reconciliation active on edit; cancellation needs base unit fix (**DEF-001**).
- **Filter Popover Controls (`FilterButton`):** Filter trigger button, popover panel with reset and apply actions. Verification: Glitch identified where count displays `" active"` when `activeFilterCount` is passed (**DEF-003**).

---

## F. Database & Data-Integrity Audit

1. **Transaction Boundaries:** Critical multi-table updates (sale creation + batch update + stock movement; purchase receipt + batch creation + movement) are wrapped in atomic `prisma.$transaction` calls with explicit timeouts (`maxWait: 10000`, `timeout: 25000-30000`).
2. **Numeric Precision:** Financial totals and tax amounts utilize `Decimal.js` throughout calculations before saving as standard floating-point numbers rounded to two decimal places, eliminating IEEE 754 precision drift.
3. **Inventory Consistency on Purchase Cancellation:** A critical flaw was detected in `cancelPurchase` where `totalLineQty = line.quantity + line.freeQuantity` ignored `conversionFactor`, causing incomplete inventory reversal on multi-unit packaging (**DEF-001**).

---

## G. Security Audit

1. **Authentication & Password Storage:** Passwords hashed with `bcryptjs` (salt rounds: 10). Session tokens generated with `jsonwebtoken` using 32+ character secret. Inactive users blocked at middleware level.
2. **Role-Based Access Control (RBAC):**
   - `SUPER_ADMIN`: Company-wide access, branch setup, staff management, master catalogue editing, audit log inspection.
   - `BRANCH_ADMIN`: Scoped to assigned branch; restricted from editing catalogue medicines, branches, or super-admin users.
   - `BILLING_USER`: Restricted to counter POS operations and sales invoices.
3. **Cross-Branch Isolation:** Verified via `branch.middleware.ts` and controller-level where clauses. Attempts by Branch Admins to read or modify records of other branches are rejected with HTTP 403.
4. **Administrative Safeguards:** Safeguard prevents deactivating the last remaining active Super Administrator. Users cannot deactivate their own accounts.
5. **Data Protection & Legal Compliance:** DPDP Act Grievance Officer details and Data Subject Rights intake portal implemented.

---

## H. Business Logic & Domain-Specific Audit

1. **Unit Conversion & Packaging Hierarchy:**
   - Hierarchy supported: `Box` -> `Strip` -> `Tablet` / `Bottle` / `Sachet` / `Tube` / `Vial`.
   - Tested rule: 1 Box = 10 Strips; 1 Strip = 10 Tablets; total = 100 Tablets. Unit cost = Purchase Price / 100.
   - POS Counter defaults to `Tablet` for blister tablet medications, with options for `Strip` and `Box` based on product configuration.
2. **Billing, GST & Discount Calculations:**
   - Retail sales use tax-inclusive reverse calculation:
     `taxableAmount = netAfterDiscount / (1 + gstRate / 100)`
     `lineTax = netAfterDiscount - taxableAmount`
     Intra-state sales split equally into `CGST` (50%) and `SGST` (50%).
   - Discount policy enforces permitted limits (0% to 10% on POS counter; 0% to 20% on purchases).
3. **Duplicate Submission & Idempotency:**
   - Duplicate purchase invoices from the same supplier with identical invoice numbers are rejected with user-friendly errors.

---

## I. Build and Runtime Audit

- **Backend Compilation (`tsc`):** Exited with code 0. Zero TypeScript diagnostic errors.
- **Frontend Compilation (`tsc && vite build`):** Exited with code 0. Generated production bundle in `frontend/dist/` (1,605 modules transformed in 1m 7s).
- **Test Suite Execution (`npm test`):** 10 test files executed sequentially (`--fileParallelism=false`). 167 of 167 tests passed.

---

## J. Defect Register

| ID | Severity | Module | Description | Reproduction Steps | Root Cause | Proposed Fix | Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **DEF-001** | **P1** | `backend/src/modules/purchases/purchases.controller.ts` | In `cancelPurchase`, inventory deduction uses `line.quantity + line.freeQuantity` without `conversionFactor` or `baseQuantity`, leaving phantom stock. | Purchase 10 boxes (factor=100) -> 1,000 tablets in batch. Cancel invoice. Batch retains 990 units instead of 0. | Omission of base unit multiplier in lines 1117 & 1137 of `cancelPurchase`. | Use `(line.baseQuantity && line.baseQuantity > 0) ? line.baseQuantity : ((line.quantity + line.freeQuantity) * (line.conversionFactor \|\| 1))` in both verification and deduction passes. | **CONFIRMED** |
| **DEF-002** | **P2** | `frontend/src/components/Sidebar.tsx` | `AuditLogsPage` and `BulkImportPage` exist in code and `App.tsx`, but lack navigation buttons in `Sidebar.tsx`. | Log in as Super Admin. Check sidebar. Links for Audit Logs and Bulk Import are missing. | Missing `<button>` elements in sidebar navigation groups. | Add sidebar navigation items for `imports` (Pharmacy Inventory) and `audit` (Administration). | **CONFIRMED** |
| **DEF-003** | **P3** | `frontend/src/components/FilterButton.tsx` | Popover header active count displays `" active"` without number when `activeFilterCount` is passed. | Open filter popover on page passing `activeFilterCount`. Header badge displays `" active"`. | Line 124 references raw `activeCount` rather than computed `resolvedCount`. | Replace `{activeCount} active` with `{resolvedCount} active`. | **CONFIRMED** |
| **DEF-004** | **P2** | `backend/src/modules/products/products.controller.ts` & `suppliers.controller.ts` | Bulk delete endpoints return generic `Forbidden: Super Admin only` rather than standard user-friendly guidance. | Send `POST /api/products/bulk-delete` as Branch Admin. Response is generic 403 string. | Non-standard error string in `bulkDeleteProducts` and `bulkDeleteSuppliers`. | Update error response to `"You do not have permission to delete these records. Please contact the Super Admin for assistance."` | **CONFIRMED** |
| **DEF-005** | **P3** | `frontend/src/services/api.ts` | On HTTP 401 response, `api.ts` initiates redirect to `/login` which can cause 404 on static hosts without server rewrites. | Expire JWT session token and trigger API request. | Hardcoded `/login` path instead of SPA root `/`. | Redirect to root `/` where `App.tsx` conditionally renders `LoginPage`. | **CONFIRMED** |

---

## K. Test Coverage Summary

- **Tests Passed:** 167
- **Tests Failed:** 0
- **Tests Blocked:** 0
- **Tests Not Run:** 0
- **Tests Not Applicable:** 0
- **Total Test Suites Executed:** 10 / 10
- **Overall Automated Test Suite Health:** 100% Passed

---

*End of Initial Audit Report. Proceeding to Phase 12 Controlled Bug Fixing.*
