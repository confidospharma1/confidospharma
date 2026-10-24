# Confidos Pharma

## Product Requirements Document (PRD), Technical Plan, Security Rules and Launch Checklist

**Document status:** Working specification for planning and
implementation\
**Product:** Confidos Pharma\
**Initial market:** India\
**Initial operating model:** Pharmacy inventory and billing for physical
branches\
**Initial branches:** Vijayawada, Guntur and Tenali (planned; branch
list must be configurable)\
**Primary users:** Super Admin, Branch Admin and Billing User\
**Language style:** Clear, simple English\
**Design style:** Minimal, calm, high contrast, accessible and fast\
**Build approach:** Free/open-source tools first; confirm hosting,
service limits and legal costs before launch

> **Important:** This document is a product and engineering plan, not
> legal, tax, pharmacy or security certification. Before real business
> use, Confidos Pharma must confirm current Indian laws, tax rules,
> pharmacy licences, record-retention duties and the rules that apply to
> each medicine category with qualified professionals. The system must
> not claim to be legally compliant until it has been reviewed and
> tested.

------------------------------------------------------------------------

# 1. Product Overview

Confidos Pharma is a web application for managing stock, purchases,
medicine batches, expiry dates, billing, users and reports across
several pharmacy branches.

The company will use one central system. Each branch will have its own
stock, purchases, bills, users and daily work records. The Super Admin
can see company-wide information. A Branch Admin can manage the branch
assigned to them. Billing Users can create bills but cannot manage
products, stock settings, users or security settings.

The application should work well on normal desktop and laptop computers
used at pharmacy counters. It should also work on tablets where
practical. The first release is an online-first system. Offline billing
is not included unless it is approved as a separate feature.

## 1.1 Main goals

-   Keep stock separate for every branch.
-   Make medicine search and billing fast.
-   Track each medicine batch, expiry date and quantity.
-   Reduce mistakes in stock entry and billing.
-   Support manual product entry and barcode scanning.
-   Import large product and stock files with a review step.
-   Keep clear records of important actions.
-   Protect business and personal data.
-   Use clear, simple screens that staff can learn quickly.
-   Keep the system affordable by using free and open-source tools where
    suitable.
-   Make it possible to add more branches without rebuilding the core
    system.

## 1.2 What success looks like

-   A cashier can find a medicine by typing its name.
-   A cashier can use a barcode scanner where a barcode is available.
-   A bill cannot sell more stock than the branch has available.
-   An expired or blocked batch cannot be sold.
-   A branch user cannot access another branch's data.
-   An admin can add or edit product data with a clear audit record.
-   A large file can be checked before any live stock is changed.
-   A failed import can be reviewed and safely retried.
-   Reports show branch totals and company totals without mixing the
    actual stock records.
-   Users can read the screens, use the keyboard and understand errors.
-   Backups can be restored and the restore process has been tested.

## 1.3 Product boundaries

### Included in the first planned release

-   Public information pages and legal pages.
-   Login and account management.
-   Company and branch setup.
-   Role and branch permissions.
-   Medicine catalogue.
-   Batch and expiry tracking.
-   Suppliers and purchase records.
-   Manual stock receipt.
-   Excel, CSV and supported PDF import.
-   Image/scanned-document OCR as a later or carefully scoped import
    feature.
-   Barcode search and text search.
-   Billing, invoice printing and payment recording.
-   Returns, cancellations and stock adjustments with permissions.
-   Reports and exports.
-   Audit logs.
-   Privacy and security controls.
-   Accessibility and responsive layout.
-   Backups, monitoring and release checks.

### Not included unless approved later

-   Online medicine sales to consumers.
-   Medicine delivery and courier tracking.
-   Patient medical records.
-   Prescription storage beyond a verified business and legal need.
-   Advertising and tracking pixels.
-   Loyalty points and marketing profiles.
-   Public product reviews.
-   AI/LLM-based document extraction.
-   Microservices.
-   Offline billing and automatic synchronization.
-   Native mobile apps.
-   Paid third-party services that have not been approved.
-   Automatic stock sharing between branches.

------------------------------------------------------------------------

# 2. People and Roles

## 2.1 Super Admin

The Super Admin is the highest-level account for the company or head
office.

### Allowed actions

-   Create, edit, disable and manage branches.
-   Create and manage Branch Admin and Billing User accounts.
-   Reset access through a secure process.
-   Assign users to branches.
-   View company-wide sales, stock, purchase and activity reports.
-   View each branch's stock separately.
-   View consolidated totals without changing branch stock
    automatically.
-   Create, edit and deactivate medicine catalogue entries.
-   Correct product data and manage common catalogue settings.
-   Set company-wide rules and approved defaults.
-   Review and approve high-risk actions.
-   Review audit logs and security events.
-   Manage permitted system settings.
-   Manage data export permissions.
-   Review failed imports and their history.
-   Authorize branch transfers where company policy requires it.
-   Manage invoice correction and cancellation permissions.
-   View system health and import status.
-   Initiate user suspension or account recovery.
-   Manage privacy requests and records, subject to legal retention
    duties.

### Restricted or controlled actions

-   A Super Admin must not silently erase financial history.
-   A Super Admin must not edit a completed invoice in a way that hides
    the original values.
-   A Super Admin must not bypass audit records.
-   Destructive actions must require clear confirmation and, for
    high-risk actions, a reason.
-   The first Super Admin account must be created through a secure setup
    process, not a public sign-up page.
-   High-risk actions should require re-authentication and multi-factor
    authentication when available.

## 2.2 Branch Admin

Each branch has its own Branch Admin account or accounts. A Branch Admin
is similar to the Super Admin for day-to-day work, but their access is
limited to the assigned branch.

### Allowed actions within their branch

-   View and manage branch stock.
-   Add, edit and deactivate medicine records when permitted.
-   Record supplier and purchase details.
-   Receive stock and create batch records.
-   Edit branch-specific purchase and selling-price data within company
    rules.
-   Import product or stock files into the assigned branch.
-   Review import results and confirm permitted imports.
-   View branch sales, stock, expiry and purchase reports.
-   Manage Billing Users assigned to their branch if the Super Admin
    grants this ability.
-   Correct stock through approved adjustment workflows.
-   Record returns and damaged stock.
-   Request or process branch transfers according to company rules.
-   Print and export permitted branch reports.
-   View branch audit history.

### Not allowed

-   View another branch's detailed data unless the Super Admin grants
    explicit access.
-   Create or change the Super Admin.
-   Change company-wide security rules.
-   Change another branch's stock.
-   Remove audit history.
-   Bypass stock, expiry, invoice or approval checks.
-   Delete completed bills or purchase records without a controlled
    reversal process.

## 2.3 Billing User

Billing Users work at a pharmacy counter. They should have a simple,
fast screen.

### Allowed actions

-   Sign in and sign out.
-   Search medicines by name, brand, strength, form, pack or barcode.
-   View the stock and prices they are allowed to see in their branch.
-   Add items to a draft bill.
-   Change quantity within available stock and policy limits.
-   Apply only approved discounts.
-   Select an available eligible batch when the workflow requires it.
-   Record payment using supported payment types.
-   Complete a bill.
-   Print or reprint a bill according to permissions.
-   View their permitted recent bills.
-   Perform a permitted return or cancellation request if company policy
    allows it.

### Not allowed

-   Add or edit medicine catalogue data.
-   Change MRP, purchase rate, GST configuration or company pricing
    rules.
-   Upload stock files.
-   Add or adjust inventory directly.
-   Create users or change roles.
-   View another branch's data.
-   Delete or edit a completed bill without a controlled, audited
    workflow.
