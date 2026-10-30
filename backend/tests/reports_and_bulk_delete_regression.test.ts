import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/database/prisma';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/config/jwt';

describe('Confidos Pharma — Reports & Bulk Deletion Regression Test Suite', { timeout: 60000 }, () => {
  let superAdminToken = '';
  let branchAdminToken = '';
  let cashierToken = '';
  let testBranchId = '';
  let createdProductIds: string[] = [];

  beforeAll(async () => {
    // 1. Resolve active branch
    let branch = await prisma.branch.findFirst({ where: { isActive: true } });
    if (!branch) {
      let company = await prisma.company.findFirst();
      if (!company) {
        company = await prisma.company.create({
          data: {
            name: 'Confidos Pharma Ltd.',
            legalName: 'Confidos Pharma Ltd.',
            gstin: '37AAAAA1234A1Z5',
          },
        });
      }
      branch = await prisma.branch.create({
        data: {
          companyId: company.id,
          code: 'B-RPT-REG',
          name: 'Reports Regression Branch',
          address: 'Main Street, Vijayawada',
          phone: '+91 98765 43210',
          isActive: true,
        },
      });
    }
    testBranchId = branch.id;

    // 2. Resolve Super Admin
    let superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
    if (!superAdmin) {
      superAdmin = await prisma.user.create({
        data: {
          username: `sa_rpt_${Date.now()}`,
          email: `sa_rpt_${Date.now()}@confidos.test`,
          fullName: 'Reports Super Admin',
          passwordHash: 'dummy',
          role: 'SUPER_ADMIN',
          isActive: true,
        },
      });
    }
    superAdminToken = jwt.sign(
      { id: superAdmin.id, username: superAdmin.username, role: 'SUPER_ADMIN', branchId: null },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 3. Resolve Branch Admin
    let branchAdmin = await prisma.user.findFirst({
      where: { role: 'BRANCH_ADMIN', branchId: branch.id, isActive: true },
    });
    if (!branchAdmin) {
      branchAdmin = await prisma.user.create({
        data: {
          username: `ba_rpt_${Date.now()}`,
          email: `ba_rpt_${Date.now()}@confidos.test`,
          fullName: 'Reports Branch Admin',
          passwordHash: 'dummy',
          role: 'BRANCH_ADMIN',
          branchId: branch.id,
          isActive: true,
        },
      });
    }
    branchAdminToken = jwt.sign(
      { id: branchAdmin.id, username: branchAdmin.username, role: 'BRANCH_ADMIN', branchId: branch.id },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 4. Resolve Cashier
    let cashier = await prisma.user.findFirst({
      where: { role: 'BILLING_USER', branchId: branch.id, isActive: true },
    });
    if (!cashier) {
      cashier = await prisma.user.create({
        data: {
          username: `cash_rpt_${Date.now()}`,
          email: `cash_rpt_${Date.now()}@confidos.test`,
          fullName: 'Reports Cashier',
          passwordHash: 'dummy',
          role: 'BILLING_USER',
          branchId: branch.id,
          isActive: true,
        },
      });
    }
    cashierToken = jwt.sign(
      { id: cashier.id, username: cashier.username, role: 'BILLING_USER', branchId: branch.id },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
  });

  afterAll(async () => {
    // Clean up test products created during regression tests
    if (createdProductIds.length > 0) {
      for (const id of createdProductIds) {
        try {
          await prisma.stockBatch.deleteMany({ where: { medicineId: id } });
          await prisma.medicineProduct.deleteMany({ where: { id } });
        } catch (_) {}
      }
    }
  });

  // =========================================================================
  // REPORT REGRESSION TESTS
  // =========================================================================
  describe('Phase 1: Reports & Tax Analytics Endpoints and Calculations', () => {
    it('1. Daily Sales Register returns expected response shape and calculation totals', async () => {
      const today = new Date().toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/reports/daily-sales?branchId=${testBranchId}&date=${today}`)
        .set('Authorization', `Bearer ${branchAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('date');
      expect(res.body).toHaveProperty('totalInvoices');
      expect(res.body).toHaveProperty('totalSales');
      expect(res.body).toHaveProperty('totalTax');
      expect(res.body).toHaveProperty('totalDiscount');
      expect(res.body).toHaveProperty('paymentBreakdown');
      expect(Array.isArray(res.body.invoices)).toBe(true);

      expect(typeof res.body.totalSales).toBe('number');
      expect(typeof res.body.totalTax).toBe('number');
      expect(typeof res.body.totalDiscount).toBe('number');
    });

    it('2. Stock Valuation & Margin report returns valid units, cost, MRP, and margin', async () => {
      const res = await request(app)
        .get(`/api/reports/stock-valuation?branchId=${testBranchId}`)
        .set('Authorization', `Bearer ${branchAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalUnits');
      expect(res.body).toHaveProperty('totalPurchaseValue');
      expect(res.body).toHaveProperty('totalMrpValue');
      expect(res.body).toHaveProperty('potentialMargin');
      expect(res.body).toHaveProperty('batchesCount');
      expect(Array.isArray(res.body.items)).toBe(true);

      // Verify margin definition: potentialMargin = totalMrpValue - totalPurchaseValue
      const expectedMargin = Math.round((res.body.totalMrpValue - res.body.totalPurchaseValue) * 100) / 100;
      const actualMargin = Math.round(res.body.potentialMargin * 100) / 100;
      expect(actualMargin).toBe(expectedMargin);

      // If there are inventory batches, verify line-level calculations
      if (res.body.items.length > 0) {
        const item = res.body.items[0];
        expect(item).toHaveProperty('batchId');
        expect(item).toHaveProperty('medicineName');
        expect(item).toHaveProperty('quantity');
        expect(item).toHaveProperty('purchaseRate');
        expect(item).toHaveProperty('mrp');
        expect(item).toHaveProperty('purchaseValue');
        expect(item).toHaveProperty('mrpValue');
      }
    });

    it('3. GST Tax Summary (HSN) groups by HSN code and returns reconciled tax amounts', async () => {
      const res = await request(app)
        .get(`/api/reports/gst-summary?branchId=${testBranchId}`)
        .set('Authorization', `Bearer ${branchAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalTaxable');
      expect(res.body).toHaveProperty('totalCgst');
      expect(res.body).toHaveProperty('totalSgst');
      expect(res.body).toHaveProperty('totalTax');
      expect(res.body).toHaveProperty('totalAmount');
      expect(Array.isArray(res.body.hsnRecords)).toBe(true);

      // Verify tax reconcile: totalTax = totalCgst + totalSgst
      const expectedTotalTax = Math.round((res.body.totalCgst + res.body.totalSgst) * 100) / 100;
      const actualTotalTax = Math.round(res.body.totalTax * 100) / 100;
      expect(actualTotalTax).toBe(expectedTotalTax);

      // Verify each HSN record structure
      for (const rec of res.body.hsnRecords) {
        expect(rec).toHaveProperty('hsnCode');
        expect(rec).toHaveProperty('gstRate');
        expect(rec).toHaveProperty('taxableAmount');
        expect(rec).toHaveProperty('cgstAmount');
        expect(rec).toHaveProperty('sgstAmount');
        expect(rec).toHaveProperty('totalTax');
        expect(rec).toHaveProperty('totalAmount');
      }
    });

    it('4. Expiry Risk Report returns categorized nearExpiry and expired batches', async () => {
      const res = await request(app)
        .get(`/api/reports/expiry-alerts?branchId=${testBranchId}&days=90`)
        .set('Authorization', `Bearer ${branchAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalExpired');
      expect(res.body).toHaveProperty('totalNearExpiry');
      expect(Array.isArray(res.body.expired)).toBe(true);
      expect(Array.isArray(res.body.nearExpiry)).toBe(true);
    });

    it('5. Report endpoints reject unauthenticated requests with HTTP 401', async () => {
      const res1 = await request(app).get('/api/reports/daily-sales');
      expect(res1.status).toBe(401);

      const res2 = await request(app).get('/api/reports/stock-valuation');
      expect(res2.status).toBe(401);

      const res3 = await request(app).get('/api/reports/gst-summary');
      expect(res3.status).toBe(401);

      const res4 = await request(app).get('/api/reports/expiry-alerts');
      expect(res4.status).toBe(401);
    });
  });

  // =========================================================================
  // BULK DELETE REGRESSION TESTS
  // =========================================================================
  describe('Phase 2: Bulk Deletion & Archival Transaction Integrity', () => {
    it('1. Super Admin bulk-deletes unreferenced products permanently', async () => {
      const uniqueSuffix = Date.now();
      const p1 = await prisma.medicineProduct.create({
        data: {
          internalCode: `BK-UNREF-1-${uniqueSuffix}`,
          brandName: `Bulk Unref Med 1 ${uniqueSuffix}`,
          genericName: 'Bulk Unref Generic',
          strength: '500 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Test Pharma Ltd',
          packSize: '10 Strips',
          gstRate: 5,
          mrp: 100,
          isActive: true,
        },
      });
      const p2 = await prisma.medicineProduct.create({
        data: {
          internalCode: `BK-UNREF-2-${uniqueSuffix}`,
          brandName: `Bulk Unref Med 2 ${uniqueSuffix}`,
          genericName: 'Bulk Unref Generic',
          strength: '250 mg',
          dosageForm: 'Capsule',
          manufacturer: 'Test Pharma Ltd',
          packSize: '10 Strips',
          gstRate: 12,
          mrp: 150,
          isActive: true,
        },
      });
      createdProductIds.push(p1.id, p2.id);

      const res = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: [p1.id, p2.id] });

      expect(res.status).toBe(200);
      expect(res.body.deleted).toContain(p1.brandName);
      expect(res.body.deleted).toContain(p2.brandName);
      expect(res.body.totalProcessed).toBe(2);

      // Verify permanent deletion from database
      const check1 = await prisma.medicineProduct.findUnique({ where: { id: p1.id } });
      const check2 = await prisma.medicineProduct.findUnique({ where: { id: p2.id } });
      expect(check1).toBeNull();
      expect(check2).toBeNull();
    });

    it('2. Super Admin bulk-deletes referenced products safely by archiving (isActive: false)', async () => {
      const uniqueSuffix = Date.now();
      const pRef = await prisma.medicineProduct.create({
        data: {
          internalCode: `BK-REF-1-${uniqueSuffix}`,
          brandName: `Bulk Ref Med 1 ${uniqueSuffix}`,
          genericName: 'Bulk Ref Generic',
          strength: '10 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Test Pharma Ltd',
          packSize: '10 Strips',
          gstRate: 5,
          mrp: 50,
          isActive: true,
        },
      });
      createdProductIds.push(pRef.id);

      // Create an active stock batch to link this product
      const batch = await prisma.stockBatch.create({
        data: {
          branchId: testBranchId,
          medicineId: pRef.id,
          batchNumber: `BATCH-BK-${uniqueSuffix}`,
          expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
          quantityReceived: 25,
          availableQuantity: 25,
          purchaseRate: 20,
          sellingPrice: 35,
          mrp: 50,
          status: 'ACTIVE',
        },
      });

      const res = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: [pRef.id] });

      expect(res.status).toBe(200);
      expect(res.body.archived).toContain(pRef.brandName);
      expect(res.body.totalProcessed).toBe(1);

      // Product must NOT be deleted; it must be soft-archived
      const check = await prisma.medicineProduct.findUnique({ where: { id: pRef.id } });
      expect(check).not.toBeNull();
      expect(check?.isActive).toBe(false);

      // Batch must remain completely intact
      const batchCheck = await prisma.stockBatch.findUnique({ where: { id: batch.id } });
      expect(batchCheck).not.toBeNull();
      expect(batchCheck?.availableQuantity).toBe(25);
    });

    it('3. Mixed selection correctly partitions into deleted and archived within a single transaction', async () => {
      const uniqueSuffix = Date.now();
      // 1 unreferenced product
      const pUnref = await prisma.medicineProduct.create({
        data: {
          internalCode: `BK-MIX-U-${uniqueSuffix}`,
          brandName: `Bulk Mix Unref ${uniqueSuffix}`,
          genericName: 'Mix Generic',
          strength: '100 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Test Pharma Ltd',
          packSize: '10 Strips',
          gstRate: 5,
          mrp: 80,
          isActive: true,
        },
      });
      // 1 referenced product
      const pRef = await prisma.medicineProduct.create({
        data: {
          internalCode: `BK-MIX-R-${uniqueSuffix}`,
          brandName: `Bulk Mix Ref ${uniqueSuffix}`,
          genericName: 'Mix Generic',
          strength: '200 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Test Pharma Ltd',
          packSize: '10 Strips',
          gstRate: 5,
          mrp: 120,
          isActive: true,
        },
      });
      createdProductIds.push(pUnref.id, pRef.id);

      // Attach batch to referenced product
      await prisma.stockBatch.create({
        data: {
          branchId: testBranchId,
          medicineId: pRef.id,
          batchNumber: `BATCH-MIX-${uniqueSuffix}`,
          expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          quantityReceived: 10,
          availableQuantity: 10,
          purchaseRate: 50,
          sellingPrice: 80,
          mrp: 120,
          status: 'ACTIVE',
        },
      });

      const res = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: [pUnref.id, pRef.id] });

      expect(res.status).toBe(200);
      expect(res.body.deleted).toContain(pUnref.brandName);
      expect(res.body.archived).toContain(pRef.brandName);
      expect(res.body.totalProcessed).toBe(2);

      // Verify unreferenced is purged
      const unrefCheck = await prisma.medicineProduct.findUnique({ where: { id: pUnref.id } });
      expect(unrefCheck).toBeNull();

      // Verify referenced is archived
      const refCheck = await prisma.medicineProduct.findUnique({ where: { id: pRef.id } });
      expect(refCheck).not.toBeNull();
      expect(refCheck?.isActive).toBe(false);
    });

    it('4. Branch Admin bulk-delete returns HTTP 403 with standardized guidance and leaves DB unchanged', async () => {
      const uniqueSuffix = Date.now();
      const p = await prisma.medicineProduct.create({
        data: {
          internalCode: `BK-BA-PROT-${uniqueSuffix}`,
          brandName: `Bulk Protected ${uniqueSuffix}`,
          genericName: 'Protected Generic',
          strength: '50 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Test Pharma Ltd',
          packSize: '10 Strips',
          gstRate: 5,
          mrp: 90,
          isActive: true,
        },
      });
      createdProductIds.push(p.id);

      const res = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({ ids: [p.id] });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        'You do not have permission to delete these records. Please contact the Super Admin for assistance.'
      );

      // Product must remain unchanged
      const check = await prisma.medicineProduct.findUnique({ where: { id: p.id } });
      expect(check).not.toBeNull();
      expect(check?.isActive).toBe(true);
    });

    it('5. Duplicate IDs are deduplicated and processed exactly once', async () => {
      const uniqueSuffix = Date.now();
      const p = await prisma.medicineProduct.create({
        data: {
          internalCode: `BK-DUP-${uniqueSuffix}`,
          brandName: `Bulk Dup Med ${uniqueSuffix}`,
          genericName: 'Dup Generic',
          strength: '50 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Test Pharma Ltd',
          packSize: '10 Strips',
          gstRate: 5,
          mrp: 60,
          isActive: true,
        },
      });
      createdProductIds.push(p.id);

      // Send the same ID three times in the request
      const res = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: [p.id, p.id, p.id] });

      expect(res.status).toBe(200);
      expect(res.body.totalProcessed).toBe(1);
      expect(res.body.deleted.length).toBe(1);
    });

    it('6. Invalid input validation: empty or missing IDs return HTTP 400', async () => {
      const res1 = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: [] });
      expect(res1.status).toBe(400);
      expect(res1.body.message).toBe('No product IDs provided');

      const res2 = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: ['   ', ''] });
      expect(res2.status).toBe(400);
      expect(res2.body.message).toBe('No valid product IDs provided');
    });

    it('7. Exceeding batch size limit (>100 IDs) returns HTTP 400', async () => {
      const tooManyIds = Array.from({ length: 105 }, (_, i) => `mock-prod-id-${i}`);
      const res = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: tooManyIds });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('exceeds the maximum limit of 100 products');
    });

    it('8. Non-existent IDs are captured in failed array without throwing transaction error', async () => {
      const fakeId1 = 'non-existent-id-001';
      const fakeId2 = 'non-existent-id-002';

      const res = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: [fakeId1, fakeId2] });

      expect(res.status).toBe(200);
      expect(res.body.failed.length).toBe(2);
      expect(res.body.totalProcessed).toBe(0);
    });
  });

  // =========================================================================
  // DEF-006: PURCHASE INVOICE & SUPPLIER BULK DELETION — BOUNDED TRANSACTIONS
  // =========================================================================
  describe('Phase 3: Purchase Invoices & Suppliers Bulk Deletion — Bounded Transactions and Safety', () => {
    let testSupplierId = '';
    let testInvoiceReceivedId = '';
    let testInvoiceDraftId = '';
    let testInvoiceWithReturnId = '';
    let testReturnId = '';

    beforeAll(async () => {
      // Create a test supplier
      const supplier = await prisma.supplier.create({
        data: {
          name: `Bulk Test Supplier ${Date.now()}`,
          phone: '9876543210',
          email: `supplier_${Date.now()}@test.com`,
          gstin: '37AAAAA0000A1Z5',
          isActive: true,
        },
      });
      testSupplierId = supplier.id;

      // Create a RECEIVED invoice
      const invReceived = await prisma.purchaseInvoice.create({
        data: {
          invoiceNumber: `INV-REC-${Date.now()}`,
          supplierInvoiceNumber: `SUPP-REC-${Date.now()}`,
          supplierId: testSupplierId,
          branchId: testBranchId,
          invoiceDate: new Date(),
          subtotal: 1000,
          taxTotal: 120,
          grandTotal: 1120,
          status: 'RECEIVED',
          receivedByUserId: 'test-user',
        },
      });
      testInvoiceReceivedId = invReceived.id;

      // Create a DRAFT invoice
      const invDraft = await prisma.purchaseInvoice.create({
        data: {
          invoiceNumber: `INV-DFT-${Date.now()}`,
          supplierInvoiceNumber: `SUPP-DFT-${Date.now()}`,
          supplierId: testSupplierId,
          branchId: testBranchId,
          invoiceDate: new Date(),
          subtotal: 500,
          taxTotal: 60,
          grandTotal: 560,
          status: 'DRAFT',
          receivedByUserId: 'test-user',
        },
      });
      testInvoiceDraftId = invDraft.id;

      // Create an invoice with an associated return
      const invWithReturn = await prisma.purchaseInvoice.create({
        data: {
          invoiceNumber: `INV-RET-${Date.now()}`,
          supplierInvoiceNumber: `SUPP-RET-${Date.now()}`,
          supplierId: testSupplierId,
          branchId: testBranchId,
          invoiceDate: new Date(),
          subtotal: 800,
          taxTotal: 96,
          grandTotal: 896,
          status: 'RECEIVED',
          receivedByUserId: 'test-user',
        },
      });
      testInvoiceWithReturnId = invWithReturn.id;

      const purchaseReturn = await prisma.purchaseReturn.create({
        data: {
          returnNumber: `PR-TEST-${Date.now()}`,
          purchaseInvoiceId: invWithReturn.id,
          supplierId: testSupplierId,
          branchId: testBranchId,
          subtotal: 400,
          taxTotal: 48,
          grandTotal: 448,
          reason: 'Damaged strips',
          status: 'COMPLETED',
          createdById: 'test-user',
        },
      });
      testReturnId = purchaseReturn.id;
    });

    afterAll(async () => {
      try {
        if (testReturnId) await prisma.purchaseReturn.deleteMany({ where: { id: testReturnId } });
        if (testInvoiceWithReturnId) await prisma.purchaseInvoice.deleteMany({ where: { id: testInvoiceWithReturnId } });
        if (testInvoiceDraftId) await prisma.purchaseInvoice.deleteMany({ where: { id: testInvoiceDraftId } });
        if (testInvoiceReceivedId) await prisma.purchaseInvoice.deleteMany({ where: { id: testInvoiceReceivedId } });
        if (testSupplierId) await prisma.supplier.deleteMany({ where: { id: testSupplierId } });
      } catch (_) {}
    });

    it('1. Non-Super Admin (Branch Admin) receives HTTP 403 with standardized guidance', async () => {
      const res = await request(app)
        .post('/api/purchases/bulk-delete')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({ ids: [testInvoiceDraftId] });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        'You do not have permission to delete these records. Please contact the Super Admin for assistance.'
      );
    });

    it('2. Invalid input validation: empty or missing IDs return HTTP 400', async () => {
      const res1 = await request(app)
        .post('/api/purchases/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: [] });
      expect(res1.status).toBe(400);
      expect(res1.body.message).toBe('No invoice IDs provided');

      const res2 = await request(app)
        .post('/api/purchases/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: ['   ', ''] });
      expect(res2.status).toBe(400);
      expect(res2.body.message).toBe('No valid invoice IDs provided');
    });

    it('3. Exceeding batch size limit (>100 IDs) returns HTTP 400', async () => {
      const tooManyIds = Array.from({ length: 105 }, (_, i) => `mock-inv-id-${i}`);
      const res = await request(app)
        .post('/api/purchases/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: tooManyIds });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('exceeds the maximum limit of 100 invoices');
    });

    it('4. Invoice with associated purchase return fails gracefully and is reported in failed array', async () => {
      const res = await request(app)
        .post('/api/purchases/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: [testInvoiceWithReturnId] });

      expect(res.status).toBe(200);
      expect(res.body.failed.length).toBe(1);
      expect(res.body.failed[0].reason).toContain('associated purchase returns and cannot be deleted');
      expect(res.body.deleted.length).toBe(0);

      // Verify invoice still exists in DB
      const invoice = await prisma.purchaseInvoice.findUnique({ where: { id: testInvoiceWithReturnId } });
      expect(invoice).not.toBeNull();
    });

    it('5. Super Admin bulk-cancels RECEIVED purchase invoice (updates status to CANCELLED)', async () => {
      const res = await request(app)
        .post('/api/purchases/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: [testInvoiceReceivedId] });

      expect(res.status).toBe(200);
      expect(res.body.deleted.length).toBe(1);

      const check = await prisma.purchaseInvoice.findUnique({ where: { id: testInvoiceReceivedId } });
      expect(check?.status).toBe('CANCELLED');
    });

    it('6. Super Admin bulk-deletes DRAFT purchase invoice permanently', async () => {
      const res = await request(app)
        .post('/api/purchases/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: [testInvoiceDraftId] });

      expect(res.status).toBe(200);
      expect(res.body.deleted.length).toBe(1);

      const check = await prisma.purchaseInvoice.findUnique({ where: { id: testInvoiceDraftId } });
      expect(check).toBeNull();
    });

    it('7. Super Admin bulk-deletes unreferenced supplier permanently', async () => {
      const unrefSupplier = await prisma.supplier.create({
        data: {
          name: `Unref Supplier ${Date.now()}`,
          phone: '9876543211',
          email: `unref_${Date.now()}@test.com`,
          gstin: '37BBBBB0000B1Z5',
          isActive: true,
        },
      });

      const res = await request(app)
        .post('/api/suppliers/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: [unrefSupplier.id] });

      expect(res.status).toBe(200);
      expect(res.body.deleted.length).toBe(1);

      const check = await prisma.supplier.findUnique({ where: { id: unrefSupplier.id } });
      expect(check).toBeNull();
    });

    it('8. Super Admin safely archives referenced supplier (isActive: false)', async () => {
      // testSupplierId has purchases associated with it
      const res = await request(app)
        .post('/api/suppliers/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ ids: [testSupplierId] });

      expect(res.status).toBe(200);
      expect(res.body.archived.length).toBe(1);

      const check = await prisma.supplier.findUnique({ where: { id: testSupplierId } });
      expect(check).not.toBeNull();
      expect(check?.isActive).toBe(false);
    });
  });
});

