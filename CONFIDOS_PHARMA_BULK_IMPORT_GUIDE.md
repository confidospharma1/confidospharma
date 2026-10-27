# Confidos Pharma — Bulk Data Import Guide
**Comprehensive Operational, Technical, and File Format Specification**

---

## 1. Overview of the Two Import Workflows

Confidos Pharma provides an enterprise-grade, deterministic, two-stage Bulk Import system designed to import large datasets without direct unvalidated writes to live inventory.

The application strictly separates bulk operations into two distinct workflows:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       WORKFLOW SELECTION (PRD §7.2)                         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
┌───────────────────────────────┐             ┌───────────────────────────────┐
│ TYPE A: MEDICINE CATALOGUE    │             │ TYPE B: STOCK RECEIPT         │
│ (Master Medicine Definitions) │             │ (Incoming Branch Inventory)   │
├───────────────────────────────┤             ├───────────────────────────────┤
│ • Creates/updates medicines   │             │ • Inwards batches to branch   │
│ • Master catalogue record     │             │ • Requires catalogue match    │
│ • DOES NOT increase stock     │             │ • INCREASES live branch stock │
│ • Company-wide master data    │             │ • Creates StockMovement audit │
└───────────────────────────────┘             └───────────────────────────────┘
```

### Type A: Medicine Catalogue Import
- **Purpose**: Populates and maintains central master medicine catalogue entries (`MedicineProduct` records).
- **Scope**: Company-wide product definitions (Brand Name, Generic Name, Strength, Dosage Form, Manufacturer, HSN, Tax Rate, MRP).
- **Inventory Effect**: **None**. It does **not** create stock batches or increase physical quantities.
- **Execution Order**: **Must be executed first** before stock batches can be received.

### Type B: Stock Receipt Import
- **Purpose**: Records incoming stock deliveries for a designated pharmacy branch (`StockBatch` and `StockMovement` records).
- **Scope**: Branch-specific batch inwarding (Batch Number, Expiry Date, Quantity Received, Purchase Acquisition Rate, MRP).
- **Inventory Effect**: **Increases available inventory** for the target branch upon commit and writes permanent FEFO-compliant stock movement ledger entries (`PURCHASE_RECEIPT`).
- **Execution Order**: **Must be executed second** after catalogue records are established.

---

## 2. Supported File Formats & Technical Restrictions

| Format | Extension | MIME Types | Status | Parser Engine |
| :--- | :--- | :--- | :--- | :--- |
| **Comma-Separated Values** | `.csv` | `text/csv`, `application/vnd.ms-excel` | **Fully Supported** | SheetJS (`xlsx`) buffer stream |
| **Excel Workbook** | `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | **Fully Supported** | SheetJS (`xlsx`) with `cellDates` |
| **Legacy Excel** | `.xls` | `application/vnd.ms-excel` | **Fully Supported** | SheetJS (`xlsx`) binary parser |

### Critical Technical Rules:
1. **Header Row**: The first row of the first worksheet must contain the column headers.
2. **Sheet Selection**: The parser inspects the **first worksheet** (`workbook.SheetNames[0]`). Secondary sheets are ignored.
3. **Empty Rows**: Completely blank rows are automatically filtered out.
4. **Encoding & BOM**: UTF-8 with or without Byte-Order-Mark (`\uFEFF`) is supported. Leading/trailing whitespace in headers is trimmed.
5. **Formulas & Macros**: Dynamic formulas and VBA macros are stripped for security. Plain values are extracted.
6. **Maximum File Size**: 10 MB per upload.

---

## 3. Type A: Medicine Catalogue CSV Specification

### Complete Column Specification Table

