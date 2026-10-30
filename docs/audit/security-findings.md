# Confidos Pharma — Security & Permissions Audit Findings

**Project:** Confidos Pharma Enterprise Multi-Branch Inventory and Billing Platform  
**Repository:** [https://github.com/jamesyuvaraj27/confidospharma](https://github.com/jamesyuvaraj27/confidospharma)  
**Date:** October 30, 2026  

---

## 1. Authentication & Session Management
- **Password Storage:** Uses `bcryptjs` with 10 salt rounds. Passwords are never stored in plaintext and never logged.
- **Session Tokens:** Stateless JWT with minimum 32-character secret (`JWT_SECRET`). Token expiration and verification handled centrally via `auth.middleware.ts`.
- **Session Invalidation & Inactive Users:** The middleware performs real-time database lookup to ensure the user account is active (`user.isActive === true`). If an account is deactivated by an administrator, active tokens are immediately rejected with HTTP 401.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Resource | Operation | Super Admin | Branch Admin | Billing User | Backend Enforcement | UI Guard | Result |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- | :---: |
| **Branches** | Create / Update | ✅ Allowed | ❌ Blocked | ❌ Blocked | `requireRole(['SUPER_ADMIN'])` | Menu hidden | PASS |
| **Staff Accounts** | Create Super Admin | ✅ Allowed | ❌ Blocked | ❌ Blocked | Rejected with HTTP 403 | Form restricted | PASS |
| **Staff Accounts** | Create Branch Admin | ✅ Allowed | ❌ Blocked | ❌ Blocked | Rejected with HTTP 403 | Form restricted | PASS |
| **Staff Accounts** | Create Billing Cashier | ✅ Allowed | ✅ Allowed (Own Branch) | ❌ Blocked | Scoped to `req.user.branchId` | Filtered | PASS |
| **Staff Accounts** | Deactivate Last Super Admin | ❌ Blocked | ❌ Blocked | ❌ Blocked | Blocked with HTTP 400 | N/A | PASS |
| **Staff Accounts** | Self Deactivation | ❌ Blocked | ❌ Blocked | ❌ Blocked | Blocked with HTTP 400 | Disabled | PASS |
| **Master Catalogue** | Create Medicine | ✅ Allowed | ✅ Allowed | ❌ Blocked | Rejected with HTTP 403 | Form hidden | PASS |
| **Master Catalogue** | Edit / Delete Medicine | ✅ Allowed | ❌ Blocked | ❌ Blocked | Rejected with HTTP 403 (`DEF-004` guidance aligned) | `PermissionDeniedModal` | PASS |
| **Suppliers** | Create / Edit | ✅ Allowed | ✅ Allowed | ❌ Blocked | Rejected with HTTP 403 | Tab hidden | PASS |
| **Suppliers** | Delete Supplier | ✅ Allowed | ❌ Blocked | ❌ Blocked | Rejected with HTTP 403 | `PermissionDeniedModal` | PASS |
| **Stock Monitoring** | View Dashboard | ✅ Allowed (All) | ✅ Allowed (Own) | ❌ Blocked | Strict branch filter | Tab hidden | PASS |
| **Stock Monitoring** | Mutating Methods | ❌ Blocked | ❌ Blocked | ❌ Blocked | Router exposes only GET | Read-only | PASS |
| **POS Billing** | Generate Sales Invoice | ✅ Allowed | ✅ Allowed | ✅ Allowed | Scoped to cashier & branch | Active | PASS |
| **Purchases** | Post Supplier Inward | ✅ Allowed | ✅ Allowed | ❌ Blocked | Rejected with HTTP 403 | Hidden | PASS |
| **Purchases** | Cancel Supplier Inward | ✅ Allowed | ✅ Allowed (Own) | ❌ Blocked | Transactional verification | Modal | PASS |
| **Audit Logs** | View Audit Events | ✅ Allowed | ❌ Blocked | ❌ Blocked | Scoped to Super Admin | `Sidebar.tsx` navigation updated | PASS |
| **Privacy Requests** | View / Resolve DSR | ✅ Allowed | ❌ Blocked | ❌ Blocked | Rejected with HTTP 403 | Restricted | PASS |

---

## 3. Branch Data Isolation
Cross-branch isolation is enforced on both controller and middleware tiers (`enforceBranchScope` & `resolveAllowedBranchId`):
1. Branch Admins and Billing Users attempting to query or modify data belonging to another branch receive HTTP 403:
   `"Access denied: You are not authorized to view or modify records belonging to another branch."`
2. SQL injection risks are mitigated by parameterized Prisma queries.
3. Inward imports and stock receipts validate target branch active status. Inactive or deleted branches reject inward attempts.

---

## 4. Privacy & Compliance Findings (India DPDP Act)
1. **Grievance Mechanism:** Dedicated Grievance Officer disclosures and contact emails present in `LegalPage.tsx`.
2. **Data Subject Rights (DSR) Intake:** Functional public intake form submitting to `/api/privacy/requests`, logging audit events and issuing tracking tickets (`DSR-YYYY-XXXX`).
3. **Data Retention & Soft Deletion:** Historical financial records (sales invoices, purchase invoices, stock movements) cannot be permanently purged; soft archiving preserves audit trails for regulatory compliance.
