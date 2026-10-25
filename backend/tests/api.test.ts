import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('Confidos Pharma API Test Suite', () => {
  let superAdminToken: string;
  let vjaAdminToken: string;
  let gntAdminToken: string;
  let vjaCashierToken: string;
  let vjaBranchId: string;
  let gntBranchId: string;
  let doloProductId: string;
  let vjaDoloBatchId: string;

  beforeAll(async () => {
    // 1. Authenticate Super Admin
    const saRes = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'superadmin', password: 'Pharma@2026' });

    expect(saRes.status).toBe(200);
    expect(saRes.body.token).toBeDefined();
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

  it('Enforces branch isolation: Guntur Admin CANNOT access Vijayawada stock batches', async () => {
    const res = await request(app)
      .get(`/api/inventory/batches?branchId=${vjaBranchId}`)
      .set('Authorization', `Bearer ${gntAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Access denied');
  });

  it('Billing User CANNOT create or edit catalogue products (PRD 2.3)', async () => {
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

  it('FEFO Algorithm returns the earliest non-expired batch for Vijayawada', async () => {
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

  it('Prevents selling expired stock batch (PRD 5.2)', async () => {
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

  it('Point of sale billing calculates GST, deducts stock atomically, and logs sale', async () => {
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

  it('Overselling rejection: Cannot sell more stock than available in branch', async () => {
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
  it('Allows creating and updating medicine master WITHOUT mandatory HSN code (Phase 5.1)', async () => {
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
  it('Supports manual purchase rate, selling rate, purchase discount, and scheme free quantity (Phase 6 & 7)', async () => {
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

  it('Rejects purchase entry with invalid discount exceeding gross value', async () => {
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
  it('Processes supplier purchase returns, safely deducting batch stock (Phase 6.5)', async () => {
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
  it('Enforces RBAC on operating expenses: Cashier forbidden, Admin allowed (Phase 9.4)', async () => {
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

  it('Calculates accurate Profit & Loss statement separating COGS from Purchases (Phase 7 & 9)', async () => {
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
});