-   Change security or system settings.
-   Export large customer or financial datasets unless explicitly
    allowed.

## 2.4 Permission rules

-   Access must be checked on the server for every protected API action.
-   Hiding a button in the frontend is not a security control.
-   The backend must determine the user's allowed branch from their
    authenticated session and permissions.
-   Never trust a branch ID sent by the browser without checking it.
-   Use least privilege: users get only the access they need.
-   Role changes, account disablement and branch assignment changes must
    be logged.
-   A disabled user must lose access promptly.
-   Shared accounts are not allowed. Each person must use their own
    account.
-   Test every role against both allowed and denied actions.

## 2.5 Initial account count

For three branches, the planned structure is:

-   One Super Admin.
-   One Branch Admin for each branch.
-   Two Billing Users for each branch.

Total: **10 accounts**. The system must allow more branches and users
later without code changes.

------------------------------------------------------------------------

# 3. Branch and Stock Rules

## 3.1 Separate branch stock

Each branch must have independent stock records.

Example:

-   Vijayawada: 100 strips of a medicine.
-   Guntur: 35 strips of the same medicine.
-   Tenali: 0 strips of the same medicine.

The company report may show a total of 135 strips, but the stock records
must remain separate. A Guntur cashier must not sell from Vijayawada's
stock.

## 3.2 Shared medicine catalogue, separate stock

The company may use a shared medicine catalogue so that the same
medicine does not need to be created separately at every branch.
However, the stock, batch, purchase history, quantity and branch
transactions must be stored separately.

A branch may need a local price or supplier detail. The data model must
clearly distinguish common product details from branch-specific details.

## 3.3 Branch transfers

Transfers must be explicit. They must not happen automatically.

A transfer should have:

-   Transfer ID.
-   Source branch.
-   Destination branch.
-   Medicine and batch.
-   Quantity.
-   Requesting user.
-   Approving user, where required.
-   Dispatch date and time.
-   Receipt date and time.
-   Status: draft, requested, approved, dispatched, partially received,
    received, rejected or cancelled.
-   Reason and notes.
-   Audit records.

Stock must not be available at the destination until the transfer is
received under the approved workflow. The system must prevent the same
transfer from being received twice.

## 3.4 Stock balance and stock movement

Do not store only one editable quantity field without history.

Keep a stock movement record for each event, such as:

-   Purchase receipt.
-   Sale.
-   Customer return.
-   Supplier return.
-   Damage or expiry.
-   Stock correction.
-   Transfer out.
-   Transfer in.
-   Recall or quarantine.
-   Approved opening balance.

Each movement should include the branch, medicine, batch, quantity
change, time, user, reason and related document. Corrections must create
a new movement; they must not erase the original event.

## 3.5 Concurrent stock use

Two billing counters may try to sell the last unit at the same time.

The backend and database must prevent both bills from successfully
selling the same unit. Use a transaction, a safe stock update or row
locking, and clear handling of conflicts.

The frontend's displayed quantity is only a view. The database-backed
backend operation is the final authority.

------------------------------------------------------------------------

# 4. Medicine Catalogue

## 4.1 Product fields

The product model should support, where applicable:

-   Internal medicine ID.
-   Brand name.
-   Generic or active ingredient name.
-   Strength.
-   Dosage form.
-   Manufacturer.
-   Pack size.
-   Base unit and pack conversion.
-   HSN code.
-   Applicable GST configuration.
-   MRP.
-   Barcode or product code, if available.
-   Prescription or sale restriction category where legally relevant.
-   Storage notes where required.
-   Active/inactive status.
-   Created and updated timestamps.
-   Created by and updated by.
-   Source of the data, such as manual entry or import.

Do not assume all fields are available for every supplier file. Required
fields depend on the operation. A catalogue entry may not have a batch,
while a stock receipt normally needs batch and expiry details when
applicable.

## 4.2 Manual product entry

Manual entry is mandatory.

The form must:

-   Show clear field labels.
-   Mark required fields.
-   Validate strength, pack size, tax data and prices.
-   Check for likely duplicates before saving.
-   Explain why a record cannot be saved.
-   Keep unsaved data if validation fails.
-   Show a clear success message after saving.
-   Record the user and time of important changes.

Do not use a product image as a required field. Text-based product
records are enough for the main workflow.

## 4.3 Duplicate medicine handling

Do not treat two medicines as the same only because their names look
similar.

Compare appropriate fields such as:

-   Brand or product name.
-   Ingredient.
-   Strength.
-   Dosage form.
-   Pack size.
-   Manufacturer.
-   Product code or barcode, when reliable.

The system may suggest a possible match, but uncertain matches must be
reviewed by an authorized user. Never merge products silently.

## 4.4 Medicine search

Search should support:

-   Brand name.
-   Generic name.
-   Common spelling variations where safe.
-   Strength.
-   Dosage form.
-   Manufacturer.
-   Barcode or product code.
-   Pack size.

Search results should show enough detail to prevent selecting the wrong
strength or pack. Do not depend on images.

Use database indexes and measure search speed. Do not add a separate
search engine until real data and tests show it is needed.

------------------------------------------------------------------------

# 5. Batch, Expiry and Pharmacy Safety

## 5.1 Batch record

A batch stock record should include:

-   Branch ID.
-   Medicine ID.
-   Batch number.
-   Expiry date or the source format needed to interpret it.
-   Quantity received.
-   Current available quantity.
-   Purchase rate.
-   MRP and selling-price data as applicable.
-   Supplier.
-   Purchase invoice reference.
-   Receipt date.
-   Stock status.
-   Created by and time.

The model must allow the same medicine to have several batches in the
same branch.

## 5.2 Expiry rules

-   Do not allow expired stock to be sold.
-   Warn staff about stock approaching expiry.
-   Support expiry reports by branch, medicine and batch.
-   Support quarantine of expired, damaged, recalled or otherwise
    blocked stock.
-   Keep blocked stock separate from saleable stock.
-   Do not silently remove expired quantities; record a controlled
    adjustment or return.
-   Test how the source data represents expiry dates. Do not guess an
    unclear date.

## 5.3 FEFO

Use **First Expiry, First Out (FEFO)** as the default batch selection
rule: choose the eligible batch with the earliest expiry date first.

The user must be able to see the selected batch when needed. If a batch
is expired, blocked, recalled or unavailable, it must not be selected
for sale.

Any exception to FEFO must be controlled and recorded.

## 5.4 Returns, damaged stock and recalls

The application must support the correct workflow for:

-   Customer returns.
-   Supplier returns.
-   Damaged stock.
-   Expired stock.
-   Recalled stock.
-   Wrongly received goods.
-   Stock count differences.

A returned item must not automatically become saleable. It must go
through the correct inspection and status process.

Rules for prescription medicines, restricted medicines and returns must
be reviewed against current laws and the actual pharmacy licence and
operations.

------------------------------------------------------------------------

# 6. Purchase and Stock Receiving

## 6.1 Normal receiving process

1.  Supplier sends the goods and purchase document.
2.  Staff opens a purchase receipt for the correct branch.
3.  Staff checks supplier, invoice number and date.
4.  Staff checks medicine name, strength, form and pack.
5.  Staff checks quantity, batch and expiry where applicable.
6.  Staff checks purchase rate, MRP, discount and tax data.
7.  Staff records any mismatch, damage or missing goods.
8.  Authorized staff confirm the receipt.
9.  The system posts approved stock movements.
10. The system records the user, time and source document.

## 6.2 Purchase records

A purchase record should support:

-   Supplier identity.
-   Supplier invoice number and date.
-   Branch.
-   Product lines.
-   Batch and expiry where applicable.
-   Ordered, received, rejected and accepted quantities.
-   Purchase price and discount.
-   Applicable tax details.
-   Total amount.
-   Document attachment or file reference.
-   Receipt status.
-   User and audit details.