| CSV Header (Canonical) | Internal Field | Required? | Data Type | Example Value | Validation Rules & Accepted Aliases |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Brand Name** | `brandName` | **YES** | String | `Telma 20` | Mandatory trade name. Min 1 char. Aliases: `brand_name`, `brandName`, `brand`, `medicine_name`, `medicineName`, `product_name`, `item_name`. |
| **Generic Name** | `genericName` | **YES** | String | `Telmisartan` | Mandatory active salt/composition. Aliases: `generic_name`, `genericName`, `generic`, `salt`, `composition`, `active ingredient`. |
| **Strength** | `strength` | **YES** | String | `20 mg` | Mandatory dosage strength. Aliases: `potency`, `dosage`, `dose`. |
| **Dosage Form** | `dosageForm` | No | String | `Tablet` | Defaults to `Tablet`. Allowed: `Tablet`, `Capsule`, `Syrup`, `Injection`, `Ointment`, `Drops`, `Powder`, `Inhaler`. Aliases: `form`, `type`, `dosage_form`. |
| **Manufacturer** | `manufacturer` | No | String | `Glenmark` | Defaults to `Standard Pharma`. Manufacturer or marketing company. Aliases: `mfg`, `company`, `brand owner`, `make`. |
| **Pack Size** | `packSize` | No | String | `15 Tablets` | Defaults to `10 Tablets`. Packaging description. Aliases: `pack_size`, `packsize`, `pack`, `packaging`. |
| **HSN Code** | `hsnCode` | No | String | `30049099` | 4 to 8 digit Indian GST HSN code. Nullable. Aliases: `hsn_code`, `hsncode`, `hsn`. |
| **GST Rate** | `gstRate` | No | Float (%) | `12` | GST % rate. Defaults to `12`. Must be `>= 0` (typically 0, 5, 12, 18, 28). Aliases: `gst_rate`, `gstRate`, `gst`, `tax rate`. |
| **MRP** | `mrp` | **YES** | Float (₹) | `98.00` | Maximum Retail Price. Must be a valid positive number `> 0`. Currency symbols (`₹`, `$`) stripped automatically. Aliases: `retail_price`, `selling_price`, `price`. |
| **Default Purchase Rate** | `defaultPurchaseRate` | No | Float (₹) | `65.50` | Default cost rate. Optional. Aliases: `purchaseRate`, `purchase_rate`, `cost_price`, `rate`. |
| **Default Selling Rate** | `defaultSellingRate` | No | Float (₹) | `98.00` | Default selling rate. Optional. Defaults to MRP if omitted. Aliases: `sellingRate`, `selling_rate`. |
| **Reorder Level** | `reorderLevel` | No | Integer | `10` | Low-stock threshold for alerts. Defaults to `10`. Aliases: `reorder_level`, `min_stock`. |
| **Barcode** | `barcode` | No | String | `8901117009999` | EAN-13, UPC, or Code128 string. Optional. Aliases: `upc`, `ean`, `code128`. |
| **Prescription Type** | `prescriptionType` | No | String | `Schedule H` | Defaults to `Schedule H`. Allowed: `Schedule H`, `Schedule H1`, `Schedule X`, `OTC`, `General`. Aliases: `schedule`, `rx type`. |

---

## 4. Type B: Stock Receipt CSV Specification

### Complete Column Specification Table

| CSV Header (Canonical) | Internal Field | Required? | Data Type | Example Value | Validation Rules & Accepted Aliases |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Internal Code** | `internalCode` | Conditional | String | `MED-0001` | Medicine product code. Either `Internal Code` OR `Brand Name` is required. Aliases: `internal_code`, `code`, `product_code`, `sku`. |
| **Brand Name** | `brandName` | Conditional | String | `Dolo 650` | Medicine brand name. Used to match existing catalogue record if `Internal Code` is omitted. Aliases: `brand_name`, `brand`, `medicine_name`, `product_name`. |
| **Batch Number** | `batchNumber` | **YES** | String | `DL-2026-X1` | Manufacturer batch or lot identifier. Cannot be empty. Aliases: `batch_number`, `batch`, `batch_no`, `lot`. |
| **Expiry Date** | `expiryDate` | **YES** | Date | `2027-12-31` | Expiry date. Supported: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `MM/YYYY`. **Must not be in the past**. Aliases: `expiry_date`, `expiry`, `exp_date`. |
| **Quantity** | `quantity` | **YES** | Integer | `50` | Quantity received. Must be an integer `> 0`. Aliases: `qty`, `units`, `received_qty`. |
| **Purchase Rate** | `purchaseRate` | **YES** | Float (₹) | `23.50` | Unit purchase cost before tax. Must be `>= 0`. Aliases: `purchase_rate`, `cost_price`, `unit_cost`, `rate`. |
| **MRP** | `mrp` | **YES** | Float (₹) | `33.50` | Unit Maximum Retail Price. **Must be `>= Purchase Rate`**. Aliases: `maximum retail price`, `retail_price`, `price`. |

