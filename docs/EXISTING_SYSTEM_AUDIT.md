# Existing System Audit Report
**Confidos Pharma Enterprise Multi-Branch Pharmacy Management Platform**

**Date of Audit:** October 26, 2026  
**Auditor:** Antigravity AI Senior Systems Engineer & Pair Programmer  
**Repository Location:** `f:\pharma`

---

## 1. Executive Summary

A comprehensive architectural and functional audit of the Confidos Pharma repository was conducted. The codebase is a well-structured monorepo containing a high-performance Node.js / Express backend with Prisma ORM and a modern Vite / React / TypeScript frontend.

The system features robust multi-branch data isolation, FEFO (First-Expiry, First-Out) stock dispensing, decimal-accurate financial billing with Indian GST compliance, and audit event trails. However, several critical gaps and areas for enhancement were identified regarding:
1. **Purchase Invoice Workflow:** Primitive supplier dropdown, lack of search/autocomplete, lack of inline creation for suppliers and medicines, missing supplier email persistence and validation.
2. **Missing Backend & Frontend CRUD for Key Admin Modules:** Absence of Edit (`PUT`) and Cancellation/Deletion (`DELETE`) endpoints for Purchase Invoices, Suppliers, Branches, Users, and Products.
3. **Discount & GST Defaults and Display:** Hardcoded rates in UI components rather than configurable system defaults; lack of simultaneous percentage display beside monetary figures (`CGST (2.5%) — ₹21.25`); missing persistent settings infrastructure.
4. **Stock Reconciliation on Purchase Edit/Cancel:** Absence of transaction-safe stock delta reconciliation when modifying historical purchase inwards.

---

## 2. Technology Stack & Environment Details

| Component | Technology | Version | Purpose & Notes |
| :--- | :--- | :--- | :--- |
| **Backend Runtime** | Node.js / TypeScript | TS 5.7.2 | Server execution via `ts-node-dev` (dev) / `tsc` (prod) |
| **Backend Framework**| Express | 4.21.2 | REST API layer mounted on port 5000 |
| **Database & ORM** | SQLite / Prisma ORM | 5.22.0 | Schema in `backend/prisma/schema.prisma`; active DB at `backend/prisma/dev.db` |
| **Financial Math** | Decimal.js | 10.4.3 | Precise decimal arithmetic preventing IEEE 754 floating point drift |
| **Authentication** | JWT (`jsonwebtoken`) & bcryptjs | JWT 9.0.2 / bcryptjs 2.4.3 | Role-based token auth (`SUPER_ADMIN`, `BRANCH_ADMIN`, `BILLING_USER`) |
| **Backend Testing** | Vitest & Supertest | Vitest 2.1.8 / Supertest 7.0.0 | 13 test suites in `backend/tests/api.test.ts` (all currently passing) |
| **Frontend Framework**| React & TypeScript | React 18.3.1 / TS 5.7.2 | Single Page Application built with Vite 6.0.3 |
| **Frontend Styling** | TailwindCSS | 3.4.16 | Utility-first styling with PostCSS and Autoprefixer |
| **Iconography** | Lucide React | 0.468.0 | Clean icon set across navigation and tables |
| **State Management** | React Context API | Native | `AuthContext.tsx` handles session, branch switcher, and user tokens |
| **API Client** | Native Fetch Wrapper | In-house | `frontend/src/services/api.ts` with automatic token injection |

---

## 3. Architecture & Codebase Map

### 3.1 Backend Modules (`backend/src/modules/`)
- `auth`: Credentials login, profile retrieval (`/api/auth`)
- `branches`: Multi-branch setup (`/api/branches`)
- `users`: Staff account management (`/api/users`)
- `products`: Central medicine catalogue (`/api/products`)
- `inventory`: Batches, FEFO algorithm, stock adjustments, branch transfers (`/api/inventory`)
- `billing`: POS retail counter, sales invoices, sales cancellation (`/api/billing`)
- `purchases`: Supplier purchase inwards and debit returns (`/api/purchases`)
- `suppliers`: Supplier directory (`/api/suppliers`)
- `imports`: Bulk Excel/CSV imports with schema validation (`/api/imports`)
- `reports`: Daily sales, stock valuation, expiry alerts, GST summaries (`/api/reports`)
- `expenses`: Operating expense ledger (`/api/expenses`)
- `audit`: Immutable event audit logs (`/api/audit`)
- `privacy`: DPDP / GDPR data privacy compliance portal (`/api/privacy`)