The system must detect likely duplicate supplier invoices using supplier
identity, invoice number and other relevant fields. A duplicate must be
flagged for review, not silently added again.

## 6.3 Supplier management

Support supplier name, contact and address details needed for business
use, tax identifiers where applicable, account status and purchase
history. Do not collect extra personal data about supplier staff without
a clear need.

------------------------------------------------------------------------

# 7. Bulk Import System

Bulk import is a core feature. A large upload must never go directly
into live stock without validation and approval.

## 7.1 Supported formats

Priority order:

1.  `.xlsx`
2.  `.csv`
3.  `.xls` where support is practical
4.  Digital `.pdf` purchase invoices and stock statements
5.  Scanned PDFs and `.jpg`, `.jpeg`, `.png` images using OCR where
    supported
6.  Structured `.xml` only when a real supplier or source format needs
    it

A format must be listed as supported only after it has tests and clear
error handling.

## 7.2 Two separate import types

### A. Catalogue import

Adds or updates medicine master data. It does not add stock just because
a product row exists.

### B. Stock receipt import

Records actual incoming goods for a branch. It must contain or obtain
the information needed to create valid receipt and batch records.

Do not mix the two processes.

## 7.3 Import stages

1.  User chooses the target branch and import type.
2.  User uploads a file.
3.  The server checks file type, size, permissions and content.
4.  The original file is stored safely.
5.  A background job reads the file in chunks.
6.  The parser extracts rows and maps columns.
7.  The validator checks required fields and business rules.
8.  The system identifies likely duplicates and uncertain matches.
9.  The user reviews the preview.
10. The user fixes, excludes or accepts rows.
11. The system revalidates the data.
12. An authorized user confirms the import.
13. The backend writes approved data safely.
14. The system records the result and provides a report.

## 7.4 Preview requirements

Show:

-   File name and import type.
-   Target branch.
-   Total input rows.
-   Unique products.
-   Distinct batch records where applicable.
-   Rows ready to import.
-   Rows with errors.
-   Rows with warnings.
-   Duplicate rows.
-   New products.
-   Existing products to be matched.
-   Potential changes to existing data.
-   Estimated stock effect for a stock receipt.
-   Importer, upload time and current status.

These numbers must come from the actual parsed file. Never display
sample figures as if they were real.

## 7.5 Validation

Check for:

-   Missing required values.
-   Invalid or unclear expiry dates.
-   Invalid quantities.
-   Negative or implausible prices.
-   Unknown units or pack conversions.
-   Invalid or missing tax data where required.
-   Duplicate rows.
-   Conflicting product matches.
-   Duplicate purchase invoices.
-   Branch mismatch.
-   Unsupported columns or file formats.
-   Formula or malicious file content.
-   Batch records with conflicting data.

Errors must be clear and tied to the relevant row and field.

## 7.6 Import reliability

-   Use a unique import ID.
-   Record a file hash where useful.
-   Make retry behavior safe and idempotent.
-   Do not post the same stock receipt twice.
-   Store staging records separately from live inventory.
-   Use bounded chunks for large files.
-   Show job progress and failures.
-   Let the user download error rows.
-   Keep an import history.
-   Recheck permissions and data when the admin confirms.
-   Do not silently overwrite existing product prices or stock.
-   Keep the original source document according to a defined retention
    policy.
-   Use a safe posting process for large imports so a failure cannot
    leave unclear partial results.

## 7.7 No LLM requirement

The first version must not depend on a language model.

Use normal software tools:

-   Spreadsheet parsers for Excel and CSV.
-   PDF text/table extraction for digital PDFs.
-   OCR for scanned images where needed.
-   Column mapping.
-   Deterministic rules.
-   Product matching rules.
-   Validation and human review.

OCR can misread text and numbers. The system must show uncertain results
and require review. It must not claim that every scanned invoice can be
read perfectly.

## 7.8 File safety

-   Limit file size and allowed types.
-   Check file content, not only its extension.
-   Store uploads outside the public web directory.
-   Use generated storage names.
-   Prevent path traversal.
-   Do not execute uploaded files or spreadsheet macros.
-   Use malware scanning where available and appropriate.
-   Protect exported CSV files from formula injection.
-   Limit who can download source files and import reports.
-   Remove temporary files according to a documented cleanup policy.

------------------------------------------------------------------------

# 8. Billing and Invoice Workflow

## 8.1 Billing screen

The billing screen must be simple and fast.

It should include:

-   Medicine search.
-   Keyboard-friendly search results.
-   Barcode input support.
-   Selected items list.
-   Quantity controls.
-   Batch and expiry details where relevant.
-   Unit price and discount.
-   Tax calculation.
-   Bill total.
-   Payment method.
-   Save/complete bill action.
-   Print or reprint action based on permissions.
-   Clear success, warning and error states.

Product images are not required.

## 8.2 Search behavior

-   Typing a medicine name should show matching results.
-   Search should handle large catalogues without loading every product
    into the browser.
-   Enter should select the intended result or add the item according to
    a clear, consistent rule.
-   Arrow keys should move through results.
-   Escape should close a suggestion list where suitable.
-   Repeated Enter presses must not create duplicate bills.
-   The selected medicine must show strength, form and pack size.
-   Similar medicines must be distinguishable.

## 8.3 Barcode behavior

-   A scanner may act like a keyboard and enter a code.
-   The system should search for the code and show a match.
-   If the code is unknown, show a safe message and offer permitted
    manual search.
-   Do not assume every medicine has a barcode.
-   Do not assume every barcode identifies a batch or expiry.
-   Where a barcode does not identify a batch, the system must still
    select a valid batch using the normal stock rules.

## 8.4 Bill calculation

-   Use decimal-safe money handling, not ordinary floating-point math
    for financial totals.
-   Apply the correct configured tax rules.
-   Handle discounts and rounding consistently.
-   Recalculate totals on the backend.
-   Do not trust totals sent by the frontend.
-   Store a snapshot of the product description, tax data, price and
    quantities used on the invoice.
-   Record the payment state.
-   Prevent duplicate submission.
-   Use database transactions for invoice creation and stock deduction.
-   Do not complete a bill if the required stock cannot be deducted
    safely.

## 8.5 Invoice correction

A completed invoice must not be silently edited or deleted.

Use an approved cancellation, return, credit note or correction workflow
as applicable. Preserve the original invoice, the reason, the user, time
and linked correction record.

Invoice numbering and tax details must be reviewed against current
applicable Indian rules before production use.

## 8.6 Receipt and printing

-   Provide a clear print layout.
-   Support the paper sizes actually used by the branches.
-   Include required business and invoice details.
-   Make long medicine names readable.
-   Show discounts, tax and totals clearly.
-   Avoid unnecessary decorative graphics.
-   Do not show private internal notes on customer receipts.
-   Test common printers before rollout.

------------------------------------------------------------------------

# 9. GST, Pricing and Financial Rules

## 9.1 Tax configuration

Do not hardcode one GST rate for all medicines.

Support the required tax configuration, including HSN and applicable
rate, and keep the source and date of configuration where useful. The
company must verify rates and invoice rules against current official
guidance.

## 9.2 Price data

Keep separate fields for the correct business meanings, such as:

-   Purchase rate.
-   MRP.
-   Selling price where used.
-   Discount.
-   Applicable tax treatment.
-   Unit and pack pricing.

Do not confuse purchase cost with MRP. Do not silently update historical
invoices when a product's price or tax configuration changes.

## 9.3 Money handling

-   Store currency values using an appropriate fixed-precision database
    type or integer minor units where suitable.