---

## 5. Header Normalization & Disambiguation Engine

The application includes a deterministic header normalization and mapping engine (`imports.mapper.ts`):

1. **BOM & Whitespace Stripping**:
   Leading UTF-8 BOM (`\uFEFF`) and whitespace are stripped from headers automatically.
2. **Case & Format Independence**:
   Headers are converted to lowercase and hyphens/underscores are unified into single spaces (`BRAND_NAME` $\rightarrow$ `brand name`).
3. **Duplicate Header Protection**:
   If an uploaded file contains duplicate columns (e.g., both `MRP` and `mrp`, or duplicate `Quantity`), the upload is rejected with HTTP 400 with a detailed error listing conflicting columns.
4. **Disambiguation for Multi-Column Files**:
   When an uploaded file contains both `medicine_name` and `brand` (common in pharmaceutical supplier extracts):
   - `medicine_name` is mapped to `brandName` (the trade formulation name, e.g. `Paracetamol 500 mg Tablet`).
   - `brand` is mapped to `manufacturer` (the manufacturing company, e.g. `Demo Pharma`).
   - If only `brand` is provided without `medicine_name`, `brand` maps to `brandName`.

---

## 6. Root Cause Analysis of Reported Defects

### Failure 1: "Brand Name is required"
- **Symptom**: Preview displayed Generic Name and MRP populated, but rows failed with `Brand Name is required`.
- **Root Cause**:
  1. The user's uploaded CSV (`confidos_pharma_dummy_stock_receipt.csv`) used snake_case headers: `medicine_name,brand,generic_name,strength,batch_number,expiry_date,quantity,purchase_rate,mrp,hsn,supplier_name,invoice_number`.
  2. The original controller inspected only `row['Brand Name'] || row['brandName'] || row['brand_name']`.
  3. The column was named `brand` (and `medicine_name`), neither of which was checked.
  4. Hence `brandName` was evaluated as `""`, triggering `if (!brandName) errors.push('Brand Name is required')`.
  5. Meanwhile, `generic_name` matched `row['generic_name']` and `mrp` matched `row['mrp']`, which is why those columns rendered populated in the table while the status failed.
- **Resolution**: Implemented `imports.mapper.ts` to normalize headers and map `brand`, `medicine_name`, `Brand Name`, and associated aliases.

### Failure 2: HTTP 500 on `/imports/upload`
- **Symptom**: Browser console showed HTTP 500 Internal Server Errors when uploading.
- **Root Cause**:
  1. In `STOCK_RECEIPT` import, the original code read `row['Expiry Date'] || row['expiryDate'] || row['expiry']`.
  2. When an upload used `expiry_date` (snake_case) or had an invalid date string, `expiryDateStr` evaluated to `""`.
  3. `new Date("")` produced an `Invalid Date` object.
  4. At line 179: `expiryDate: parsedDate.toISOString ? parsedDate.toISOString() : expiryDateStr`.
  5. In JavaScript, `parsedDate.toISOString` is a function on `Date.prototype`. Invoking `.toISOString()` on an `Invalid Date` throws `RangeError: Invalid time value`.
  6. This unhandled exception crashed the handler, causing the catch block to return `HTTP 500: Invalid time value`.