### 3.2 Frontend Structure (`frontend/src/`)
- `components`: `Navbar.tsx`, `Sidebar.tsx`, `Modal.tsx`, `Badge.tsx`, `ReceiptModal.tsx`
- `context`: `AuthContext.tsx` (handles user state, branch isolation context)
- `pages`:
  - `POSBillingPage.tsx` (Counter billing with barcode scan & FEFO auto-selection)
  - `PurchasesPage.tsx` (Inwards invoices, returns, supplier select)
  - `ProductsPage.tsx` (Medicine catalogue)
  - `InventoryPage.tsx` (Batch ledger, manual adjustments, stock transfers)
  - `InvoicesPage.tsx` (Sales invoices register, receipt print, cancellation)
  - `DashboardPage.tsx` (Revenue, low stock, near expiry indicators)
  - `ProfitLossPage.tsx` (Trading and P&L financial statement)
  - `ReportsPage.tsx` (GST summary, tax reports)
  - `BranchesPage.tsx` (Branch configuration)
  - `UsersPage.tsx` (Staff and role management)
  - `AuditLogsPage.tsx` (Security and audit trails)
  - `BulkImportPage.tsx` (Catalogue and batch batch imports)
  - `LegalPage.tsx` (Privacy and regulatory portal)

---

## 4. In-Depth Audit of Primary Target Areas

### 4.1 Supplier Entry & Purchase Invoice Workflow
- **Existing Implementation:**
  - `PurchasesPage.tsx` uses a simple HTML `<select>` containing loaded suppliers.
  - The `Supplier` Prisma model already contains an `email String?` column, but:
    - The creation endpoint `createSupplier` accepts `email`, but does not validate email format with regex.
    - The frontend does not expose an email input anywhere in `PurchasesPage.tsx` or in `InventoryPage.tsx`.
    - There is no dedicated Supplier management page or sub-tab. Users cannot view, edit, or archive suppliers.
    - In `PurchasesPage.tsx`, there is no searchable combobox; a pharmacy with 100+ suppliers has to scroll a raw dropdown.
    - There is no inline "Add Supplier" or "Quick Create Supplier" action inside the purchase modal.
  - **Inwards Invoice Saving Mechanism:**
    - Uses Prisma `$transaction` in `createPurchase`.
    - Accurately creates or updates `StockBatch` and appends `PURCHASE_RECEIPT` movements to `StockMovement`.
    - Handles line gross, line discount, line taxable, line GST, and scheme/free units.
  - **Missing Features:**
    - No `GET /api/purchases/:id` to fetch full invoice details for editing.
    - No `PUT /api/purchases/:id` to update an existing purchase invoice with stock delta reconciliation.
    - No `DELETE /api/purchases/:id` or cancellation workflow to void a purchase and safely decrement received inventory.
    - No supplier email field or validation in the UI.

### 4.2 Medicine Entry & Custom Item Support
- **Existing Implementation:**
  - `PurchasesPage.tsx` uses an HTML `<select>` of all catalogue medicines.
  - On select, it autofills `mrp`, `sellingRate`, `purchaseRate` (from `defaultPurchaseRate`), and `gstRate`.
  - If a medicine is not yet in the catalogue, the user cannot proceed from the invoice screen.
- **Identified Needs:**
  - Searchable medicine selector with live brand name, generic name, dosage form, and strength filtering.
  - Inline "Add New Medicine to Catalogue" modal/form directly accessible from the purchase line.
  - Support for custom item descriptions with explicit inventory handling (creating or linking a tracked catalogue item with batch tracking).

### 4.3 Discount Configuration & Display
- **Existing Implementation:**
  - Hardcoded `discountPercent = 0` and `invoiceDiscountAmount = 0` in `PurchasesPage.tsx`.
  - In `backend/prisma/seed.ts`, `SystemSetting` has keys `ALLOW_MANUAL_DISCOUNT` and `MAX_DISCOUNT_PERCENT`, but there is no `DEFAULT_PURCHASE_DISCOUNT_PERCENT`.
  - No settings API (`/api/settings`) exists in the backend to read or configure default discount rates.
  - Display displays monetary amounts without adjacent percentages.
- **Identified Needs:**
  - Configurable default discount setting (initialized to **15%**, permitted range 0%–100%, configurable up to 20%+ by admin).
  - Clear dual presentation: e.g. `Discount (15%) — ₹150.00`.
  - Configurable in a dedicated Settings/Customization area backed by the `SystemSetting` database table.

### 4.4 GST Configuration & Display
- **Existing Implementation:**
  - Hardcoded GST dropdown `[0, 5, 12, 18, 28]` in `PurchasesPage.tsx` with default fallback to 12%.
  - Tax calculation in billing splits intra-state GST into equal `cgst` and `sgst` halves.
  - In `POSBillingPage.tsx` and `ReceiptModal.tsx`, CGST and SGST are displayed as:
    `CGST (Intra-state Tax): ₹21.25`
    without showing the rate percentage.
- **Identified Needs:**
  - Configurable default CGST (2.5%) and SGST (2.5%), giving combined default GST of 5%.
  - Preserve product-level tax classification (products with 12%, 18%, 28% retain their legal classification upon selection).
  - Unified percentage display:
    `CGST (2.5%) — ₹21.25`  
    `SGST (2.5%) — ₹21.25`  
    `Total GST (5%) — ₹42.50`
  - Formula: `Total GST % = CGST % + SGST %`.