-   Define rounding rules.
-   Test tax-inclusive and tax-exclusive cases where applicable.
-   Keep calculations consistent between preview, final bill and report.
-   Store a snapshot of the values used for each completed transaction.
-   Reconcile totals with payment records.

## 9.4 Reports

Provide, according to role:

-   Daily sales.
-   Sales by branch.
-   Sales by cashier.
-   Purchase register.
-   Stock on hand.
-   Stock valuation.
-   Low stock.
-   Near-expiry and expired stock.
-   Damaged or quarantined stock.
-   Returns and cancellations.
-   Payment summaries.
-   Cashier closing.
-   Import history.
-   Stock adjustment history.
-   GST-related reports.
-   Branch transfer reports.

Report exports must follow the same branch permissions as the screen.

------------------------------------------------------------------------

# 10. Technology Stack

Use a simple, maintainable architecture. Confirm exact stable versions,
licence terms and service limits when implementation begins. Avoid using
a library just because it is popular.

## 10.1 Frontend

-   React.
-   TypeScript.
-   Vite.
-   Tailwind CSS.
-   shadcn/ui or accessible components built on suitable primitives.
-   React Hook Form for complex forms where helpful.
-   Zod for frontend data validation.
-   A small, well-tested state-management approach. Do not add a large
    state library unless the application needs it.
-   An accessible table/grid approach suitable for large lists.
-   A print-friendly invoice layout.

The frontend should be a web application focused on authenticated
business tasks. Search engine optimization is useful for public pages
but is not the main reason to choose the app framework.

## 10.2 Backend

-   Node.js.
-   TypeScript.
-   NestJS.
-   REST API.
-   OpenAPI/Swagger API documentation.
-   Server-side validation.
-   Centralized error handling.
-   Structured logging.
-   Modular application design.

Keep the backend as a modular monolith initially. Do not split it into
microservices before there is a clear operational reason.

## 10.3 Database

-   PostgreSQL as the main system of record.
-   Prisma ORM for normal typed database access.
-   Reviewed SQL for critical inventory and billing operations where
    needed.
-   Database migrations kept in version control.
-   Foreign keys, unique constraints and appropriate indexes.
-   Transactions for financial and stock operations.
-   Row-level security only with careful design and testing if adopted
    as an extra protection.

Do not use MongoDB as the primary database by default for this project.
The main data is strongly related and needs reliable transactional
behavior.

## 10.4 Background jobs

-   Redis and BullMQ for queued work when the import workload needs
    them.
-   A Python worker for document processing when it provides clear
    value.
-   Python libraries for Excel, CSV, PDF and OCR tasks.
-   A separate worker process so large imports do not slow down billing
    APIs.

For a very early prototype, structured Excel/CSV processing can start
inside the backend. Add Redis and the Python worker when the import
workflow is ready for reliable background processing. Keep the
interfaces clear so this change is manageable.

## 10.5 File storage

Use local private storage for local development and an appropriate
object-storage service in production.

Do not assume every object-storage provider has a free production tier.
Check current limits, bandwidth, retention and backup needs before
choosing one.

## 10.6 Testing

-   Unit tests for business rules.
-   API integration tests.
-   Database tests for transactions and stock safety.
-   End-to-end tests for important user flows.
-   Accessibility checks.
-   Import test files with valid, invalid and duplicate rows.
-   Load tests for medicine search and bulk import.
-   Security tests for role and branch boundaries.

Possible tools include Vitest or Jest, Supertest and Playwright. Choose
a consistent test setup and keep it in the repository.

## 10.7 Deployment and development tools

-   Git for version control.
-   GitHub or another Git host.
-   Docker for repeatable environments where practical.
-   CI checks for linting, tests, type checking and builds.
-   Environment variables and a secure secret-management method.
-   Separate development, test/staging and production environments.
-   Monitoring and error tracking.
-   Automated database backups and tested restoration.

## 10.8 Free-tier approach

Use free and open-source tools first:

-   React, TypeScript, Vite, NestJS, PostgreSQL and Python are
    open-source.
-   Local development can use free tools.
-   A Git host may provide a free repository plan.
-   Some hosting, database, Redis, object storage and monitoring
    providers offer free tiers, but the limits can change.

The application must not rely on an unverified promise that hosting will
always be free. Production use may require paid hosting, domain
registration, backups, email delivery, support or compliance work.

Do not store real customer or pharmacy data in an unsafe free service
just to avoid cost. If a free service cannot meet access control,
backup, uptime or data-location needs, do not use it for production.

------------------------------------------------------------------------

# 11. High-Level Architecture

The first release should use a modular monolith.

``` text
Staff browser
    |
    | HTTPS
    v
React + TypeScript frontend
    |
    | REST API
    v
NestJS application
    |
    +-- Authentication and permissions
    +-- Branches and users
    +-- Medicine catalogue
    +-- Inventory and batches
    +-- Purchasing and suppliers
    +-- Billing and invoices
    +-- Reports and audit
    +-- Import management
    |
    +----------------------> PostgreSQL
    |
    +----------------------> Redis job queue (when enabled)
                                  |
                                  v
                            Python import worker
                                  |
                                  v
                       Validated staging records
                                  |
                                  v
                      Authorized final commit
```

## 11.1 Key architecture rules

-   The database is the source of truth for stock and invoices.
-   Frontend state is not authoritative.
-   Branch access is checked on the backend.
-   Import parsing and live inventory posting are separate steps.
-   Completed invoices preserve their original values.
-   Stock changes always have a traceable reason.
-   External services are limited and documented.
-   Each module has a clear responsibility.
-   Keep API contracts documented.
-   Add infrastructure only when there is a real requirement.

------------------------------------------------------------------------

# 12. Database Design Requirements

The final schema will be designed before building the full feature set.
The following is the starting model, not the final migration.

## 12.1 Main tables or entities

-   `companies`
-   `branches`
-   `users`
-   `roles`
-   `permissions`
-   `user_branch_assignments`
-   `medicine_products`
-   `product_codes`
-   `suppliers`
-   `supplier_products` where needed
-   `purchase_invoices`
-   `purchase_invoice_lines`
-   `stock_batches`
-   `stock_movements`
-   `stock_transfers`
-   `stock_transfer_lines`
-   `sales_invoices`
-   `sales_invoice_lines`
-   `payments`
-   `returns`
-   `stock_adjustments`
-   `import_jobs`
-   `import_rows`
-   `audit_events`
-   `system_settings`
-   `privacy_requests`
-   `notification_records` where needed

Add tables only when the workflow needs them. Keep names consistent and
use foreign keys.

## 12.2 Data model rules

-   Use stable IDs for records.
-   Add timestamps for created and updated records.
-   Track important actors and reasons.
-   Use unique constraints for identifiers such as branch codes and
    relevant invoice numbers.
-   Keep money values in safe fixed precision.
-   Use database constraints for important data rules.
-   Index common branch, product, batch, date and invoice queries.
-   Avoid storing the same fact in several places unless a documented
    snapshot is needed.
-   Preserve historical invoice snapshots.
-   Do not store plaintext passwords or secrets.
-   Do not store payment-card data unless a separately reviewed and
    compliant design truly requires it.

## 12.3 Tenant and branch isolation

Even though this begins as one company, design branch permissions
carefully.

Every branch-owned record must be tied to the correct branch directly or
through a well-defined parent record. The backend must enforce the
relationship in every read and write.

Tests must attempt to access another branch by changing IDs in URLs,
request bodies, query parameters and exported report requests.

------------------------------------------------------------------------

# 13. Authentication and Security

## 13.1 Login

