# Confidos Pharma — Production Defect Audit & Resolution Report

**Repository:** [https://github.com/jamesyuvaraj27/confidospharma](https://github.com/jamesyuvaraj27/confidospharma)  
**Branch:** `audit/comprehensive-quality-fixes`  
**Date:** October 30, 2026  
**Status:** Completed & Verified  

---

## 1. Executive Summary

This report documents the root-cause diagnosis, targeted engineering fixes, regression testing, and verification for two critical production defects in the Confidos Pharma application:

1. **Defect 1 (DEF-006):** The **Stock Valuation & Margin** and **GST Tax Summary (HSN)** report tabs redirected/rendered to a blank white screen upon tab selection.
2. **Defect 2 (DEF-007):** Bulk deletion in the **Medicine Master Catalogue** failed with an invalid Prisma interactive transaction error (`Transaction not found. Transaction ID is invalid, refers to an old closed transaction Prisma doesn't have information about anymore...`).

Both defects have been permanently resolved with zero visual or layout regressions, full preservation of existing business rules (canonical inventory units, GST reconciliation, foreign-key safety, audit logging, and RBAC authorization), 13 newly authored regression tests passing (190 total tests passing across 12 suites), and successful backend, frontend, and root production builds.

---

## 2. Defect 1: Reports Blank Screen (DEF-006)

### A. Root Cause Analysis
In `frontend/src/pages/ReportsPage.tsx`:
- The page maintained a single shared `reportData` state variable initialized to `null`.
- On initial mount, `DAILY_SALES` was the active report tab, and `loadReport()` populated `reportData` with sales metrics (`totalSales`, `totalTax`, `totalDiscount`, `totalInvoices`, `invoices`).
- When a user clicked **Stock Valuation & Margin** (`VALUATION`) or **GST Tax Summary (HSN)** (`GST`), `setActiveReport(tab)` immediately scheduled a component re-render *before* the asynchronous API request finished.
- On re-render, `activeReport === 'VALUATION'` and `reportData` was truthy (holding the stale `DAILY_SALES` object).
- The JSX evaluated `{activeReport === 'VALUATION' && reportData && (...)`. Inside that block:
  - Line 503 attempted to evaluate `reportData.totalPurchaseValue.toFixed(2)`.
  - Line 507 attempted to evaluate `reportData.totalMrpValue.toFixed(2)`.
  - Line 511 attempted to evaluate `reportData.potentialMargin.toFixed(2)`.
- Because `totalPurchaseValue` does not exist on a daily sales response object, evaluating `.toFixed(2)` on `undefined` threw an unhandled runtime error:
  `TypeError: Cannot read properties of undefined (reading 'toFixed')`
- In React 18, an uncaught render exception unmounts the entire component tree. Since no localized error boundary existed, the entire viewport vanished, rendering an empty `<div id="root"></div>` (the blank white page).
- The identical failure occurred for the `GST` tab where `reportData.totalTaxable.toFixed(2)` threw on undefined.
- Additionally, if an API failure occurred, `loadReport()` swallowed the error with `console.error` and left `reportData` empty without any user-facing error message or recovery action.

### B. Implementation Approach & Fix
1. **Tab Switch State Reset (`handleTabChange`):**
   Introduced `handleTabChange(tab)` which resets `reportData` to `null` and clears any previous `error` state before changing `activeReport`.
2. **Data Shape and Array Guards:**
   Updated panel render conditions to verify data compatibility before rendering metrics:
   - `DAILY_SALES`: `activeReport === 'DAILY_SALES' && reportData && Array.isArray(reportData.invoices)`
   - `VALUATION`: `activeReport === 'VALUATION' && reportData && Array.isArray(reportData.items)`
   - `GST`: `activeReport === 'GST' && reportData && Array.isArray(reportData.hsnRecords)`
   - `EXPIRY`: `activeReport === 'EXPIRY' && reportData && (Array.isArray(reportData.nearExpiry) || Array.isArray(reportData.expired))`
3. **Defensive Formatting:**
   Applied defensive nullish coalescing to all metric displays and table rows:
   `₹{(reportData.totalPurchaseValue ?? 0).toFixed(2)}`, `₹{(reportData.totalTaxable ?? 0).toFixed(2)}`, etc.
4. **User-Facing Error & Empty States:**
   - Added an error banner displaying a user-friendly message and a "Retry Report" button on API failure.
   - Added an empty state placeholder for when zero records match selected filters.

---

## 3. Defect 2: Prisma Bulk Delete Transaction Failure (DEF-007)

### A. Root Cause Analysis
In `backend/src/modules/products/products.controller.ts` (`bulkDeleteProducts`):
- The controller wrapped the bulk deletion in an unconfigured interactive Prisma transaction:
  `const outcome = await prisma.$transaction(async (tx) => { ... })`
- Prisma's interactive transaction defaults to a **5,000ms timeout** and **2,000ms maxWait**.
- Inside the transaction callback, a sequential `for (const id of uniqueIds)` loop was executed.
- For every individual product ID, the code performed an expensive `tx.medicineProduct.findUnique` query with 7 relation counts (`batches`, `salesLines`, `purchaseLines`, `movements`, `adjustments`, `purchaseReturnLines`, `purchaseIndentItems`), followed by a sequential `tx.medicineProduct.update` or `tx.medicineProduct.delete`.
- Over cloud network latency (e.g. Neon PostgreSQL), selecting a batch of products easily exceeded the 5,000ms timeout window while holding interactive transaction locks open.
- When the 5-second timeout expired, Prisma's engine rolled back and closed the transaction.
- The next statement in the loop (`await tx.medicineProduct.update(...)`) then failed with:
  `Transaction API error: Transaction not found. Transaction ID is invalid, refers to an old closed transaction Prisma doesn't have information about anymore, or was obtained before disconnecting.`
- The catch block forwarded raw database/Prisma error messages directly to the client HTTP 500 response.

### B. Implementation Approach & Fix
1. **Batch Querying (Eliminate N+1):**
   Replaced N separate `findUnique` queries with a single batch `findMany` query inside `tx`:
   ```ts
   const products = await tx.medicineProduct.findMany({
     where: { id: { in: uniqueIds } },
     include: {
       _count: {
         select: {
           batches: true,
           salesLines: true,
           purchaseLines: true,
           movements: true,
           adjustments: true,
           purchaseReturnLines: true,
           purchaseIndentItems: true,
         },
       },
     },
   });
   ```
2. **Partitioning and Atomic Writes:**
   - In-memory partitioning separates product IDs into `toArchiveIds` (references > 0) and `toDeleteIds` (references === 0).
   - Writes are executed using bounded batch operations:
     `await tx.medicineProduct.updateMany({ where: { id: { in: toArchiveIds } }, data: { isActive: false } })`
     `await tx.medicineProduct.deleteMany({ where: { id: { in: toDeleteIds } } })`
   - Total database round trips dropped from $2N$ queries to at most 3 bounded operations (~100-300ms total execution time).
3. **Explicit Transaction Configuration:**
   Configured `{ maxWait: 5000, timeout: 15000 }` to provide ample headroom against network latency fluctuations without long lock retention.
4. **Enforced Batch Limits:**
   Added validation rejecting requests exceeding 100 products per operation with HTTP 400.
5. **Safe Error Handling:**
   - Logged diagnostic errors on the server (`console.error`).
   - Mapped foreign-key conflicts (Prisma `P2003`) to HTTP 409.
   - Sanitized internal Prisma errors with a generic, safe client message:
     `"A database error occurred while processing bulk product deletion. No records were corrupted."`
   - Preserved exact Super Admin requirement and Branch Admin HTTP 403 authorization guard.

---

## 4. Files Changed

| File Path | Type | Summary of Changes |
| :--- | :---: | :--- |
| `frontend/src/pages/ReportsPage.tsx` | Modified | Added `error` state, `handleTabChange` tab switcher, panel data shape guards, nullish coalescing on numeric `.toFixed(2)` calls, recoverable error alert, and empty state. |
| `backend/src/modules/products/products.controller.ts` | Modified | Refactored `bulkDeleteProducts` to single `findMany` + `updateMany`/`deleteMany` batching, configured 15s timeout, enforced 100-item limit, sanitized client error messages. |
| `backend/tests/reports_and_bulk_delete_regression.test.ts` | Added | 13 comprehensive regression tests covering reports endpoints, calculations, and bulk delete/archive operations. |
| `docs/audit/defect-register.md` | Modified | Recorded DEF-006 and DEF-007 with root causes, reproduction steps, fixes, and verification evidence. |

---

## 5. Verification & Test Evidence

### A. Regression Suite (`tests/reports_and_bulk_delete_regression.test.ts`)
- **Total Tests:** 13
- **Passed:** 13
- **Failed:** 0
- **Duration:** 34.46s

Detailed test cases:
1. `Daily Sales Register returns expected response shape and calculation totals` (Passed)
2. `Stock Valuation & Margin report returns valid units, cost, MRP, and margin` (Passed)
3. `GST Tax Summary (HSN) groups by HSN code and returns reconciled tax amounts` (Passed)
4. `Expiry Risk Report returns categorized nearExpiry and expired batches` (Passed)
5. `Report endpoints reject unauthenticated requests with HTTP 401` (Passed)
6. `Super Admin bulk-deletes unreferenced products permanently` (Passed)
7. `Super Admin bulk-deletes referenced products safely by archiving (isActive: false)` (Passed)
8. `Mixed selection correctly partitions into deleted and archived within a single transaction` (Passed)
9. `Branch Admin bulk-delete returns HTTP 403 with standardized guidance and leaves DB unchanged` (Passed)
10. `Duplicate IDs are deduplicated and processed exactly once` (Passed)
11. `Invalid input validation: empty or missing IDs return HTTP 400` (Passed)
12. `Exceeding batch size limit (>100 IDs) returns HTTP 400` (Passed)
13. `Non-existent IDs are captured in failed array without throwing transaction error` (Passed)

### B. Full Backend Test Suite (`npm test`)
- **Suites:** 12 passed of 12
- **Total Tests:** 190 passed of 190
- **Failed Tests:** 0
- **Duration:** 453.56s

### C. Production Builds
- `npm run build:backend` (`tsc`): **Exit code 0** (0 TypeScript errors)
- `npm run build:frontend` (`tsc && vite build`): **Exit code 0** (1605 modules transformed)
- `npm run build` (Root build): **Exit code 0**

---

## 6. Business Rule & Security Verification

- **Stock Valuation:** Uses canonical inventory unit (base unit quantity * unit purchase cost / unit MRP). Margin reconciles: `potentialMargin = totalMrpValue - totalPurchaseValue`.
- **GST Reporting:** Groups strictly by HSN code and GST rate slab. Only includes `COMPLETED` sales invoices. Reconciles: `totalTax = totalCgst + totalSgst`.
- **RBAC & Isolation:** Only Super Admin can bulk-delete products; Branch Admin receives HTTP 403 with standardized user guidance. Branch data isolation is strictly maintained across all reporting endpoints.
- **Ledger Integrity:** Products with existing inventory batches, sales lines, purchase lines, stock movements, adjustments, purchase returns, or indents are soft-archived (`isActive: false`) and never purged.