- **Resolution**: Created `parseExpiryDate()`, an exception-free parser that supports `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `MM/YYYY`, and Excel dates, returning structured validation messages instead of throwing.

### Failure 3: 401 Unauthorized on Template Downloads
- **Symptom**: Clicking "Catalogue Template (CSV)" or "Stock Receipt Template (CSV)" failed in browser tabs.
- **Root Cause**:
  1. In `imports.routes.ts`, `router.get('/template/:type', downloadTemplate)` was mounted after `router.use(authenticate)`.
  2. Frontend executed `window.open('/api/imports/template/...', '_blank')`, which cannot pass `Authorization: Bearer` headers.
  3. Deployed URLs on Vercel hardcoded `/api/imports/...` instead of the Render backend URL.
- **Resolution**: Moved the template download route above authentication in `imports.routes.ts`, updated `auth.middleware.ts` to accept query token fallbacks, and updated `BulkImportPage.tsx` to use `api.downloadTemplateUrl()`.

---

## 7. Step-by-Step User Operational Workflow

```
[ Step 1: Download Official Template ]
              │
              ▼
[ Step 2: Prepare & Validate Data ]
              │
              ▼
[ Step 3: Run Type A (Catalogue Import) ] ──► [ Commit to Master DB ]
              │
              ▼
[ Step 4: Run Type B (Stock Receipt Import) ] ──► [ Commit to Branch Stock ]
              │
              ▼