-   No public Super Admin registration.
-   Create the first Super Admin through a secure setup process.
-   Use a secure password-hashing algorithm such as Argon2id.
-   Use HTTPS in production.
-   Use secure, HTTP-only cookies for browser sessions where
    appropriate.
-   Protect state-changing requests against CSRF where required by the
    authentication design.
-   Limit repeated failed login attempts.
-   Provide a safe account recovery process.
-   Avoid revealing whether a username exists in recovery responses.
-   Expire or revoke sessions after password resets and account
    disablement.
-   Use MFA for privileged accounts when available and tested.

## 13.2 Authorization

-   Check permissions on every protected endpoint.
-   Check branch access on every branch-owned record.
-   Check both role and operation.
-   Do not trust the browser to supply an authorized branch.
-   Use server-side validation.
-   Keep high-risk actions separate from normal billing actions.
-   Re-authenticate before sensitive operations where appropriate.
-   Record permission changes.

## 13.3 Common web risks

Protect against:

-   Broken access control.
-   SQL injection.
-   Cross-site scripting (XSS).
-   Cross-site request forgery (CSRF), where applicable.
-   Unsafe file upload.
-   Path traversal.
-   Brute-force login attempts.
-   Session theft.
-   Sensitive data in URLs or logs.
-   Insecure direct object references.
-   Spreadsheet formula injection in exports.
-   Dependency vulnerabilities.
-   Misconfigured CORS.
-   Leaked secrets.
-   Unprotected backup files.
-   Excessive permissions for application or database accounts.

## 13.4 Audit logs

Log important events, including:

-   Login successes and failures where appropriate.
-   User and role changes.
-   Branch assignment changes.
-   Product and price changes.
-   Stock receipt, sale, return and adjustment.
-   Invoice cancellation and correction.
-   Import upload, approval, failure and completion.
-   Data exports.
-   Security setting changes.
-   Privacy request actions.

Audit logs must be protected against ordinary users editing or deleting
them. Avoid logging passwords, authentication tokens, full payment
details or unnecessary personal information.

------------------------------------------------------------------------

# 14. Privacy and Personal Data

## 14.1 Privacy principles

-   Collect only data that has a clear business or legal purpose.
-   Tell users what data is collected and why.
-   Restrict access by role and branch.
-   Keep data only as long as required by business needs and applicable
    law.
-   Protect data in transit and at rest where appropriate.
-   Keep a list of external services that process data.
-   Provide a process for applicable access, correction, deletion and
    grievance requests.
-   Do not sell personal data.
-   Do not use pharmacy or medicine-search data for advertising.
-   Do not place sensitive data in analytics tools.
-   Do not use production customer data in development or tests unless
    properly protected and justified.

## 14.2 Data categories

Potential data categories include:

-   Staff account and work contact data.
-   Supplier and business contact data.
-   Purchase, inventory and invoice data.
-   Security and audit data.
-   Customer data only where a defined business process requires it.
-   Prescription or patient-related data only if a verified legal and
    operational need exists.

Do not add patient histories, identity documents, birth dates, personal
phone numbers or home addresses just because the database can store
them.

## 14.3 Data inventory

For every personal data field, document:

-   What it is.
-   Why it is needed.
-   Who can access it.
-   Where it is stored.
-   Whether it is sent to a third party.
-   How long it is kept.
-   How it can be corrected or deleted.
-   Which legal retention requirements may apply.

## 14.4 Data deletion and correction

Provide a clear way to submit a privacy request through a published
contact or supported in-app process.

The process should:

1.  Record the request.
2.  Verify the requester's identity in a proportionate way.
3.  Identify the data and systems involved.
4.  Check legal and business retention duties.
5.  Approve or explain any lawful limit.
6.  Delete, correct, restrict or anonymize data where appropriate.
7.  Record the outcome.
8.  Respond within the applicable legal time limit.

Do not promise instant deletion from every backup. Define backup
retention and explain the practical deletion process. Do not erase
required financial or pharmacy records unlawfully.

## 14.5 Children

Do not collect children's personal data unless the product has a clear
need and the legal review supports it.

An internal staff login does not need a general age-check screen just
because the business is a pharmacy. If future features collect
children's data, review applicable Indian requirements, age assurance,
parental consent, exceptions and commencement dates before launch.

------------------------------------------------------------------------

# 15. Legal Pages and Business Details

The public website should have a simple footer with links to the
applicable pages.

## 15.1 Privacy Policy

The policy should accurately explain:

-   Who operates the service.
-   What personal data is collected.
-   Why it is collected.
-   How it is used and protected.
-   Which vendors or recipients may process it.
-   How long it is retained.
-   How users can submit requests or complaints.
-   How security incidents are handled.
-   How policy updates are communicated.
-   The correct privacy or grievance contact.

Do not copy a policy from another company and leave incorrect company
names or promises.

## 15.2 Terms of Service

Include, as relevant:

-   Who may use the service.
-   Account security responsibilities.
-   Acceptable use.
-   User and company responsibilities.
-   Service availability and maintenance.
-   Data handling and permitted use.
-   Billing terms if the software is paid.
-   Cancellation and termination.
-   Limits of responsibility that are lawful.
-   Intellectual property.
-   Support contact.
-   Governing law and dispute process reviewed by a qualified
    professional.
-   Changes to the terms.

Terms must not claim to remove rights that cannot legally be removed.

## 15.3 Refund and cancellation policy

If Confidos Pharma sells software subscriptions, explain:

-   Price and billing period.
-   Taxes and extra fees.
-   Renewal behavior.
-   Cancellation method and timing.
-   Refund eligibility.
-   How to contact support.

If the software is free, do not invent a subscription refund policy.
Keep the pharmacy's medicine-return process separate from the software
service's refund process.

## 15.4 Cookie Policy and Consent

-   List the cookies and similar technologies actually used.
-   Explain purpose and duration where appropriate.
-   Identify relevant third parties.
-   Provide a way to change optional preferences where required.
-   Do not show a fake consent banner.
-   Do not run optional tracking before consent where consent is
    required.
-   Do not claim to use only essential cookies if other tracking is
    present.

If the application uses only essential session and security cookies, the
design may not need a large consent banner. The exact requirement
depends on the applicable law and actual technologies.

## 15.5 Business details

Publish accurate details appropriate to the business model:

-   Legal business or company name.
-   Business address.
-   Support email or contact route.
-   Applicable registration details, such as GSTIN, where required.
-   Relevant licence details where required for the operating business.
-   Privacy or grievance contact.
-   Software provider identity.

Do not invent licence numbers, certificates, office addresses or
regulatory approvals.

## 15.6 Email and notifications

-   Keep security and transaction messages separate from marketing.
-   Include an unsubscribe mechanism for marketing emails where
    required.
-   Do not make essential security emails depend on marketing consent.
-   Do not expose sensitive medicine or patient data in email subject
    lines.
-   Protect password reset links and make them expire.
-   Keep a record of notification status where needed.

## 15.7 Terms acceptance

For relevant forms, record the accepted terms version and time when
appropriate. Do not force optional marketing consent to use the service.
Consent must be clear, specific and separate where the law requires it.

------------------------------------------------------------------------

# 16. Cookies and Third-Party Services

## 16.1 Cookie categories

-   Essential session and security cookies.
-   Optional preferences.
-   Analytics where approved.
-   Advertising cookies only if a justified future requirement exists.

The first release should avoid advertising cookies.

## 16.2 Consent controls

Where consent is required:

-   Accept, reject and customize options should be clear.
-   Optional tracking should remain off until valid consent.
-   Users should be able to change their choice.
-   Store only the consent evidence needed.
-   Do not use confusing wording or preselected optional choices.

## 16.3 Third-party SDK audit

Before adding a tool, check:

