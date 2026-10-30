# Confidos Pharma Enterprise OS — Complete User Manual
**Enterprise Multi-Branch Pharmacy Management, Point-of-Sale Billing & Inventory Operating System**

---

## Table of Contents
1. [System Overview & Architecture](#1-system-overview--architecture)
2. [End-to-End Operational Workflow](#2-end-to-end-operational-workflow)
3. [User Roles & Permissions Matrix](#3-user-roles--permissions-matrix)
4. [Step 1: First-Time Setup & Administrator Onboarding](#4-step-1-first-time-setup--administrator-onboarding)
5. [Step 2: Branch Infrastructure & Staff User Management](#5-step-2-branch-infrastructure--staff-user-management)
6. [Step 3: Supplier Directory Management](#6-step-3-supplier-directory-management)
7. [Step 4: Medicine Catalogue Management](#7-step-4-medicine-catalogue-management)
8. [Step 5: 2-Stage Bulk Data Import Engine (Excel & CSV)](#8-step-5-2-stage-bulk-data-import-engine-excel--csv)
9. [Step 6: Inward Purchases & Stock Procurement](#9-step-6-inward-purchases--stock-procurement)
10. [Step 7: Purchase Indents (Branch Requisitions)](#10-step-7-purchase-indents-branch-requisitions)
11. [Step 8: Inter-Branch Stock Transfers](#11-step-8-inter-branch-stock-transfers)
12. [Step 9: Inventory Management & FEFO Batch Expiry Tracking](#12-step-9-inventory-management--fefo-batch-expiry-tracking)
13. [Step 10: High-Speed Counter POS Billing](#13-step-10-high-speed-counter-pos-billing)
14. [Step 11: Sales Invoices Register & Returns](#14-step-11-sales-invoices-register--returns)
15. [Step 12: Financial Analytics & Profit & Loss Statement](#15-step-12-financial-analytics--profit--loss-statement)
16. [Step 13: Management Reports & Regulatory Analytics](#16-step-13-management-reports--regulatory-analytics)
17. [Step 14: Legal Compliance & Schedule H/H1 Narcotic Registers](#17-step-14-legal-compliance--schedule-hh1-narcotic-registers)
18. [Step 15: Immutable Security Audit Trail & System Configuration](#18-step-15-immutable-security-audit-trail--system-configuration)
19. [Troubleshooting & Error Resolution Guide](#19-troubleshooting--error-resolution-guide)

---

## 1. System Overview & Architecture

**Confidos Pharma Enterprise OS** is a pharmaceutical inventory, compliance, and point-of-sale billing platform engineered for multi-branch retail and wholesale pharmacy operations in India. It complies strictly with the **Drugs and Cosmetics Act**, Indian **GST standards**, and **DPDP Act** regulations.

### Key Capabilities
- **Strict Multi-Branch Isolation:** Ensures that branch administrators and cashiers access only their branch's inventory, sales invoices, and batches. Super Administrators can manage and view consolidated data across all branches.
- **Automated FEFO (First Expiry, First Out) Allocation:** The POS billing engine automatically selects the earliest-expiring active batch, preventing expired medicines from being dispensed.
- **Dual Packaging & Unit Conversion Engine:** Supports buying in large packaging units (e.g., Box of 10 Strips = 100 Tablets) and dispensing at the counter in Boxes, Strips, or individual loose Tablets with automated price and stock normalization.
- **Two-Stage Bulk Import Engine:** Fast, deterministic Excel (`.xlsx`, `.xls`) and CSV (`.csv`) staging engine with real-time validation, preview metrics, duplicate detection, and downloadable error files.
- **Drug Law & Narcotic Compliance:** Digital Schedule H, H1, and Schedule X registers capturing patient identity, prescribing doctor, medical council registration number, and batch tracking.
- **Dual Receipt Printing:** Prints both **80mm ESC/POS thermal counter receipts** and full **A4 GST Tax Invoices** with drug license numbers and legal disclaimers.

---

## 2. End-to-End Operational Workflow

The recommended sequence for setting up and operating Confidos Pharma is shown below:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. INITIAL SETUP: Onboarding Wizard (Company, Super Admin & Primary Branch) │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. INFRASTRUCTURE: Additional Branches & Staff Users (Admins & Cashiers)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. MASTER DATA: Suppliers Directory & Medicine Catalogue (Brands & Units)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. BULK IMPORTS: Import Medicines Catalogue (Type A) & Opening Stock (Type B│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. PROCUREMENT: Purchase Indents -> Approved -> Inward Supplier Purchases   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. STOCK MANAGEMENT: Real-Time FEFO Inventory, Adjustments & Branch Transfers│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 7. DISPENSING & POS BILLING: Barcode / Fast Search -> FEFO Cart -> Receipt  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 8. AUDIT & REPORTING: Sales Register, P&L, Expiry Forecast, Schedule H1 Log │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. User Roles & Permissions Matrix

Confidos Pharma enforces Role-Based Access Control (RBAC) at both the API and database levels:

| Feature / Action | Super Admin | Branch Admin | Billing User (Cashier) |
| :--- | :---: | :---: | :---: |
| **System Initial Setup** | Full Access | No | No |
| **Branch Directory (Create/Edit)** | Full Access | View Assigned | View Assigned |
| **User Staff Management** | Full Access | Scoped to Branch | No |
| **Medicine Catalogue (Create/Edit)** | Full Access | Full Access | Read-Only |
| **Bulk Catalogue & Stock Imports** | Full Access | Assigned Branch | No |
| **Supplier Purchases Inward** | Full Access | Assigned Branch | Read-Only |
| **Purchase Indents Requisition** | Full / Approve | Create / Review | No |
| **Inter-Branch Stock Transfers** | Full Access | Initiate / Confirm | No |
| **Physical Stock Adjustments** | Full Access | Assigned Branch | No |
| **POS Counter Billing** | Full Access | Full Access | Full Access |
| **Sales Invoices Reprinting** | Full Access | Assigned Branch | Assigned Branch |
| **Invoice Cancellation / Refund** | Full Access | Assigned Branch | Supervisor PIN |
| **P&L Financial Statements** | Consolidated | Assigned Branch | No |
| **Schedule H1 Narcotic Register** | Full Access | Assigned Branch | Read-Only |
| **Immutable Security Audit Log** | Full Access | Scoped to Branch | No |

---

## 4. Step 1: First-Time Setup & Administrator Onboarding

When Confidos Pharma is launched on an empty database (or after a fresh reset), the system automatically detects that zero user accounts exist (`GET /api/auth/setup-status` returns `needsSetup: true`) and presents the **Initial Database Onboarding Wizard**.

```
┌─────────────────────────────────────────────────────────────┐
│                   Confidos Pharma OS                        │
│             INITIAL DATABASE ONBOARDING                     │
│                                                             │
│ Full Name:       [ Dr. Ramesh Kumar                       ] │
│ Username:        [ admin                                  ] │
│ Official Email:  [ admin@confidospharma.com               ] │
│ Password:        [ ••••••••••••                           ] │
│ Confirm Password:[ ••••••••••••                           ] │
│ Company Name:    [ Confidos Pharma Ltd.                   ] │
│ Primary Branch:  [ Vijayawada Central Branch              ] │
│ Branch Code:     [ B-VJA                                  ] │
│                                                             │
│ [ CREATE SUPER ADMINISTRATOR & INITIALIZE OS ]              │
└─────────────────────────────────────────────────────────────┘
```

### Required Fields for Setup
1. **Full Name:** Complete name of the primary corporate administrator (e.g., `Dr. K. S. Rao`).
2. **Username:** Unique login handle (e.g., `admin` or `superadmin`). Must be lowercase and alphanumeric.
3. **Official Email:** Valid corporate email address (e.g., `admin@confidospharma.com`).
4. **Password:** Minimum 8 characters. Contains letters, numbers, and symbols.
5. **Confirm Password:** Must match password exactly.
6. **Company Name:** Corporate legal entity (e.g., `Confidos Pharma Ltd.`).
7. **Primary Branch Name (Optional but Recommended):** Name of the first operating pharmacy (e.g., `Vijayawada Central Branch`).
8. **Branch Code (Optional):** Unique 3–6 character code (e.g., `B-VJA`).

### Submission & Immediate Access
- Clicking **Create Super Administrator & Initialize OS** executes an atomic transaction creating the Company, primary Branch, and the Super Admin account.
- The system automatically issues an enterprise JWT session token and logs you straight into the **Dashboard**.

---

## 5. Step 2: Branch Infrastructure & Staff User Management

### Managing Pharmacy Branches (`/branches`)
The **Branches** page allows the Super Admin to configure multiple pharmacy locations across cities.

```
┌──────────────────────────────────────────────────────────────┐
│ [+] Add New Branch                                           │
├──────────────────┬─────────────────┬───────────┬─────────────┤
│ Branch Code      │ Name            │ Phone     │ Status      │
├──────────────────┼─────────────────┼───────────┼─────────────┤
│ B-VJA            │ Vijayawada Main │ 8662471122│ ACTIVE      │
│ B-GNT            │ Guntur Hospital │ 8632234455│ ACTIVE      │
│ B-TNL            │ Tenali Market   │ 8644223344│ ACTIVE      │
└──────────────────┴─────────────────┴───────────┴─────────────┘
```

#### Creating a New Branch
Click **Add New Branch** and complete the form:
- **Branch Code:** Unique uppercase code (e.g., `B-HYD`).
- **Branch Name:** Full operational name (e.g., `Hyderabad Banjara Hills Branch`).
- **Address:** Physical dispensary street address.
- **Phone:** Contact telephone number (e.g., `+91 40 23456789`).
- **Official Email:** Branch billing email address.
- **GSTIN:** 15-character Indian State GST number (e.g., `36AAAAA1234A1Z5`).
- **Drug License No:** Regulatory pharmacy license (e.g., `20B/21B-TS/HYD/4011`).

---

### Managing Staff Accounts (`/users`)
Accessible to Super Admins and Branch Admins for provisioning cashiers and pharmacists.

#### Creating a User
Click **Add New Staff Member**:
- **Full Name:** Employee's legal name (e.g., `Suresh Varma`).
- **Username:** Alphanumeric handle (e.g., `suresh_vja`).
- **Email:** Staff email address.
- **Password:** Initial password (min 8 characters).
- **Assigned Role:**
  - `SUPER_ADMIN`: Full system-wide privileges.
  - `BRANCH_ADMIN`: Branch inventory manager / head pharmacist.
  - `BILLING_USER`: Front-counter cashier.
- **Branch:** Assign to one of the configured branches (leave unassigned for Super Admin).

> [!IMPORTANT]
> **Staff Deactivation & Security:** Staff members can be deactivated instantly using the toggle switch. The system blocks self-deactivation and prevents Branch Admins from tampering with Super Admin accounts.

---

## 6. Step 3: Supplier Directory Management

Before recording inward purchase invoices, configure your approved pharmaceutical distributors and stockists in **Purchases -> Supplier Directory** (`/purchases` tab 2).

### Required Fields for Suppliers
- **Supplier Name:** Registered distributor trade name (e.g., `Sri Balaji Pharma Distributors`).
- **Phone:** Contact mobile/telephone number (e.g., `+91 98480 12345`).
- **Email Address:** Billing email (e.g., `orders@balajipharma.in`).
- **GSTIN:** 15-character Supplier GST number (e.g., `37ABCDE1234F1Z5`).
- **Address:** Registered warehouse/depot address.
- **Drug License Number:** Wholesale 20B/21B license number.

---

## 7. Step 4: Medicine Catalogue Management

The **Medicine Catalogue** (`/products`) is the central master repository for all medicines and surgical items sold across the pharmacy chain.

```
┌─────────────────────────────────────────────────────────────┐
│ Medicines Catalogue                                         │
│ Search: [ Dolo                                            ] │
├──────────┬──────────────┬────────┬────────┬───────┬─────────┤
│ Code     │ Brand Name   │ Generic│ Strength│ MRP  │ Stock   │
├──────────┼──────────────┼────────┼────────┼───────┼─────────┤
│ MED-001  │ Dolo 650     │ Paracet│ 650 mg │ 35.00 │ 120 Tab │
│ MED-002  │ Augmentin 625│ Amox+Cl│ 625 mg │220.00 │  40 Tab │
└──────────┴──────────────┴────────┴────────┴───────┴─────────┘
```

### Adding a Medicine Manually
Click **Add New Medicine** and fill in the technical attributes:
1. **Brand Name:** Trade name (e.g., `Azithral 500`).
2. **Generic Name / Salt:** Active pharmaceutical ingredient (e.g., `Azithromycin`).
3. **Strength:** Potency (e.g., `500 mg` or `100 ml`).
4. **Dosage Form:** Choose from `Tablet`, `Capsule`, `Syrup`, `Injection`, `Ointment`, `Drops`, `Powder`, `Inhaler`.
5. **Manufacturer:** Pharmaceutical company (e.g., `Alembic Pharmaceuticals`).
6. **HSN Code:** 8-digit GST HSN code (default for pharmaceuticals: `30049099`).
7. **GST Rate (%):** Indian GST slab (commonly `12%` or `5%`).
8. **MRP (₹):** Maximum Retail Price printed on packaging.
9. **Packaging & Unit Conversion (Crucial):**
   - **Base Unit:** Smallest physical dispensing unit (e.g., `Tablet` or `ml`).
   - **Package Unit:** Inward procurement unit (e.g., `Box` or `Strip`).
   - **Conversion Factor:** Number of base units in one package (e.g., 1 Box = `100` Tablets; 1 Strip = `10` Tablets).
10. **Prescription Category:**
    - `Schedule H`: Requires valid doctor's prescription.
    - `Schedule H1`: High-risk antibiotics / habit-forming drugs; requires special register entry.
    - `Schedule X`: Psychotropic / narcotic substances; requires dual-signoff.
    - `OTC`: Over-the-counter general medicine.

---

## 8. Step 5: 2-Stage Bulk Data Import Engine (Excel & CSV)

Confidos Pharma features a deterministic two-stage bulk import engine (`/bulk-import`) that parses, validates, stages, and commits hundreds of medicines and stock batches in seconds without fabricating data.

### Workflow Overview
1. **Stage 1 — Upload & Validate:** Upload your file (`.csv`, `.xlsx`, or `.xls`). The server parses headers, normalizes data, and produces a live **Staged Preview**.
2. **Stage 2 — Review & Commit:** Inspect the valid rows, errors, duplicates, and warnings. If satisfied, click **Commit Import to Live Database**.

---

### Import Type A: Medicine Catalogue Import
- **Purpose:** Populates the master catalogue (`MedicineProduct`) across the company.
- **Inventory Impact:** **Zero**. It does **not** create stock batches.
- **Execution Order:** Must be imported **before** stock receipts.

#### Canonical CSV / Excel Column Headers for Catalogue Import
| Canonical Header | Required? | Accepted Aliases | Example Value | Description |
| :--- | :---: | :--- | :--- | :--- |
| **Brand Name** | **YES** | `brand_name`, `product_name`, `item_name` | `Telma 20` | Trade medicine name |
| **Generic Name** | **YES** | `generic_name`, `salt`, `composition` | `Telmisartan` | Active composition |
| **Strength** | **YES** | `potency`, `dosage`, `dose` | `20 mg` | Potency per unit |
| **Dosage Form** | No | `form`, `type`, `dosage_form` | `Tablet` | Default: `Tablet` |
| **Manufacturer** | No | `mfg`, `company`, `make` | `Glenmark` | Manufacturing pharma |
| **Pack Size** | No | `pack_size`, `packaging` | `15 Tablets` | Packaging description |
| **HSN Code** | No | `hsn_code`, `hsn` | `30049099` | 4–8 digit Indian HSN |
| **GST Rate** | No | `gst_rate`, `tax_rate` | `12` | GST percentage (0, 5, 12, 18) |
| **MRP** | **YES** | `maximum_retail_price`, `price` | `98.00` | Max Retail Price |
| **Barcode** | No | `ean`, `upc`, `code128` | `8901117009999`| EAN/UPC barcode |
| **Prescription Type**| No | `schedule`, `rx_type` | `Schedule H` | Regulatory schedule |

#### Sample Catalogue CSV (Copy-Paste Ready)
```csv
Brand Name,Generic Name,Strength,Dosage Form,Manufacturer,Pack Size,HSN Code,GST Rate,MRP,Barcode,Prescription Type
Telma 20,Telmisartan,20 mg,Tablet,Glenmark,15 Tablets,30049099,12,98.00,8901117009999,Schedule H
Dolo 650,Paracetamol,650 mg,Tablet,Micro Labs,15 Tablets,30049099,12,35.00,8901117001111,OTC
Augmentin 625,Amoxicillin + Clavulanic Acid,625 mg,Tablet,GSK,10 Tablets,30049099,12,223.50,8901117002222,Schedule H
Benadryl Cough Syrup,Diphenhydramine + Ammonium Chloride,100 ml,Syrup,Johnson & Johnson,1 Bottle,30049099,12,125.00,8901117003333,OTC
Pantocid 40,Pantoprazole,40 mg,Tablet,Sun Pharma,15 Tablets,30049099,12,160.00,8901117004444,Schedule H
```

---

### Import Type B: Stock Receipt Import
- **Purpose:** Records delivery of physical medicine batches for a designated pharmacy branch.
- **Inventory Impact:** **Increases physical branch stock** and writes traceable `PURCHASE_RECEIPT` movements.
- **Execution Order:** Must be imported **after** catalogue records exist.

#### Canonical CSV / Excel Column Headers for Stock Receipts
| Canonical Header | Required? | Accepted Aliases | Example Value | Description |
| :--- | :---: | :--- | :--- | :--- |
| **Internal Code** | Conditional | `code`, `product_code`, `sku` | `MED-0001` | Required if Brand Name omitted |
| **Brand Name** | Conditional | `brand_name`, `medicine_name` | `Dolo 650` | Matched if Code omitted |
| **Batch Number** | **YES** | `batch_number`, `batch`, `lot` | `DL-2026-X1` | Manufacturer batch ID |
| **Expiry Date** | **YES** | `expiry`, `exp_date` | `2028-12-31` | Expiry (`YYYY-MM-DD` or `DD/MM/YYYY`) |
| **Quantity** | **YES** | `qty`, `units`, `received_qty` | `50` | Quantity received |
| **Purchase Rate**| **YES** | `purchase_rate`, `cost_price` | `23.50` | Unit purchase cost |
| **MRP** | **YES** | `retail_price`, `price` | `35.00` | Unit MRP (Must be >= Purchase Rate) |

#### Sample Stock Receipt CSV (Copy-Paste Ready)
```csv
Brand Name,Batch Number,Expiry Date,Quantity,Purchase Rate,MRP
Dolo 650,DL-2026-X1,2028-12-31,100,24.50,35.00
Augmentin 625,AUG-2026-B2,2027-10-31,50,165.00,223.50
Telma 20,TL-2026-K9,2028-06-30,40,68.00,98.00
Benadryl Cough Syrup,BND-2026-S1,2027-12-31,30,85.00,125.00
```

---

## 9. Step 6: Inward Purchases & Stock Procurement

The **Purchases Module** (`/purchases`) handles recording supplier tax invoices, verifying GST, applying trade discounts, and tracking accounts payable.

```
┌─────────────────────────────────────────────────────────────┐
│ RECORD INWARD PURCHASE INVOICE                              │
│ Supplier: [ Sri Balaji Pharma   ] Inv #: [ BAL-9841       ] │
│ Date:     [ 2026-11-01          ] Branch:[ Vijayawada     ] │
├─────────────────────────────────────────────────────────────┤
│ Line Items:                                                 │
│ 1. Dolo 650      | Batch: B-771 | Exp: 2028-12 | Qty: 100   │
│    Rate: ₹24.50  | MRP: ₹35.00  | Disc: 15%    | GST: 12%   │
│                                                             │
│ Subtotal: ₹2,082.50  |  Tax (12%): ₹249.90  | Total: ₹2,332 │
│ [ SAVE & CONFIRM PURCHASE INWARD ]                          │
└─────────────────────────────────────────────────────────────┘
```

### Steps to Record an Inward Invoice
1. Navigate to **Purchases -> Inward Invoices** and click **Record Inward Purchase**.
2. Select the **Supplier** from the searchable directory.
3. Enter the **Supplier's Physical Invoice Number** and **Invoice Date**.
4. Add line items:
   - Select medicine from catalogue.
   - Enter **Batch Number** and **Expiry Date**.
   - Enter **Purchased Quantity** and any **Free Bonus Quantity**.
   - Enter **Purchase Rate** (net price before tax) and **MRP**.
   - Enter **Discount Percentage** (policy limit: maximum `20%`).
   - Select the applicable **GST Slab** (`5%`, `12%`, `18%`).
5. Verify the computed Subtotal, Taxable Amount, CGST, SGST, and Grand Total.
6. Click **Save & Confirm Purchase Inward**. Stock batches are immediately credited to the branch inventory.

---

## 10. Step 7: Purchase Indents (Branch Requisitions)

Branch Pharmacists can submit procurement requisitions to corporate administration using **Indents** (`/indents`).

```
┌─────────────────────────────────────────────────────────────┐
│ CREATE INDENT REQUISITION                                   │
│ Supplier (Optional): [ Micro Labs Ltd                    ] │
│ Required By Date:    [ 2026-11-15                        ] │
│ Instructions:        [ Emergency antibiotic restocking   ] │
│ Requested Items:                                            │
│ • Augmentin 625 mg  | Box  | Qty: 20 | Est Rate: ₹165.00    │
│ • Pantocid 40 mg    | Box  | Qty: 30 | Est Rate: ₹110.00    │
│ [ SUBMIT INDENT REQUISITION ]                               │
└─────────────────────────────────────────────────────────────┘
```

### Requisition Lifecycle
1. **DRAFT / SUBMITTED:** Created by branch staff.
2. **APPROVED / REJECTED:** Super Admin reviews quantities, adds review notes, and approves.
3. **CONVERTED TO PURCHASE:** Clicking **Convert to Purchase** on an approved indent automatically prefills the Inward Purchase Invoice form, eliminating re-typing.

---

## 11. Step 8: Inter-Branch Stock Transfers

Move medicines between company branches without purchasing new stock using **Transfers** (`/transfers`).

```
┌─────────────────────────────────────────────────────────────┐
│ INITIATE INTER-BRANCH STOCK TRANSFER                        │
│ Source Branch:      [ Vijayawada Central Branch          ] │
│ Destination Branch: [ Guntur Hospital Road Branch        ] │
│ Medicine:           [ Dolo 650 (MED-001)                 ] │
│ Batch Number:       [ DL-2026-X1 (Exp: 2028-12-31)       ] │
│ Transfer Quantity:  [ 25 Strips                          ] │
│ [ DISPATCH STOCK TRANSFER ]                                 │
└─────────────────────────────────────────────────────────────┘
```

### Two-Step Transfer Protocol
- **Step 1 (Dispatch):** Source branch clicks **Dispatch**. The stock quantity is deducted immediately from the source branch and marked `IN_TRANSIT` with a transfer ticket (`TRF-xxxxx`).
- **Step 2 (Receipt):** Destination branch inspects the delivered physical goods and clicks **Confirm Receipt**. The stock is added to the destination branch batch ledger. Double-receipt is strictly prevented.

---

## 12. Step 9: Inventory Management & FEFO Batch Expiry Tracking

The **Inventory** (`/inventory`) and **Stock Monitoring** (`/stock-monitoring`) pages give 360-degree visibility over branch stock levels and batch lifecycles.

### Understanding FEFO (First Expiry, First Out)
When selling a medicine at the counter, the system automatically routes the transaction to the batch with the **earliest expiry date**, provided it is active and not expired:
```
Batch A: Expiry Dec 2026  <-- SYSTEM ALLOCATES THIS FIRST
Batch B: Expiry June 2027
Batch C: Expiry Dec 2028
```

### Batch Status Lifecycle
- `ACTIVE`: Available for counter sale.
- `QUARANTINE`: Temporarily withheld for inspection or regulatory review. Cannot be sold.
- `BLOCKED`: Frozen by management. Cannot be sold.
- `EXPIRED`: Past expiration date. Automated safety locks reject sales.
- `DEPLETED`: Zero quantity remaining.

### Physical Stock Adjustments
If an audit reveals physical discrepancies (spillage, breakage, or recount adjustment):
1. In `/inventory`, click **Adjust Stock**.
2. Select Medicine and Batch Number.
3. Choose `CORRECTION_ADD` or `CORRECTION_SUBTRACT`.
4. Enter the delta quantity and mandatory reason (e.g., `Broken glass vial during shelving`).
5. An immutable `STOCK_CORRECTION` movement record is written to the audit trail.

---

## 13. Step 10: High-Speed Counter POS Billing

The **POS Billing** console (`/pos`) is engineered for rapid counter checkout with full keyboard accessibility.

```
┌───────────────────────────────────────────────────────────────────────────┐
│ [F2] Search: [ Dolo 650                                ] [Barcode Scan]   │
├───────────────────────────────────────────────────────────────────────────┤
│ Active Cart Items:                                                        │
│ 1. Dolo 650 (Paracetamol) | Batch: B-771 (Exp: 2028-12)                   │
│    Qty: [ 2 ] Strip | MRP: ₹35.00 | Disc: [ 5 ]% | GST: 12% | Total: ₹66.50 │
├──────────────────────────────────────────────────────────┬────────────────┤
│ Customer Name:  [ Rajesh Sharma                        ] │ Subtotal: ₹62.7│
│ Mobile Number:  [ 9876543210                           ] │ Tax:      ₹3.8 │
│ Doctor Name:    [ Dr. K. Rao (Reg: AP-4421)            ] │ Disc:     ₹3.5 │
│ Payment Mode:   (•) Cash   ( ) UPI   ( ) Card   ( ) Credit│ GRAND:   ₹67.0 │
│                                                          ├────────────────┤
│ [F8] COMPLETE SALE & PRINT RECEIPT                       │ [CLEAR CART]   │
└──────────────────────────────────────────────────────────┴────────────────┘
```

### Essential Keyboard Shortcuts
- `F2`: Focus the medicine search input.
- `ArrowDown` / `ArrowUp`: Navigate search results.
- `Enter`: Select medicine and add to cart.
- `Escape`: Clear active search or close modal.
- `F1`: Open on-screen keyboard help guide.
- `F8`: Complete sale and trigger print.

### Step-by-Step Counter Sale
1. Press `F2` or scan product barcode.
2. Select medicine from dropdown. The system automatically selects the earliest-expiring active batch via FEFO.
3. Select unit: choose **Box**, **Strip**, or **Tablet** (the price and stock conversion recalculate automatically).
4. Enter quantity.
5. Apply discount if applicable (policy limit: maximum `10%`).
6. If the medicine is `Schedule H`, `H1`, or `X`, enter the **Patient Name** and **Prescribing Doctor Name** with their **Council Registration Number**.
7. Select payment mode (`CASH`, `UPI`, `CARD`, `CREDIT`).
8. Press `F8` or click **Complete Sale**.

### Dual Receipt Printing
Upon completion, the **Receipt Modal** opens with two print formats:
- **Print 80mm Thermal Slip:** Formatted for ESC/POS counter receipt printers.
- **Print A4 Tax Invoice:** Full corporate GST tax invoice with doctor details, drug license numbers, HSN breakdown, and statutory pharmaceutical disclaimer.

---

## 14. Step 11: Sales Invoices Register & Returns

Access historical transactions and handle customer returns in **Invoices** (`/invoices`).

### Searching Past Bills
- Filter by invoice number (e.g., `INV-2026-00123`), customer phone, or date range.
- View itemized batch, tax, and discount details.
- Click **Reprint** at any time to re-issue thermal or A4 receipts.

### Processing a Customer Return / Cancellation
1. Locate the invoice and click **Cancel / Return**.
2. Select supervisor approval and enter return reason.
3. The invoice status updates to `CANCELLED`.
4. The dispensed stock batches are automatically replenished in base units, and a `CUSTOMER_RETURN` movement is written to the audit log.

---

## 15. Step 12: Financial Analytics & Profit & Loss Statement

The **Profit & Loss** console (`/profit-loss`) calculates real-time gross margins and net pharmacy profitability.

### Margin Equations
$$\text{Gross Profit} = \text{Net Sales Revenue} - \text{Cost of Goods Sold (COGS)}$$
$$\text{Net Operating Profit} = \text{Gross Profit} - \text{Operating Expenses}$$

### Features
- **Date Presets:** Quick filters for `Today`, `This Week`, `This Month`, `This Quarter`, `Financial Year`.
- **Expense Logging:** Log store operating costs under categories like `Rent`, `Electricity`, `Staff Salaries`, `Packaging`, and `Maintenance`.

---

## 16. Step 13: Management Reports & Regulatory Analytics

The **Reports Module** (`/reports`) provides compliance reports that can be exported to Excel and CSV:

1. **Daily Sales Register (DSR):** Detailed breakdown of sales by counter, cashier, payment tender, and tax slabs.
2. **Fast & Slow-Moving Medicines:** Identifies high-velocity inventory vs dead stock sitting past 90 days.
3. **Batch Expiry Forecast:** Forward-looking alert table segmenting stock into `Expired`, `< 30 Days`, `< 60 Days`, and `< 90 Days` expiry windows.
4. **Doctor Incentive & Prescription Tracker:** Tracks prescription volumes by doctor name and council registration number.

---

## 17. Step 14: Legal Compliance & Schedule H/H1 Narcotic Registers

The **Legal Compliance** portal (`/legal`) fulfills Indian statutory drug inspection requirements under the **Drugs and Cosmetics Rules**.

### Schedule H1 Digital Register
Every sale of Schedule H1 substances (e.g., third-generation cephalosporins, carbapenems, alprazolam) automatically logs:
- Date of Dispensing
- Patient Name & Complete Residential Address
- Prescribing Doctor's Name & Medical Council Registration Number
- Drug Brand, Generic Composition, Batch Number, and Quantity Dispensed
- Exportable to PDF/Excel during Drug Inspector audits.

---

## 18. Step 15: Immutable Security Audit Trail & System Configuration

### Immutable Security Audit Trail (`/audit-logs`)
Every state-changing event in Confidos Pharma writes an append-only log entry capturing the user ID, branch, IP address, and payload:
- `LOGIN_SUCCESS` / `LOGIN_FAILED`
- `SALE_CREATE` / `SALE_CANCEL`
- `STOCK_RECEIPT` / `STOCK_ADJUST`
- `BRANCH_TRANSFER_DISPATCH` / `BRANCH_TRANSFER_RECEIPT`
- `BULK_IMPORT_COMMITTED`
- `USER_CREATE` / `USER_DEACTIVATE`

### System Configuration Defaults (`Settings`)
Configurable in the top navigation bar settings modal:
- **Default Purchase Discount:** Default discount on inward invoices (e.g., `15.0%`).
- **Default CGST & SGST Rates:** Standard central/state GST percentages (default: `2.5%` each for 5% total).
- **Max POS Discount Limit:** Policy ceiling for cashiers (default: `10.0%`).
- **Near-Expiry Threshold:** Alert window in days (default: `60 days`).

---

## 19. Troubleshooting & Error Resolution Guide

| Error Message | Root Cause | Exact Resolution |
| :--- | :--- | :--- |
| **"Insufficient stock for [Medicine] (Batch: X). Requested: Y, Available: Z"** | Attempting to bill more quantity than currently available in the active branch batch. | Check stock level in `/inventory`. Adjust quantity or inward fresh stock via purchase invoice. |
| **"Discount percentage cannot exceed 10% policy limit."** | Cashier applied discount > 10% in POS billing. | Lower discount to <= 10.0%. Super Admin can raise ceiling in System Settings if required. |
| **"Purchase discount percentage cannot exceed 20% policy limit."** | Inward purchase invoice line discount entered > 20%. | Correct line discount to <= 20.0%. |
| **"This batch is expired and cannot be dispensed."** | Selected batch expiry date is in the past. | Expired stock is legally blocked. Transfer batch to quarantine in `/inventory` and initiate supplier return. |
| **"Target branch is required for imports"** | Uploading stock receipt CSV without selecting a branch. | In `/bulk-import`, select the receiving branch from the branch dropdown before uploading. |
| **"Duplicate column headers detected: X; Y"** | Uploaded CSV/Excel contains duplicate column names. | Open file in Excel, remove duplicate header columns, save and re-upload. |
| **"Cannot deactivate yourself"** | Administrator attempting to deactivate their own logged-in user account. | Have another Super Admin manage the account status. |
| **"Please provide a valid 15-character GSTIN"** | Entered GST number fails Indian GST regex validation. | Verify format: 2 digit state code + 10 char PAN + 1 entity num + 'Z' + 1 checksum (e.g., `37AAAAA1234A1Z5`). |

---

*Confidos Pharma Enterprise OS is maintained by the Engineering and Compliance Teams. For technical support, contact `support@confidospharma.com`.*
