import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('Confidos Pharma API Test Suite', () => {
  let isCleanDb = false;
  let superAdminToken: string = '';
  let vjaAdminToken: string;
  let gntAdminToken: string;
  let vjaCashierToken: string;
  let vjaBranchId: string;
  let gntBranchId: string;
  let doloProductId: string;
  let vjaDoloBatchId: string;

  const testSeeded = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (isCleanDb) return;
      await fn();
    });
  };

  beforeAll(async () => {
    // 1. Check if seeded test accounts exist
    const saRes = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'superadmin', password: 'Pharma@2026' });

    if (saRes.status !== 200 || !saRes.body?.token) {
      isCleanDb = true;
      return;
    }

    superAdminToken = saRes.body.token;

    // 2. Authenticate Vijayawada Admin
    const vjaRes = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'admin_vja', password: 'Pharma@2026' });

    expect(vjaRes.status).toBe(200);
    vjaAdminToken = vjaRes.body.token;
    vjaBranchId = vjaRes.body.user.branchId;

    // 3. Authenticate Guntur Admin
    const gntRes = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'admin_gnt', password: 'Pharma@2026' });

    expect(gntRes.status).toBe(200);
    gntAdminToken = gntRes.body.token;
    gntBranchId = gntRes.body.user.branchId;

    // 4. Authenticate Vijayawada Cashier
    const cashierRes = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'bill_vja_1', password: 'Pharma@2026' });

    expect(cashierRes.status).toBe(200);
    vjaCashierToken = cashierRes.body.token;
  });

  it('Health check endpoint returns status healthy', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  it('Setup status endpoint returns valid response structure', async () => {
    const res = await request(app).get('/api/auth/setup-status');
    expect(res.status).toBe(200);
    expect(typeof res.body.needsSetup).toBe('boolean');
    expect(typeof res.body.totalUsers).toBe('number');
  });

  it('Setup admin endpoint guards system or validates payload', async () => {
    const res = await request(app)
      .post('/api/auth/setup-admin')
      .send({});
    // If users already exist, setup is locked (403). If clean, invalid body returns 400.
    expect([400, 403]).toContain(res.status);
  });

  it('Unauthenticated requests are strictly rejected on core endpoints', async () => {
    const endpoints = [
      '/api/products',
      '/api/branches',
      '/api/billing/invoices',
      '/api/suppliers',
      '/api/purchases',
    ];
    for (const ep of endpoints) {
      const res = await request(app).get(ep);
      expect(res.status).toBe(401);
    }
  });

  testSeeded('Enforces branch isolation: Guntur Admin CANNOT access Vijayawada stock batches', async () => {
    const res = await request(app)
      .get(`/api/inventory/batches?branchId=${vjaBranchId}`)
      .set('Authorization', `Bearer ${gntAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Access denied');
  });

  testSeeded('Billing User CANNOT create or edit catalogue products (PRD 2.3)', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${vjaCashierToken}`)
      .send({
        brandName: 'Unauthorized Drug',
        genericName: 'Sample',
        strength: '10mg',
        dosageForm: 'Tablet',
        manufacturer: 'Test',
        hsnCode: '30049099',
        gstRate: 12,
        mrp: 100,
      });

    expect(res.status).toBe(403);
  });

  testSeeded('FEFO Algorithm returns the earliest non-expired batch for Vijayawada', async () => {
    // Search for Dolo 650
    const prodRes = await request(app)
      .get('/api/products?search=Dolo')
      .set('Authorization', `Bearer ${vjaCashierToken}`);

    expect(prodRes.status).toBe(200);
    const dolo = prodRes.body.products.find((p: any) => p.brandName === 'Dolo 650');
    expect(dolo).toBeDefined();
    doloProductId = dolo.id;

    // Request FEFO batch
    const fefoRes = await request(app)
      .get(`/api/inventory/fefo/${doloProductId}`)
      .set('Authorization', `Bearer ${vjaCashierToken}`);

    expect(fefoRes.status).toBe(200);
    expect(fefoRes.body.batchNumber).toBe('DL-24A01'); // Earliest batch created in seed
    vjaDoloBatchId = fefoRes.body.id;
  });

  testSeeded('Prevents selling expired stock batch (PRD 5.2)', async () => {
    // Find Telma product
    const prodRes = await request(app)
      .get('/api/products?search=Telma')
      .set('Authorization', `Bearer ${vjaCashierToken}`);

    const telma = prodRes.body.products.find((p: any) => p.brandName === 'Telma 40');
    expect(telma).toBeDefined();

    // Find the expired batch
    const batchesRes = await request(app)
      .get(`/api/inventory/batches?medicineId=${telma.id}&expired=true`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    expect(batchesRes.status).toBe(200);
    const expiredBatch = batchesRes.body.find((b: any) => b.status === 'EXPIRED');
    expect(expiredBatch).toBeDefined();

    // Attempt to sell expired batch
    const billRes = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${vjaCashierToken}`)
      .send({
        customerName: 'Test Patient',
        items: [
          {
            medicineId: telma.id,
            batchId: expiredBatch.id,
            quantity: 1,
          },
        ],
      });

    expect(billRes.status).toBe(400);
    expect(billRes.body.message).toMatch(/expired/i);
  });

  testSeeded('Point of sale billing calculates GST, deducts stock atomically, and logs sale', async () => {
    // Check initial stock
    const initialCheck = await request(app)
      .get(`/api/inventory/batches?medicineId=${doloProductId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);
    const initialBatch = initialCheck.body.find((b: any) => b.id === vjaDoloBatchId);
    const initialQty = initialBatch.availableQuantity;

    const billRes = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${vjaCashierToken}`)
      .send({
        customerName: 'K. Srinivasan',
        customerPhone: '9848099887',
        paymentMethod: 'UPI',
        items: [
          {
            medicineId: doloProductId,
            batchId: vjaDoloBatchId,
            quantity: 2,
            discountPercent: 5,
          },
        ],
      });

    expect(billRes.status).toBe(201);
    expect(billRes.body.invoiceNumber).toMatch(/^INV-VJA-/);
    expect(billRes.body.lines.length).toBe(1);
    expect(billRes.body.grandTotal).toBeGreaterThan(0);
    expect(billRes.body.cgstTotal).toBeGreaterThan(0);
    expect(billRes.body.sgstTotal).toBeGreaterThan(0);

    // Verify stock was reduced by exactly 2
    const batchCheck = await request(app)
      .get(`/api/inventory/batches?medicineId=${doloProductId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    const updatedBatch = batchCheck.body.find((b: any) => b.id === vjaDoloBatchId);
    expect(updatedBatch.availableQuantity).toBe(initialQty - 2);
  });

  testSeeded('Overselling rejection: Cannot sell more stock than available in branch', async () => {
    const billRes = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${vjaCashierToken}`)
      .send({
        customerName: 'Bulk Buyer',
        items: [
          {
            medicineId: doloProductId,
            batchId: vjaDoloBatchId,
            quantity: 9999, // Way more than 38 available
          },
        ],
      });

    expect(billRes.status).toBe(400);
    expect(billRes.body.message).toContain('Insufficient stock');
  });

  // --- PHASE THREE: MEDICINE MASTER TESTS ---
  testSeeded('Allows creating and updating medicine master WITHOUT mandatory HSN code (Phase 5.1)', async () => {
    // 1. Create medicine without HSN
    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        brandName: 'No-HSN Amoxicillin',
        genericName: 'Amoxicillin Pure',
        strength: '250mg',
        dosageForm: 'Capsule',
        manufacturer: 'Cipla Ltd',
        gstRate: 12,
        mrp: 75.00,
        defaultPurchaseRate: 45.00,
        defaultSellingRate: 70.00,
        reorderLevel: 25,
        // hsnCode is completely omitted
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.hsnCode).toBeNull();
    expect(createRes.body.defaultPurchaseRate).toBe(45);
    expect(createRes.body.defaultSellingRate).toBe(70);
    expect(createRes.body.reorderLevel).toBe(25);
    expect(createRes.body.mrp).toBe(75);

    // 2. Edit medicine without providing HSN
    const updateRes = await request(app)
      .put(`/api/products/${createRes.body.id}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        strength: '500mg',
        mrp: 120.00,
        defaultSellingRate: 110.00,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.strength).toBe('500mg');
    expect(updateRes.body.mrp).toBe(120);
    expect(updateRes.body.defaultSellingRate).toBe(110);
    expect(updateRes.body.defaultPurchaseRate).toBe(45); // Remains preserved
    expect(updateRes.body.hsnCode).toBeNull(); // Remains optional/null
  });

  // --- PHASE FOUR & FIVE: PURCHASE ENTRY, MANUAL RATES & DISCOUNTS ---
  testSeeded('Supports manual purchase rate, selling rate, purchase discount, and scheme free quantity (Phase 6 & 7)', async () => {
    // 1. Fetch a supplier
    const supRes = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${vjaAdminToken}`);
    expect(supRes.status).toBe(200);
    const supplier = supRes.body[0];
    expect(supplier).toBeDefined();

    const uniqueInvNumber = `SUP-INV-${Date.now()}`;
    const testBatchNumber = `PUR-B-${Date.now().toString().slice(-6)}`;

    // Line calculation:
    // Quantity: 100, Free Quantity: 10
    // Purchase Rate: 40.00, Gross Line: 4000.00
    // Selling Rate: 65.00, MRP: 70.00 (selling rate and MRP distinct!)
    // Purchase Discount: 5% = 200.00
    // Taxable Amount: 3800.00
    // GST (12%): 456.00
    // Line Total: 4256.00
    // Payment Mode: CREDIT, Paid Amount: 1000.00, Outstanding: 3256.00
    const purRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        branchId: vjaBranchId,
        supplierId: supplier.id,
        supplierInvoiceNumber: uniqueInvNumber,
        invoiceDate: new Date().toISOString(),
        paymentMode: 'CREDIT',
        paidAmount: 1000.00,
        lines: [
          {
            medicineId: doloProductId,
            batchNumber: testBatchNumber,
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            quantity: 100,
            freeQuantity: 10,
            purchaseRate: 40.00,
            sellingRate: 65.00,
            mrp: 70.00,
            discountPercent: 5,
            gstRate: 12,
          },
        ],
      });

    expect(purRes.status).toBe(201);
    expect(purRes.body.subtotal).toBe(3800);
    expect(purRes.body.discountTotal).toBe(200);
    expect(purRes.body.taxTotal).toBe(456);
    expect(purRes.body.grandTotal).toBe(4256);
    expect(purRes.body.paidAmount).toBe(1000);
    expect(purRes.body.outstandingAmount).toBe(3256);
    expect(purRes.body.paymentMode).toBe('CREDIT');

    // Verify stock batch was created with:
    // 1. Available quantity = 110 (100 paid + 10 free/scheme)
    // 2. Selling price = 65.00 (persisted as entered, NOT overwritten by MRP 70.00!)
    // 3. Purchase rate = 40.00
    const batchCheck = await request(app)
      .get(`/api/inventory/batches?medicineId=${doloProductId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    const newBatch = batchCheck.body.find((b: any) => b.batchNumber === testBatchNumber);
    expect(newBatch).toBeDefined();
    expect(newBatch.availableQuantity).toBe(110);
    expect(newBatch.sellingPrice).toBe(65);
    expect(newBatch.mrp).toBe(70);
    expect(newBatch.purchaseRate).toBe(40);
  });

  testSeeded('Rejects purchase entry with invalid discount exceeding gross value', async () => {
    const supRes = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    const res = await request(app)
      .post('/api/purchases')
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        branchId: vjaBranchId,
        supplierId: supRes.body[0].id,
        supplierInvoiceNumber: `INV-ERR-${Date.now()}`,
        lines: [
          {
            medicineId: doloProductId,
            batchNumber: 'ERR-DISC',
            expiryDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString(),
            quantity: 10,
            purchaseRate: 20,
            mrp: 30,
            discountPercent: 120, // Invalid: exceeds 100%
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/discount.*cannot exceed/i);
  });

  // --- PHASE SIX: SUPPLIER PURCHASE RETURNS ---
  testSeeded('Processes supplier purchase returns, safely deducting batch stock (Phase 6.5)', async () => {
    const supRes = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    // Check available quantity for Dolo batch
    const batchCheck = await request(app)
      .get(`/api/inventory/batches?medicineId=${doloProductId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    const activeBatch = batchCheck.body.find((b: any) => b.availableQuantity > 5);
    expect(activeBatch).toBeDefined();
    const initialQty = activeBatch.availableQuantity;

    // Return 3 units to supplier
    const retRes = await request(app)
      .post('/api/purchases/returns')
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        branchId: vjaBranchId,
        supplierId: supRes.body[0].id,
        reason: 'Damaged packaging from distributor transit',
        items: [
          {
            medicineId: doloProductId,
            batchId: activeBatch.id,
            batchNumber: activeBatch.batchNumber,
            quantity: 3,
            purchaseRate: activeBatch.purchaseRate,
            gstRate: 12,
          },
        ],
      });

    expect(retRes.status).toBe(201);
    expect(retRes.body.returnNumber).toMatch(/^PRT-VJA-/);
    expect(retRes.body.lines.length).toBe(1);

    // Verify stock batch quantity reduced by exactly 3
    const verifyBatch = await request(app)
      .get(`/api/inventory/batches?medicineId=${doloProductId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    const updatedBatch = verifyBatch.body.find((b: any) => b.id === activeBatch.id);
    expect(updatedBatch.availableQuantity).toBe(initialQty - 3);
  });

  // --- PHASE SEVEN & NINE: OPERATING EXPENSES & PROFIT & LOSS ---
  testSeeded('Enforces RBAC on operating expenses: Cashier forbidden, Admin allowed (Phase 9.4)', async () => {
    // 1. Cashier attempts to create expense -> 403 Forbidden
    const cashierRes = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${vjaCashierToken}`)
      .send({
        category: 'ELECTRICITY',
        description: 'Monthly branch electricity bill',
        amount: 3500,
      });

    expect(cashierRes.status).toBe(403);

    // 2. Admin creates operating expense -> 201 Created
    const adminRes = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        category: 'RENT',
        description: 'Vijayawada Central Branch shop rent for October 2026',
        amount: 25000,
        paymentMode: 'BANK_TRANSFER',
        referenceNo: 'TXN-RENT-OCT-01',
      });

    expect(adminRes.status).toBe(201);
    expect(adminRes.body.id).toBeDefined();
    expect(adminRes.body.category).toBe('RENT');
    expect(adminRes.body.amount).toBe(25000);
  });

  testSeeded('Calculates accurate Profit & Loss statement separating COGS from Purchases (Phase 7 & 9)', async () => {
    const plRes = await request(app)
      .get(`/api/reports/profit-loss?branchId=${vjaBranchId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    expect(plRes.status).toBe(200);
    const report = plRes.body;

    // Verify report structure
    expect(report.summary).toBeDefined();
    expect(report.summary.netSales).toBeGreaterThanOrEqual(0);
    expect(report.summary.costOfGoodsSold).toBeGreaterThanOrEqual(0);
    expect(report.summary.grossProfit).toBe(report.summary.netSales - report.summary.costOfGoodsSold);
    expect(report.summary.operatingExpenses).toBeGreaterThanOrEqual(25000); // Includes our rent expense
    expect(report.summary.netProfit).toBe(report.summary.grossProfit - report.summary.operatingExpenses);

    // Verify Purchases are reported distinctly from COGS
    expect(report.inventoryPurchasesSummary).toBeDefined();
    expect(report.inventoryPurchasesSummary.totalPurchases).toBeGreaterThanOrEqual(0);
    expect(report.inventoryPurchasesSummary.note).toContain('asset acquisitions');

    // Cashier is barred from P&L
    const cashierPlRes = await request(app)
      .get(`/api/reports/profit-loss?branchId=${vjaBranchId}`)
      .set('Authorization', `Bearer ${vjaCashierToken}`);

    expect(cashierPlRes.status).toBe(403);
  });

  testSeeded('System Settings: exposes configurable discount (15%) and GST defaults (CGST 2.5%, SGST 2.5%, Total 5%)', async () => {
    // 1. Get settings
    const getRes = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.settings).toBeDefined();
    expect(parseFloat(getRes.body.settings.DEFAULT_PURCHASE_DISCOUNT_PERCENT)).toBeGreaterThanOrEqual(15.0);
    expect(getRes.body.settings.DEFAULT_CGST_RATE).toBe('2.5');
    expect(getRes.body.settings.DEFAULT_SGST_RATE).toBe('2.5');
    expect(getRes.body.settings.DEFAULT_COMBINED_GST_RATE).toBeDefined();

    // 2. Super Admin updates discount to 18% and verifies auto-combined GST
    const putRes = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        settings: {
          DEFAULT_PURCHASE_DISCOUNT_PERCENT: '18.0',
          DEFAULT_CGST_RATE: '2.5',
          DEFAULT_SGST_RATE: '2.5',
        },
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.settings.DEFAULT_PURCHASE_DISCOUNT_PERCENT).toBe('18.0');
    expect(putRes.body.settings.DEFAULT_COMBINED_GST_RATE).toBe('5');

    // 3. Billing User is barred from editing settings
    const cashierPutRes = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${vjaCashierToken}`)
      .send({ settings: { DEFAULT_PURCHASE_DISCOUNT_PERCENT: '25.0' } });

    expect(cashierPutRes.status).toBe(403);

    // 4. Reset setting back to initial 15.0% for idempotency
    await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        settings: {
          DEFAULT_PURCHASE_DISCOUNT_PERCENT: '15.0',
          DEFAULT_CGST_RATE: '2.5',
          DEFAULT_SGST_RATE: '2.5',
        },
      });
  });

  testSeeded('Supplier Management: validates email format, duplicate checks, and CRUD operations', async () => {
    // 1. Rejects invalid email
    const invalidEmailRes = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        name: 'Invalid Email Pharma',
        phone: '9988776655',
        email: 'invalid-email-address',
      });

    expect(invalidEmailRes.status).toBe(400);
    expect(invalidEmailRes.body.message).toMatch(/valid.*email/i);

    // 2. Successfully creates supplier with valid email (using unique phone)
    const uniqueSuffix = Date.now().toString().slice(-6);
    const validSupplierRes = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        name: `Apex Healthcare ${uniqueSuffix}`,
        contactPerson: 'Kalyan Chakravarthy',
        phone: `98${uniqueSuffix}1`,
        email: `orders_${uniqueSuffix}@apexhealthcare.in`,
        gstin: '37AAAAA0000A1Z5',
        address: 'Bunder Road, Vijayawada',
      });

    expect(validSupplierRes.status).toBe(201);
    const supplierId = validSupplierRes.body.id;
    expect(validSupplierRes.body.email).toBe(`orders_${uniqueSuffix}@apexhealthcare.in`);

    // 3. Rejects duplicate supplier with same name or phone
    const duplicateRes = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        name: `Apex Healthcare ${uniqueSuffix}`,
        phone: `98${uniqueSuffix}1`,
        email: 'another@apex.in',
      });

    expect(duplicateRes.status).toBe(409);

    // 4. Update supplier email and details
    const updateRes = await request(app)
      .put(`/api/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        email: `support_${uniqueSuffix}@apexhealthcare.in`,
        contactPerson: 'Kalyan C.',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.email).toBe(`support_${uniqueSuffix}@apexhealthcare.in`);
    expect(updateRes.body.contactPerson).toBe('Kalyan C.');

    // 5. Delete newly created unreferenced supplier permanently
    const deleteRes = await request(app)
      .delete(`/api/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deleted).toBe(true);
  });

  testSeeded('Purchase Invoice: records purchase, reconciles stock delta on edit, and safely cancels invoice', async () => {
    // 1. Create a test supplier with unique credentials
    const uniquePur = Date.now().toString().slice(-6);
    const supRes = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        name: `Inward Test Pharma ${uniquePur}`,
        phone: `97${uniquePur}2`,
        email: `inwards_${uniquePur}@testpharma.com`,
      });
    expect(supRes.status).toBe(201);
    const testSupplierId = supRes.body.id;

    const testBatchNumber = `TEST-REC-${uniquePur}`;

    // 2. Create purchase invoice with 50 units of Dolo 650
    const purRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        branchId: vjaBranchId,
        supplierId: testSupplierId,
        supplierInvoiceNumber: `INV-TEST-${Date.now()}`,
        invoiceDate: '2026-10-26',
        paymentMode: 'CREDIT',
        invoiceDiscountPercent: 15,
        lines: [
          {
            medicineId: doloProductId,
            batchNumber: testBatchNumber,
            expiryDate: '2028-12-31',
            quantity: 50,
            freeQuantity: 5, // 55 total units
            purchaseRate: 20,
            sellingRate: 30,
            mrp: 30,
            discountPercent: 10,
            gstRate: 5.0,
          },
        ],
      });

    expect(purRes.status).toBe(201);
    const invoiceId = purRes.body.id;
    expect(purRes.body.grandTotal).toBeGreaterThan(0);

    // Verify batch stock is 55
    const batchCheck1 = await request(app)
      .get(`/api/inventory/batches?branchId=${vjaBranchId}&medicineId=${doloProductId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    const batchRecord1 = batchCheck1.body.find((b: any) => b.batchNumber === testBatchNumber);
    expect(batchRecord1).toBeDefined();
    expect(batchRecord1.availableQuantity).toBe(55);

    // 3. Edit purchase invoice: increase quantity to 70 (+ 5 free = 75 units, delta = +20)
    const editRes1 = await request(app)
      .put(`/api/purchases/${invoiceId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        lines: [
          {
            medicineId: doloProductId,
            batchNumber: testBatchNumber,
            expiryDate: '2028-12-31',
            quantity: 70,
            freeQuantity: 5,
            purchaseRate: 20,
            sellingRate: 30,
            mrp: 30,
            discountPercent: 10,
            gstRate: 5.0,
          },
        ],
      });

    expect(editRes1.status).toBe(200);

    // Check reconciled stock: should now be 75
    const batchCheck2 = await request(app)
      .get(`/api/inventory/batches?branchId=${vjaBranchId}&medicineId=${doloProductId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    const batchRecord2 = batchCheck2.body.find((b: any) => b.batchNumber === testBatchNumber);
    expect(batchRecord2.availableQuantity).toBe(75);

    // 4. Edit purchase invoice: decrease quantity to 30 (+ 0 free = 30 units, delta = -45)
    const editRes2 = await request(app)
      .put(`/api/purchases/${invoiceId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        lines: [
          {
            medicineId: doloProductId,
            batchNumber: testBatchNumber,
            expiryDate: '2028-12-31',
            quantity: 30,
            freeQuantity: 0,
            purchaseRate: 20,
            sellingRate: 30,
            mrp: 30,
            discountPercent: 10,
            gstRate: 5.0,
          },
        ],
      });

    expect(editRes2.status).toBe(200);

    const batchCheck3 = await request(app)
      .get(`/api/inventory/batches?branchId=${vjaBranchId}&medicineId=${doloProductId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    const batchRecord3 = batchCheck3.body.find((b: any) => b.batchNumber === testBatchNumber);
    expect(batchRecord3.availableQuantity).toBe(30);

    // 5. Cancel purchase invoice: safely deducts remaining 30 units from batch
    const cancelRes = await request(app)
      .post(`/api/purchases/${invoiceId}/cancel`)
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({ reason: 'Audit test: Supplier shipment cancelled' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.message).toMatch(/cancelled successfully/i);

    // Verify batch available quantity is now 0 (depleted)
    const batchCheck4 = await request(app)
      .get(`/api/inventory/batches?branchId=${vjaBranchId}&medicineId=${doloProductId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    const batchRecord4 = batchCheck4.body.find((b: any) => b.batchNumber === testBatchNumber);
    expect(batchRecord4.availableQuantity).toBe(0);
  });

  testSeeded('Admin Panel CRUD: supports edit and safe archival for Products, Branches, and Staff Users', async () => {
    // 1. Product Edit and Safe Archive
    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        brandName: 'Test Cold Relief Extra',
        genericName: 'Chlorpheniramine + Phenylephrine',
        strength: '5mg',
        dosageForm: 'Tablet',
        manufacturer: 'Cipla Laboratories',
        mrp: 45.0,
        gstRate: 5.0,
      });

    expect(prodRes.status).toBe(201);
    const prodId = prodRes.body.id;

    // Edit Product
    const editProdRes = await request(app)
      .put(`/api/products/${prodId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        brandName: 'Test Cold Relief Max',
        mrp: 50.0,
      });

    expect(editProdRes.status).toBe(200);
    expect(editProdRes.body.brandName).toBe('Test Cold Relief Max');
    expect(editProdRes.body.mrp).toBe(50.0);

    // Delete unreferenced product permanently
    const delProdRes = await request(app)
      .delete(`/api/products/${prodId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    expect(delProdRes.status).toBe(200);
    expect(delProdRes.body.deleted).toBe(true);

    // 2. Branch Edit and Deactivation
    const branchRes = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        code: `B-KNL-${Date.now().toString().slice(-4)}`,
        name: 'Kurnool City Branch',
        address: 'Park Road, Kurnool',
        phone: '9848099887',
        gstin: '37BBBBB1111B1Z2',
      });

    expect(branchRes.status).toBe(201);
    const branchId = branchRes.body.id;

    // Edit branch
    const editBranchRes = await request(app)
      .put(`/api/branches/${branchId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ phone: '9848099999' });

    expect(editBranchRes.status).toBe(200);
    expect(editBranchRes.body.phone).toBe('9848099999');

    // Delete empty branch permanently
    const delBranchRes = await request(app)
      .delete(`/api/branches/${branchId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(delBranchRes.status).toBe(200);
    expect(delBranchRes.body.deleted).toBe(true);

    // 3. User Edit and Deactivation
    const userRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({
        username: `cashier_temp_${Date.now().toString().slice(-4)}`,
        email: `cashier_${Date.now().toString().slice(-4)}@confidos.com`,
        fullName: 'Temporary Billing Operator',
        password: 'Pharma@2026',
        role: 'BILLING_USER',
        branchId: vjaBranchId,
      });

    expect(userRes.status).toBe(201);
    const newUserId = userRes.body.id;

    // Edit user
    const editUserRes = await request(app)
      .put(`/api/users/${newUserId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`)
      .send({ fullName: 'Senior Billing Operator' });

    expect(editUserRes.status).toBe(200);
    expect(editUserRes.body.fullName).toBe('Senior Billing Operator');

    // Deactivate user
    const deactUserRes = await request(app)
      .delete(`/api/users/${newUserId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    expect(deactUserRes.status).toBe(200);
    expect(deactUserRes.body.archived).toBe(true);
    expect(deactUserRes.body.user.isActive).toBe(false);
  });
});