-   Data collected.
-   Network requests and cookies.
-   Data location and subprocessors.
-   Retention and deletion.
-   Security update history.
-   Contract terms.
-   Need for consent.
-   Whether the feature can be built without the tool.

Avoid advertising SDKs, unnecessary social trackers, session replay on
billing screens and analytics that capture medicine searches or customer
transaction details.

------------------------------------------------------------------------

# 17. Ethical UX

The application must not use deceptive patterns.

-   No hidden fees.
-   No fake reviews.
-   No unsupported claims.
-   No false countdowns or fake scarcity.
-   No preselected optional marketing consent.
-   No forced marketing consent.
-   No hidden cancellation steps for a paid subscription.
-   No misleading error messages.
-   No fake stock levels.
-   No unauthorized discounts.
-   No silent changes to a bill after completion.
-   No buttons that appear active but do nothing.
-   No destructive action without suitable warning.
-   No confusing wording that hides what the user is agreeing to.

For a completed bill or stock change, explain the effect of the action.
Use confirmation for high-risk actions, but do not add needless
confirmation to every harmless step.

------------------------------------------------------------------------

# 18. Minimal UI and Design System

## 18.1 Design goals

-   Clean and minimal.
-   Few colors.
-   Strong contrast.
-   Clear labels.
-   Easy to learn.
-   Fast for daily use.
-   Consistent spacing and layout.
-   No decorative effects that slow down billing.
-   Clear status and error messages.
-   Keyboard support throughout.

## 18.2 Color rules

Use a small color palette:

-   Neutral backgrounds and surfaces.
-   One main brand color.
-   One clear success color.
-   One warning color.
-   One error color.

Do not use color alone to show status. Include text or icons where
needed.

Meet WCAG contrast requirements for text, controls and meaningful
interface elements. Check the final colors with a contrast tool rather
than relying on visual judgment.

## 18.3 Typography

-   Use a readable font with a suitable commercial-use licence.
-   Use a consistent type scale.
-   Keep body text readable.
-   Avoid long, complex English sentences.
-   Use familiar labels such as "Add Stock", "Create Bill", "Upload
    File" and "Review Import".
-   Explain technical errors in simple language.
-   Do not use all caps for long text.
-   Do not rely on tiny text for important information.

## 18.4 Layout

-   Use consistent page headers and navigation.
-   Keep primary actions in predictable places.
-   Use tables for inventory and transaction lists.
-   Support sorting, filtering and pagination.
-   Show loading, empty, success, warning and error states.
-   Keep destructive actions visually distinct.
-   Do not place essential actions only on hover.
-   Keep form labels visible.
-   Preserve user input when validation fails.

## 18.5 Animation and motion

Animation should support feedback, not decoration.

-   Use short, subtle transitions for opening menus and dialogs.
-   Avoid large moving backgrounds, distracting motion and long page
    transitions.
-   Respect the operating system's reduced-motion preference.
-   Do not animate important financial values in a way that delays
    understanding.
-   Never delay billing completion for an animation.
-   Ensure motion does not hide focus or cause layout shifts.
-   Keep the billing interface especially calm and fast.

## 18.6 Icons and images

-   Product images are optional.
-   Use icons only where their meaning is clear.
-   Add accessible names to icon-only buttons.
-   Use meaningful alt text for informative images.
-   Use empty alt text or equivalent treatment for decorative images.
-   Keep a record of font, icon and image licences.
-   Do not use an image that the company does not have permission to
    use.

------------------------------------------------------------------------

# 19. Accessibility

Target WCAG 2.2 Level AA as the design and test goal, while checking
which legal accessibility rules apply to the actual service.

## 19.1 Required checks

-   Full keyboard access.
-   Visible focus.
-   Logical tab order.
-   Correct heading structure.
-   Labels linked to inputs.
-   Clear validation messages.
-   Screen-reader support for status updates.
-   Text alternatives for meaningful images.
-   Adequate contrast.
-   No information conveyed only by color.
-   Accessible dialogs and menus.
-   Adequate target size.
-   No keyboard traps.
-   Responsive layouts.
-   Reduced-motion support.
-   Accessible tables and pagination.
-   Clear error recovery.

## 19.2 Billing accessibility

-   Search must work with a keyboard.
-   Results must be readable by assistive technology.
-   Focus must remain predictable after adding an item.
-   Stock and expiry warnings must use text, not color alone.
-   The final total must be clearly announced or discoverable.
-   Error messages must explain how to fix the problem.
-   Printing must not depend on a mouse-only action.

## 19.3 Testing

Use automated accessibility checks, manual keyboard tests and
screen-reader testing. Automated checks alone do not prove
accessibility.

------------------------------------------------------------------------

# 20. Customer and Staff Experience

## 20.1 Staff experience

Staff should be able to:

-   Sign in safely.
-   Understand their branch and role.
-   Search quickly.
-   See only the actions they are allowed to use.
-   Correct mistakes through clear workflows.
-   Understand why an action failed.
-   Print bills and reports.
-   Get help when something goes wrong.

## 20.2 Customer-facing bill

A customer receipt should be readable and contain the required
transaction information. Do not add marketing content or personal data
that is not needed.

## 20.3 Support

Provide a clear support contact and a way to report:

-   Login problems.
-   Wrong stock.
-   Wrong price or tax data.
-   Import problems.
-   Invoice problems.
-   Suspected security issues.
-   Privacy requests.

Do not ask users to send passwords or authentication codes to support
staff.

------------------------------------------------------------------------

# 21. Reports, Audit and Exports

## 21.1 Report permissions

Every report must use the same role and branch restrictions as the
underlying data.

## 21.2 Export safety

-   Export only fields the user is allowed to see.
-   Log sensitive or large exports where appropriate.
-   Protect exports containing personal or financial data.
-   Prevent spreadsheet formula injection.
-   Use safe file names.
-   Do not expose internal storage paths.
-   Apply retention and cleanup rules to generated files.

## 21.3 Audit requirements

An audit record should include:

-   Event type.
-   User or system actor.
-   Branch where relevant.
-   Time.
-   Target record.
-   Reason where needed.
-   Result.
-   Relevant before/after values where appropriate, without recording
    secrets.

Audit records should be append-only for normal application roles.
High-risk corrections must retain the original history.

------------------------------------------------------------------------

# 22. Performance and Reliability

## 22.1 Performance goals

Set measurable targets during testing. Initial targets should be
validated on realistic hardware, network conditions and data sizes.

Suggested targets:

-   Normal medicine search should feel immediate and meet a measured
    response-time target.
-   Common billing actions should not be delayed by background imports.
-   Large tables should use server-side pagination or controlled virtual
    rendering.
-   The browser should not load a 100,000-row catalogue at once.
-   Large imports should run in background jobs.
-   Reports should use efficient queries and indexes.
-   The application should show progress for long tasks.

Do not promise a fixed response time before measuring it.

## 22.2 Failure behavior

-   Show a clear message when the network fails.
-   Do not claim a bill succeeded until the server confirms it.
-   Prevent duplicate bill submissions.
-   Let users recover from failed imports.
-   Do not lose unsaved form data unnecessarily.
-   Keep stock updates and invoice writes consistent.
-   Record errors without exposing secrets.
-   Alert responsible staff about serious failures.

## 22.3 Online and offline use

The initial design is online-first. If the internet fails, users should
receive a clear message and should not be allowed to assume that an
unconfirmed bill is complete.

Offline billing requires local storage, synchronization, conflict
handling, duplicate protection and a clear source-of-truth design. Treat
it as a separate project requirement rather than adding it casually.

------------------------------------------------------------------------

# 23. Backups, Recovery and Monitoring

## 23.1 Backups