### 4.5 Admin Panel CRUD & Customization Audit

| Module | Create | Read/Search | Update (Edit) | Delete / Archive | Customization / Settings | Audit Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Suppliers** | Yes | Read Only | ❌ Missing | ❌ Missing | ❌ Missing | Backend routes only have GET & POST; no frontend management UI. |
| **Medicines** | Yes | Yes (Search/Filter) | ❌ Missing in UI | ❌ Missing in UI | ❌ Missing | Backend has PUT, but UI lacks Edit and Delete/Archive buttons. |
| **Purchase Invoices** | Yes | Yes | ❌ Missing | ❌ Missing | ❌ Missing | No edit or cancellation endpoint; no stock reconciliation. |
| **Sales Invoices** | Yes | Yes | N/A (Immutable) | Yes (Cancel + Stock Restore) | N/A | Fully implemented and audit compliant. |
| **Stock Batches** | Yes | Yes | Yes (Stock Adjust) | ❌ Missing | ❌ Missing | Physical count discrepancy adjustments supported. |
| **Branches** | Yes | Yes | ❌ Missing in UI | ❌ Missing in UI | ❌ Missing | Backend has PUT; UI only has Register modal. |
| **Users / Staff** | Yes | Yes | ❌ Missing in UI | ❌ Missing in UI | ❌ Missing | Backend has PUT; UI only has Create modal. |
| **System Settings** | ❌ None | ❌ None | ❌ None | ❌ None | ❌ Missing | Model exists in Prisma, but no API or UI exists. |

---

## 5. Planned Modifications Checklist

1. **Database & Settings Architecture:**
   - Implement `backend/src/modules/settings` with `settings.controller.ts` and `settings.routes.ts`.
   - Seed and support persistent configuration: `DEFAULT_PURCHASE_DISCOUNT_PERCENT` (default 15%), `DEFAULT_CGST_RATE` (2.5%), `DEFAULT_SGST_RATE` (2.5%), `DEFAULT_COMBINED_GST_RATE` (5.0%).
   - Ensure settings are exposed via REST API (`GET /api/settings`, `PUT /api/settings`).

2. **Supplier Module Completion:**
   - Add `updateSupplier` (PUT `/api/suppliers/:id`) and `deleteSupplier` (DELETE `/api/suppliers/:id` with relationship safety checks).
   - Add email validation regex and prevent duplicate emails/phones.
   - Build a dedicated "Suppliers Directory" tab in `PurchasesPage.tsx` with full CRUD (Create, Edit, Archive/Delete, Search).
   - Expose supplier email, phone, GSTIN, and contact person in all views.

3. **Purchase Inwards & Invoice Enhancements:**
   - Searchable supplier autocomplete with quick inline "Add Supplier" modal.
   - Searchable medicine autocomplete with quick inline "Add Medicine" modal.
   - Automatic pre-fill of configurable default discount (15%) and default GST (5% / 2.5% + 2.5%), while respecting product-level GST rates when existing medicines are picked.
   - Add `getPurchaseById` (`GET /api/purchases/:id`), `updatePurchase` (`PUT /api/purchases/:id` with stock delta reconciliation), and `cancelPurchase` (`POST /api/purchases/:id/cancel` with inventory safety checks).
   - Add Edit and Cancel actions to the Purchase Invoices table.

4. **Tax & Discount Percentage Display:**
   - Update `PurchasesPage.tsx`, `POSBillingPage.tsx`, `ReceiptModal.tsx`, and `InvoicesPage.tsx` to display rates directly adjacent to amounts:
     - `CGST (2.5%) — ₹21.25`
     - `SGST (2.5%) — ₹21.25`
     - `Total GST (5%) — ₹42.50`
     - `Discount (15%) — ₹150.00`
   - Include clear table headers indicating percentage rates.

5. **Admin Panel CRUD & Customization across Modules:**
   - **Catalogue (`ProductsPage.tsx`):** Add Edit Medicine modal and Archive/Deactivate action with confirmation.
   - **Branches (`BranchesPage.tsx`):** Add Edit Branch modal and Deactivate/Activate toggle.
   - **Users (`UsersPage.tsx`):** Add Edit Staff Account modal and Deactivate/Activate toggle.
   - **Settings (`SettingsModal` or Customization Tab):** Add an administrative settings interface for default discount, CGST/SGST defaults, and company preferences.

6. **Automated & Manual Regression Testing:**
   - Update `backend/tests/api.test.ts` to test supplier email validation, purchase invoice edit with stock reconciliation, purchase invoice cancellation, and settings persistence.
   - Verify all tests pass and ensure no existing functionality is broken.
   - Validate clean production builds for both frontend and backend.