[ Step 5: Verify in Inventory & POS Billing ]
```

### Step 1: Obtain the Official Template
1. Navigate to **Bulk Import** in the Confidos Pharma navigation sidebar.
2. In the top-right corner, click:
   - **Catalogue Template (CSV)** for master medicine creation.
   - **Stock Receipt Template (CSV)** for stock inwarding.
3. The CSV template downloads immediately to your computer.

### Step 2: Prepare the Spreadsheet Data
1. Open the template in Microsoft Excel, Google Sheets, or LibreOffice Calc.
2. Fill in your records:
   - Keep the original header row untouched.
   - For Catalogue: Enter `Brand Name`, `Generic Name`, `Strength`, `MRP`, and `GST Rate`.
   - For Stock Receipt: Ensure every medicine exists in the catalogue. Enter valid future expiry dates (`YYYY-MM-DD` or `DD/MM/YYYY`) and positive quantities.
3. Save or Export the file as **CSV (Comma Delimited)** or **Excel (.xlsx)**.

### Step 3: Select Import Type & Branch
1. On the Bulk Import screen, verify the currently active branch in the header (e.g. `Vijayawada (Main)`).
2. Choose the workflow:
   - **Type A: Medicine Catalogue Import** (when adding new medicines).
   - **Type B: Stock Receipt Import** (when receiving physical stock at this branch).

### Step 4: Upload, Parse & Staging Preview
1. Drag and drop your file onto the upload zone, or click **Choose Spreadsheet File**.
2. Click **Parse & Generate Staging Preview**.
3. The server validates the file deterministically and creates a staged job (`ImportJob` in `STAGED` status).
4. Review the Summary Metrics:
   - **Total Rows**: Total records in the file.
   - **Valid Rows**: Records passing all validations (ready to commit).
   - **Error Rows**: Records failing validation (will be excluded if committed).
   - **Duplicates**: Duplicate rows detected in the upload.
   - **Warnings**: Existing catalogue medicines or non-blocking notes.

### Step 5: Correct Errors & Re-upload
1. If **Error Rows > 0**:
   - Click **Download Error Rows (CSV)**.
   - The downloaded CSV details the row number, item name, and specific error message.
   - Correct the issues in your original spreadsheet.
   - Re-upload the corrected file. (Each upload creates a clean, independent staging session).

### Step 6: Authorize & Commit
1. When **Valid Rows > 0**, the **Authorize & Commit** button becomes active.
2. Click **Authorize & Commit ({N} Rows)**.
3. The backend executes a Prisma interactive transaction:
   - For Catalogue: Inserts new `MedicineProduct` records with generated `MED-XXXX` codes, or updates existing master records.
   - For Stock Receipt: Inserts or updates `StockBatch` records and writes `StockMovement` ledger entries.
   - Marks `ImportJob.status = 'COMMITTED'`.
   - Records an immutable audit event (`BULK_IMPORT_COMMITTED`).
4. A green confirmation banner confirms the commit count.

### Step 7: Verify Results
1. For Catalogue Imports: Go to **Medicine Catalogue** and search for the newly imported brands.
2. For Stock Receipt Imports: Go to **Inventory Batches** or **Stock Ledger**. Confirm that the batch number, expiry date, available quantity, and purchase rate match the imported file.

---

## 8. Sample CSV Files

### Sample 1: Type A — Medicine Catalogue Import (`samples/confidos_valid_catalogue_sample.csv`)

```csv
Brand Name,Generic Name,Strength,Dosage Form,Manufacturer,Pack Size,HSN Code,GST Rate,MRP,Default Purchase Rate,Default Selling Rate,Reorder Level,Barcode,Prescription Type
Amoxikem 500,Amoxicillin,500 mg,Capsule,Alkem Laboratories,10 Capsules,30041010,12,85.00,52.50,85.00,15,8901234567011,Schedule H
Pantocid 40,Pantoprazole,40 mg,Tablet,Sun Pharma,15 Tablets,30049099,12,145.00,95.00,145.00,20,8901234567028,Schedule H
Azithral 500,Azithromycin,500 mg,Tablet,Alembic Pharmaceuticals,5 Tablets,30042099,12,120.00,80.00,120.00,10,8901234567035,Schedule H
Glycomet 500,Metformin Hydrochloride,500 mg,Tablet,USV Private Ltd,20 Tablets,30049099,12,48.00,30.00,48.00,25,8901234567042,Schedule H
Benadryl Cough Syrup,Diphenhydramine Compound,100 ml,Syrup,Johnson & Johnson,1 Bottle,30049099,12,130.00,88.00,130.00,10,8901234567059,OTC
```

### Sample 2: Type B — Stock Receipt Import (`samples/confidos_valid_stock_receipt_sample.csv`)

```csv
Brand Name,Batch Number,Expiry Date,Quantity,Purchase Rate,MRP
Amoxikem 500,AMX-2027-B1,2027-11-30,100,52.50,85.00
Pantocid 40,PNT-2028-A4,2028-05-31,150,95.00,145.00
Azithral 500,AZT-2027-C9,2027-12-31,80,80.00,120.00
Glycomet 500,GLY-2028-D2,2028-08-31,200,30.00,48.00
Benadryl Cough Syrup,BND-2027-K3,2027-09-30,50,88.00,130.00
```

### Sample 3: Validation Error Demonstration (`samples/confidos_invalid_sample_for_testing.csv`)

```csv
Brand Name,Generic Name,Strength,Dosage Form,Manufacturer,Pack Size,HSN Code,GST Rate,MRP,Default Purchase Rate
,Paracetamol,500 mg,Tablet,Pharma Corp,10 Tablets,30049099,12,25.00,15.00
Dolo 650,,650 mg,Tablet,Micro Labs,15 Tablets,30049099,12,33.50,23.50
Crocin Advance,Paracetamol,,Tablet,GSK,15 Tablets,30049099,12,30.00,20.00
Calpol 500,Paracetamol,500 mg,Tablet,GSK,15 Tablets,30049099,-5,30.00,20.00
Metacin 500,Paracetamol,500 mg,Tablet,Themis,10 Tablets,30049099,12,-10.00,15.00
```

---

## 9. Verification & Safety Checklist

- [x] **Branch Isolation**: Stock receipt commits attach strictly to the selected `targetBranchId` and never cross branch boundaries.
- [x] **FEFO Stock Integrity**: Expiry dates are indexed in `StockBatch` for deterministic First-Expiry, First-Out POS dispensing.
- [x] **Transaction Atomicity**: Commits execute inside a database transaction (`prisma.$transaction`). If any database write fails, all changes roll back.
- [x] **Idempotency**: Committed jobs (`status === 'COMMITTED'`) cannot be recommitted.
- [x] **Audit Trail**: Every staging event (`BULK_IMPORT_STAGED`) and commit event (`BULK_IMPORT_COMMITTED`) records the user ID, branch ID, IP address, and record counts in the `AuditEvent` table.
- [x] **No Role Escalation**: Billing users (`BILLING_USER`) are strictly blocked from uploading or committing bulk imports.