-   Configure automated database backups.
-   Protect backup access.
-   Encrypt backups where supported.
-   Keep an appropriate backup retention schedule.
-   Test restoration regularly.
-   Document who is responsible for recovery.
-   Keep production secrets out of source control.

## 23.2 Recovery

Define:

-   Recovery Point Objective (RPO): how much recent data loss is
    acceptable.
-   Recovery Time Objective (RTO): how quickly the service should be
    restored.

Choose actual targets with the business before production. Do not invent
a recovery guarantee.

## 23.3 Monitoring

Monitor:

-   Application health.
-   Database availability.
-   Failed login patterns.
-   API errors.
-   Queue failures.
-   Import duration and failure rates.
-   Backup success.
-   Disk and memory use.
-   Slow queries.
-   Unexpected stock or billing errors.

Keep monitoring data limited to what is needed. Do not send medicine
searches, invoice contents or personal data to a third-party error tool
without review.

------------------------------------------------------------------------

# 24. Testing Strategy

## 24.1 Unit tests

Test:

-   Price calculations.
-   Tax calculations.
-   Discounts and rounding.
-   Unit conversion.
-   FEFO batch selection.
-   Expiry blocking.
-   Role checks.
-   Branch authorization.
-   Import validation.
-   Duplicate detection.
-   Invoice state changes.

## 24.2 Integration tests

Test the real database behavior for:

-   Creating a bill and deducting stock.
-   Two cashiers trying to sell the final unit.
-   Import confirmation.
-   Import retries.
-   Branch transfers.
-   Returns and corrections.
-   Database transaction rollback.
-   Role and branch restrictions.
-   Report filtering.

## 24.3 End-to-end tests

Test complete flows:

1.  Super Admin creates a branch.
2.  Super Admin creates a Branch Admin.
3.  Branch Admin adds a medicine.
4.  Branch Admin receives a batch.
5.  Billing User searches and sells the medicine.
6.  Stock quantity decreases correctly.
7.  The invoice prints correctly.
8.  A return or cancellation follows the approved workflow.
9.  Another branch cannot access the transaction.
10. A bulk import is reviewed and safely committed.

## 24.4 Import tests

Use sample files that contain:

-   Valid data.
-   Missing columns.
-   Duplicate rows.
-   Bad dates.
-   Invalid quantities.
-   Wrong file types.
-   Very large row counts.
-   Conflicting product matches.
-   Duplicate purchase invoices.
-   Malformed PDFs.
-   Unreadable scans.
-   Formula-like text in cells.

Test large structured files separately from large collections of scanned
documents.

## 24.5 Accessibility and security tests

-   Keyboard-only operation.
-   Screen-reader checks.
-   Contrast checks.
-   Authorization tests for each role.
-   Branch ID manipulation tests.
-   Malicious upload tests.
-   Session and password recovery tests.
-   Dependency and secret scanning.
-   Backup restoration.
-   Load and failure testing.

------------------------------------------------------------------------

# 25. Development Workflow and Code Quality

## 25.1 Repository

Use one repository with clear folders for the frontend, backend, import
worker, shared contracts, database migrations, tests and documentation.

## 25.2 Code rules

-   Use TypeScript strict mode where practical.
-   Keep functions focused.
-   Keep business rules out of UI components.
-   Validate data at system boundaries.
-   Use consistent naming.
-   Avoid duplicated business logic.
-   Keep secrets out of the repository.
-   Use linting and formatting.
-   Write tests for important rules.
-   Review database migrations.
-   Keep dependencies updated.
-   Document unusual decisions.

## 25.3 AI-assisted development

AI coding tools may help create code, tests and documentation, but
generated code must be reviewed.

-   Do not paste secrets into prompts.
-   Do not accept generated authentication or billing code without
    tests.
-   Check every package before installing it.
-   Verify API behavior against official documentation.
-   Run tests and inspect the actual diff.
-   Never let generated code bypass branch authorization.
-   Keep the project requirements document as the source of truth.
-   Do not assume generated code is secure or legally correct.

------------------------------------------------------------------------

# 26. Free and Open-Source Development Plan

## 26.1 Local development

The project should be buildable locally with free tools:

-   Node.js and package manager.
-   Python.
-   PostgreSQL.
-   Git.
-   A code editor.
-   Browser developer tools.
-   Docker where practical.
-   Free/open-source test and formatting tools.

## 26.2 Costs to review

A free local development setup does not mean production has no cost.

Check:

-   Domain registration.
-   Application hosting.
-   Managed database.
-   Object storage.
-   Email delivery.
-   Backups.
-   Monitoring.
-   OCR processing.
-   Support and maintenance.
-   Legal review.
-   Pharmacy or business compliance work.

Use free tiers only after checking limits and data protection. Never
trade away reliable backups or access control to save a small amount.

## 26.3 No required AI costs

The core application must not require an LLM API. The main business
workflows should use ordinary application code and deterministic rules.

------------------------------------------------------------------------

# 27. Implementation Phases

## Phase 1: Requirements and design

-   Confirm the business model.
-   Confirm branch and role rules.
-   Confirm invoice and tax requirements with the business.
-   Confirm stock and batch rules.
-   Define the database schema.
-   Define API contracts.
-   Create wireframes and a minimal design system.
-   Create a privacy data inventory.
-   Define the first acceptance tests.

**Exit condition:** the core business rules and schema are reviewed
before major feature development.

## Phase 2: Project foundation

-   Create repository structure.
-   Set up frontend and backend.
-   Set up PostgreSQL and migrations.
-   Add environment configuration.
-   Add linting, formatting and tests.
-   Create the first Super Admin setup flow.
-   Add logging and health checks.

**Exit condition:** a repeatable local setup and a working authenticated
API.

## Phase 3: Identity, branches and permissions

-   Create branch management.
-   Create users and role assignments.
-   Implement server-side authorization.
-   Test cross-branch access denial.
-   Add audit events for important changes.

**Exit condition:** roles and branch boundaries pass automated tests.

## Phase 4: Catalogue and inventory

-   Build manual medicine entry.
-   Add duplicate detection.
-   Add supplier records.
-   Add batch and expiry tracking.
-   Add stock movement ledger.
-   Add receiving and stock adjustment workflows.
-   Add FEFO selection.

**Exit condition:** stock balances and movement history agree under
tested operations.

## Phase 5: Billing

-   Build medicine search.
-   Add barcode support.
-   Build the bill draft and item list.
-   Implement server-side price and tax calculations.
-   Implement safe stock deduction.
-   Add invoice printing.
-   Add controlled cancellation and return workflows.

**Exit condition:** concurrency tests prove that stock cannot be
oversold through normal concurrent billing.

## Phase 6: Bulk import

-   Add Excel and CSV import.
-   Add staging and preview.
-   Add validation and error reports.
-   Add idempotent confirmation.
-   Add import history.
-   Add PDF extraction and OCR only after structured import is reliable.

**Exit condition:** retries, errors and duplicate rows do not create
duplicate stock.

## Phase 7: Reports and compliance controls

-   Add branch reports.
-   Add company-wide summaries.
-   Add audit views.
-   Add data export controls.
-   Publish reviewed legal pages.
-   Implement privacy request handling.
-   Review cookies and third-party services.
-   Complete accessibility checks.

**Exit condition:** reports respect branch permissions and policies
match real system behavior.

## Phase 8: Production readiness

-   Test realistic data volumes.
-   Run security and accessibility reviews.
-   Configure monitoring.
-   Configure backups.
-   Test restoration.
-   Confirm deployment and recovery steps.
-   Train staff.
-   Run a controlled pilot branch.
-   Fix issues before rollout to all branches.

