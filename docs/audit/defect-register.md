# Confidos Pharma — Defect Register

**Project:** Confidos Pharma Enterprise Multi-Branch Inventory and Billing Platform  
**Repository:** [https://github.com/jamesyuvaraj27/confidospharma](https://github.com/jamesyuvaraj27/confidospharma)  
**Branch:** `audit/comprehensive-quality-fixes`  
**Date of Audit:** October 30, 2026  

---

## Confirmed Defect Register

| ID | Severity | Module | Description | Reproduction Steps | Root Cause | Proposed Fix | Status | Verification Evidence |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **DEF-001** | **P1** | `backend/src/modules/purchases/purchases.controller.ts` | In `cancelPurchase`, inventory deduction uses `line.quantity + line.freeQuantity` without `conversionFactor` or `baseQuantity`, leaving phantom stock. | 1. Purchase 10 boxes (conversionFactor=100) -> 1,000 tablets in batch.<br>2. Cancel invoice with reason.<br>3. Inspect batch available quantity: 990 instead of 0. | Omission of packaging multiplier in lines 1117 & 1137 of `cancelPurchase`. | Use `(line.baseQuantity && line.baseQuantity > 0) ? line.baseQuantity : ((line.quantity + line.freeQuantity) * (line.conversionFactor \|\| 1))` in both passes. | **VERIFIED** | Verified by regression suite `tests/quality_audit_fixes_regression.test.ts` (Test 1: Full base unit stock deduction & DEPLETED status; Test 2: Partial retail sale cancellation guard). |
| **DEF-002** | **P2** | `frontend/src/components/Sidebar.tsx` | `AuditLogsPage` and `BulkImportPage` exist in code and `App.tsx`, but lack navigation buttons in `Sidebar.tsx`. | 1. Log in as Super Admin.<br>2. Check sidebar.<br>3. Links for Audit Logs and Bulk Import are absent. | Missing `<button>` elements in sidebar navigation groups. | Add sidebar navigation items for `imports` (Pharmacy Inventory) and `audit` (Administration). | **VERIFIED** | Implemented navigation buttons for Bulk Inward Import (`ArrowDownToLine`) and Security & Audit Logs (`FileLock2`). Verified in frontend production build. |
| **DEF-003** | **P3** | `frontend/src/components/FilterButton.tsx` | Popover header active count displays `" active"` without number when `activeFilterCount` is passed. | 1. Open filter popover on page passing `activeFilterCount`.<br>2. Header badge displays `" active"`. | Line 124 references raw `activeCount` rather than computed `resolvedCount`. | Replace `{activeCount} active` with `{resolvedCount} active`. | **VERIFIED** | Popover badge updated to `{resolvedCount} active`. Confirmed in frontend build. |
| **DEF-004** | **P2** | `backend/src/modules/products/products.controller.ts` & `suppliers.controller.ts` | Bulk delete endpoints return generic `Forbidden: Super Admin only` rather than standard user-friendly guidance. | 1. Send `POST /api/products/bulk-delete` as Branch Admin.<br>2. Response is generic 403 string. | Non-standard error string in `bulkDeleteProducts` and `bulkDeleteSuppliers`. | Update error response to `"You do not have permission to delete these records. Please contact the Super Admin for assistance."` | **VERIFIED** | Standardized error message implemented in both controllers and verified by regression test suite `tests/quality_audit_fixes_regression.test.ts`. |
| **DEF-005** | **P3** | `frontend/src/services/api.ts` | On HTTP 401 response, `api.ts` initiates redirect to `/login` which can cause 404 on static hosts without server rewrites. | 1. Expire JWT session token.<br>2. Trigger API request. | Hardcoded `/login` path instead of SPA root `/`. | Redirect to root `/` where `App.tsx` conditionally renders `LoginPage`. | **VERIFIED** | Changed window.location.href to `'/'`. SPA routing preserves login view without 404 risk. |