**Exit condition:** the business approves the pilot and the release
gates pass.

------------------------------------------------------------------------

# 28. Release Checklist

## Website and legal

-   [ ] Correct business identity and contact details.
-   [ ] Privacy policy reviewed.
-   [ ] Terms reviewed.
-   [ ] Refund and cancellation policy matches the actual service.
-   [ ] Cookie behavior reviewed.
-   [ ] Consent controls work where required.
-   [ ] Data-rights request process works.
-   [ ] Business and regulatory claims are supported.
-   [ ] Email unsubscribe works where required.
-   [ ] Font, icon and image licences are checked.

## Privacy and security

-   [ ] Data inventory completed.
-   [ ] Data minimization reviewed.
-   [ ] Retention schedule approved.
-   [ ] Role and branch restrictions tested.
-   [ ] Password and session security tested.
-   [ ] Privileged account protection reviewed.
-   [ ] Third-party SDKs audited.
-   [ ] No unnecessary trackers.
-   [ ] No sensitive data in logs.
-   [ ] Backup and restoration tested.
-   [ ] Incident response plan documented.
-   [ ] Data deletion and correction workflow tested.

## UX and accessibility

-   [ ] Minimal design system applied.
-   [ ] Color contrast tested.
-   [ ] Keyboard navigation tested.
-   [ ] Visible focus checked.
-   [ ] Form labels and errors tested.
-   [ ] Screen-reader behavior reviewed.
-   [ ] Meaningful images have alt text.
-   [ ] Motion respects reduced-motion settings.
-   [ ] No dark patterns.
-   [ ] No hidden fees or fake reviews.
-   [ ] Empty, loading, success and error states exist.

## Pharmacy operations

-   [ ] Branch stock remains separate.
-   [ ] Medicine catalogue validation works.
-   [ ] Batch and expiry controls work.
-   [ ] FEFO selection works.
-   [ ] Expired and blocked stock cannot be sold.
-   [ ] Purchases and stock receipts are traceable.
-   [ ] Barcode and text search work.
-   [ ] Billing concurrency tests pass.
-   [ ] Invoice correction is audited.
-   [ ] GST behavior is reviewed.
-   [ ] Transfers cannot create or lose stock.
-   [ ] Reports match the underlying records.

## Bulk imports

-   [ ] Supported file types documented.
-   [ ] File size and content validation work.
-   [ ] Preview matches the actual file.
-   [ ] Unique products and batch records are counted correctly.
-   [ ] Errors and warnings are visible.
-   [ ] Import retries are safe.
-   [ ] Duplicate stock posting is prevented.
-   [ ] Original file access is restricted.
-   [ ] Import audit history exists.
-   [ ] Large-file tests pass.

## Production

-   [ ] Automated tests pass.
-   [ ] Dependencies are reviewed.
-   [ ] Secrets are protected.
-   [ ] Database migrations are reviewed.
-   [ ] Monitoring and alerts work.
-   [ ] Backups are configured.
-   [ ] Restoration is tested.
-   [ ] Recovery targets are agreed.
-   [ ] Deployment steps are documented.
-   [ ] Pilot branch has approved the workflow.

------------------------------------------------------------------------

# 29. Open Questions That Must Be Resolved

Do not invent answers to these questions during coding.

1.  What is the correct legal business name and business structure?
2.  Are the three initial branches confirmed, and what are their exact
    branch details?
3.  Will the application be used only internally or sold as software to
    other pharmacies?
4.  Will any medicine sales happen online through this product?
5.  Which invoice formats and tax requirements apply to the actual
    business?
6.  Which medicine categories will be handled, and what additional
    controls do they require?
7.  Will all branches use the same catalogue and price rules?
8.  Who can approve transfers, refunds, cancellations and stock
    adjustments?
9.  Are customer records required at all? If yes, which exact fields and
    why?
10. What supplier file formats are actually available?
11. What volume of bills and simultaneous billing counters is expected?
12. Is offline billing required because of internet problems?
13. Which hosting and database vendor will be used?
14. What backup retention and recovery targets does the business
    require?
15. What support and privacy contact details should be published?
16. What legal and pharmacy professional review is available before
    launch?

Where an answer is unknown, record it as an open decision and use a safe
default. Do not create a risky feature based on a guess.

------------------------------------------------------------------------

# 30. Final Product Rules

These rules apply to every module:

1.  Branch stock must remain separate.
2.  The backend must enforce permissions.
3.  Completed financial records must keep their history.
4.  Stock changes must be traceable.
5.  Imports must be reviewed before live posting.
6.  Medicine images are optional.
7.  Text search and manual entry are required.
8.  Barcode scanning is supported when available.
9.  Expired or blocked stock must not be sold.
10. Financial calculations must be done and checked on the server.
11. No LLM is required for core operation.
12. Personal data must be limited to a clear need.
13. Policies must describe the real application.
14. No fake reviews, unsupported claims or hidden fees.
15. Accessibility and keyboard use are part of acceptance testing.
16. Third-party tools must be reviewed before use.
17. Production backups must be restorable.
18. Free-tier limits must be checked before deployment.
19. Do not claim compliance without evidence.
20. Do not mark a feature complete until its acceptance tests pass.

------------------------------------------------------------------------

# 31. Instruction for the Implementation Agent

Build Confidos Pharma from this document in small, testable phases.

Before coding each phase:

1.  Read the full requirements.
2.  List the files and modules to be changed.
3.  Confirm the relevant business rules.
4.  Identify security and data risks.
5.  Write tests for important behavior.
6.  Implement the smallest complete feature.
7.  Run tests, linting and type checks.
8.  Inspect the diff and verify that unrelated features were not broken.
9.  Update the implementation status and documentation.
10. Report any requirement that cannot be completed or needs a business
    decision.

Do not build every module in one huge code generation step. Do not skip
authentication, branch isolation, database constraints, audit history or
tests just to make the UI look complete.

Do not invent business details, legal terms, tax rates, medicine data,
credentials or licence information. Use clearly marked development seed
data only in local and test environments.

The application is not ready for real pharmacy use until critical
security, inventory, billing, data recovery and legal review
requirements have passed.

------------------------------------------------------------------------

# 32. Reference Sources to Verify Before Launch

Use current official sources and current version documentation during
implementation. Recheck the relevant rules and software versions at
launch time.

-   India Code: https://www.indiacode.nic.in/
-   Ministry of Electronics and Information Technology:
    https://www.meity.gov.in/
-   Central Board of Indirect Taxes and Customs:
    https://www.cbic.gov.in/
-   Central Drugs Standard Control Organisation: https://cdsco.gov.in/
-   World Wide Web Consortium Web Content Accessibility Guidelines:
    https://www.w3.org/TR/WCAG22/
-   OWASP Application Security Verification Standard:
    https://owasp.org/www-project-application-security-verification-standard/
-   PostgreSQL documentation: https://www.postgresql.org/docs/
-   React documentation: https://react.dev/
-   TypeScript documentation: https://www.typescriptlang.org/docs/
-   Vite documentation: https://vite.dev/guide/
-   NestJS documentation: https://docs.nestjs.com/
-   Prisma documentation: https://www.prisma.io/docs
-   Python documentation: https://docs.python.org/3/
-   Redis documentation: https://redis.io/docs/
-   BullMQ documentation: https://docs.bullmq.io/
-   Playwright documentation: https://playwright.dev/docs/intro

This list is a starting point. Confirm the exact laws, rules,
amendments, commencement dates, licence terms and current technology
versions that apply to the final product.

------------------------------------------------------------------------

**End of working specification.**

This document is the starting source of truth for planning and
implementation. Update it through reviewed changes as the business
answers open questions and testing reveals new needs.
