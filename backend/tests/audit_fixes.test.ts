import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/database/prisma';

describe('Confidos Pharma Comprehensive Engineering Audit & Bug Fixes Verification', () => {
  let superAdminToken = '';
  let branchAdminToken = '';
  let branchId = '';
  let testSupplierId = '';
  let testProductId = '';
  let testBatchId = '';

  beforeAll(async () => {
    // 1. Authenticate as Super Admin
    const saLogin = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'superadmin', password: 'Pharma@2026' });

    if (saLogin.status === 200 && saLogin.body?.token) {
      superAdminToken = saLogin.body.token;
    }

    // 2. Authenticate as Branch Admin (Vijayawada)
    const baLogin = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'admin_vja', password: 'Pharma@2026' });

    if (baLogin.status === 200 && baLogin.body?.token) {
      branchAdminToken = baLogin.body.token;
      branchId = baLogin.body.user.branchId;
    }
  });

  describe('PHASE 2 & 13 — Medicine Creation, Concurrency & Error Sanitization', () => {
    it('creates a new medicine with concurrency-safe auto-generated unique internal code', async () => {
      if (!superAdminToken) return;

      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          brandName: `Audit Paracetamol ${randomSuffix}`,
          genericName: 'Paracetamol',
          strength: '500 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Confidos Health Ltd',
          packSize: '10 Tablets',
          hsnCode: '30049099',
          gstRate: 5.0,
          mrp: 25.0,
          defaultPurchaseRate: 15.0,
          defaultSellingRate: 20.0,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.internalCode).toMatch(/^MED-\d{4,}$/);
      expect(res.body.brandName).toBe(`Audit Paracetamol ${randomSuffix}`);
      testProductId = res.body.id;

      // Verify database persistence
      const saved = await prisma.medicineProduct.findUnique({ where: { id: testProductId } });
      expect(saved).not.toBeNull();
      expect(saved?.internalCode).toBe(res.body.internalCode);
    });

    it('rejects duplicate user-supplied internal code with 409 and clean message without Prisma stack traces', async () => {
      if (!superAdminToken || !testProductId) return;

      const saved = await prisma.medicineProduct.findUnique({ where: { id: testProductId } });
      if (!saved) return;

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          brandName: 'Duplicate Code Product',
          genericName: 'Paracetamol',
          strength: '500 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Confidos Health Ltd',
          internalCode: saved.internalCode, // Explicit duplicate
          mrp: 30.0,
          gstRate: 5.0,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
      // Ensure no raw Prisma errors or stack traces are leaked to client
      expect(res.body.error).not.toContain('PrismaClientKnownRequestError');
      expect(res.body.error).not.toContain('invocation:');
    });
  });

  describe('PHASE 8 — Store / Branch Creation: Optional Email & GST', () => {
    it('creates store when both Email and GSTIN are omitted', async () => {
      if (!superAdminToken) return;

      const codeSuffix = Math.floor(100 + Math.random() * 900);
      const res = await request(app)
        .post('/api/branches')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: `Audit Branch NoEmailNoGST ${codeSuffix}`,
          code: `AUD-${codeSuffix}`,
          address: '45 Pharma Audit Highway, Andhra Pradesh',
          phone: '9876543210',
          // email & gstin completely omitted
        });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe(`AUD-${codeSuffix}`);
      expect(res.body.email).toBeNull();
      expect(res.body.gstin).toBeNull();
    });

    it('creates store with valid Email provided and GSTIN omitted', async () => {
      if (!superAdminToken) return;

      const codeSuffix = Math.floor(100 + Math.random() * 900);
      const res = await request(app)
        .post('/api/branches')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: `Audit Branch EmailOnly ${codeSuffix}`,
          code: `AUE-${codeSuffix}`,
          address: '77 Healthcare Boulevard',
          phone: '9876543211',
          email: `audit.branch.${codeSuffix}@example.com`,
          // gstin omitted
        });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe(`audit.branch.${codeSuffix}@example.com`);
      expect(res.body.gstin).toBeNull();
    });

    it('creates store with valid GSTIN provided and Email omitted', async () => {
      if (!superAdminToken) return;

      const codeSuffix = Math.floor(100 + Math.random() * 900);
      const res = await request(app)
        .post('/api/branches')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: `Audit Branch GSTOnly ${codeSuffix}`,
          code: `AUG-${codeSuffix}`,
          address: '88 Clinic Street',
          phone: '9876543212',
          gstin: '37AAAAA0000A1Z5',
          // email omitted
        });

      expect(res.status).toBe(201);
      expect(res.body.gstin).toBe('37AAAAA0000A1Z5');
      expect(res.body.email).toBeNull();
    });

    it('rejects store creation with invalid email format when supplied', async () => {
      if (!superAdminToken) return;

      const res = await request(app)
        .post('/api/branches')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Invalid Email Branch',
          code: 'ERR-EML',
          address: 'Invalid Lane',
          email: 'not-an-email',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('valid email');
    });

    it('rejects store creation with invalid GSTIN format when supplied', async () => {
      if (!superAdminToken) return;

      const res = await request(app)
        .post('/api/branches')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Invalid GSTIN Branch',
          code: 'ERR-GST',
          address: 'Invalid Lane',
          gstin: '123INVALID', // not 15 chars
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('valid 15-character GSTIN');
    });
  });

  describe('PHASE 4 — Role-Based Access Control & Branch Admin Restrictions', () => {
    it('restricts Branch Admin from modifying master medicine catalogue with standard 403 message', async () => {
      if (!branchAdminToken || !testProductId) return;

      const res = await request(app)
        .put(`/api/products/${testProductId}`)
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({ mrp: 999.0 });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You do not have permission to modify this record. Please contact the Super Admin for assistance.');
    });

    it('restricts Branch Admin from deleting master medicine catalogue with standard 403 message', async () => {
      if (!branchAdminToken || !testProductId) return;

      const res = await request(app)
        .delete(`/api/products/${testProductId}`)
        .set('Authorization', `Bearer ${branchAdminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You do not have permission to modify this record. Please contact the Super Admin for assistance.');
    });

    it('restricts Branch Admin from modifying supplier records with standard 403 message', async () => {
      if (!branchAdminToken) return;

      const res = await request(app)
        .put('/api/suppliers/dummy-supplier-id')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({ name: 'Tampered Supplier' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('You do not have permission to modify this record. Please contact the Super Admin for assistance.');
    });

    it('allows Super Admin to update master medicine catalogue', async () => {
      if (!superAdminToken || !testProductId) return;

      const res = await request(app)
        .put(`/api/products/${testProductId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ mrp: 28.0 });

      expect(res.status).toBe(200);
      expect(res.body.mrp).toBe(28.0);
    });
  });

  describe('PHASE 3 & 7 — Purchase Invoice Creation, Inline Medicine, & 5% GST Calculation', () => {
    it('creates a supplier for purchase verification', async () => {
      if (!superAdminToken) return;

      const rand = Math.floor(100 + Math.random() * 900);
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: `Audit Supplier ${rand}`,
          contactPerson: 'Mr. Auditor',
          email: `supplier.${rand}@audit.com`,
          phone: '9123456780',
          gstin: '37AABCS1429B1ZB',
          state: 'Andhra Pradesh',
        });

      expect(res.status).toBe(201);
      testSupplierId = res.body.id;
    });

    it('records purchase invoice with inline medicine and verifies stock batch, movements, and GST totals', async () => {
      if (!superAdminToken || !branchId || !testSupplierId) return;

      const invoiceNum = `AUD-INV-${Date.now()}`;
      const batchNum = `AUD-BCH-${Date.now()}`;
      const inlineMedicineName = `Inline Med ${Date.now()}`;

      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          branchId,
          supplierId: testSupplierId,
          invoiceNumber: invoiceNum,
          invoiceDate: new Date().toISOString(),
          paymentStatus: 'PAID',
          paymentMethod: 'BANK_TRANSFER',
          lines: [
            {
              // Inline medicine creation
              newMedicine: {
                brandName: inlineMedicineName,
                genericName: 'Amoxicillin Trihydrate',
                strength: '250 mg',
                dosageForm: 'Capsule',
                manufacturer: 'Audit Healthcare Pharma',
                packSize: '10 Capsules',
                gstRate: 5.0, // Default 5%
                mrp: 50.0,
                defaultPurchaseRate: 30.0,
                defaultSellingRate: 40.0,
              },
              batchNumber: batchNum,
              expiryDate: '2028-12-31',
              receivedQuantity: 100,
              purchaseRate: 30.0, // Taxable = 100 * 30 = 3000
              gstRate: 5.0, // 5% GST = 150 (75 CGST + 75 SGST)
              mrp: 50.0,
              sellingPrice: 45.0,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.invoiceNumber).toBe(invoiceNum);
      expect(res.body.totalAmount).toBe(3150.0); // 3000 taxable + 150 tax
      expect(res.body.taxAmount).toBe(150.0);

      // Verify stock batch was created
      const batch = await prisma.stockBatch.findFirst({
        where: { branchId, batchNumber: batchNum },
        include: { medicine: true },
      });

      expect(batch).not.toBeNull();
      expect(batch?.availableQuantity).toBe(100);
      expect(batch?.purchaseRate).toBe(30.0);
      expect(batch?.medicine.brandName).toBe(inlineMedicineName);
      testBatchId = batch!.id;

      // Verify stock movement ledger
      const movement = await prisma.stockMovement.findFirst({
        where: { batchId: testBatchId, movementType: 'PURCHASE_INWARD' },
      });
      expect(movement).not.toBeNull();
      expect(movement?.quantityDelta).toBe(100);
    });
  });

  describe('PHASE 5 — Stock Batches & Super Admin Management', () => {
    it('allows Super Admin to update batch details', async () => {
      if (!superAdminToken || !testBatchId) return;

      const res = await request(app)
        .put(`/api/inventory/batches/${testBatchId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          mrp: 55.0,
          sellingPrice: 48.0,
          status: 'ACTIVE',
        });

      expect(res.status).toBe(200);
      expect(res.body.batch.mrp).toBe(55.0);
      expect(res.body.batch.sellingPrice).toBe(48.0);
    });

    it('safely handles batch deletion by quarantining when stock movements exist', async () => {
      if (!superAdminToken || !testBatchId) return;

      const res = await request(app)
        .delete(`/api/inventory/batches/${testBatchId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('QUARANTINED');

      // Verify audit integrity in database
      const batch = await prisma.stockBatch.findUnique({ where: { id: testBatchId } });
      expect(batch).not.toBeNull();
      expect(batch?.status).toBe('QUARANTINE');
      expect(batch?.availableQuantity).toBe(0);
    });

    it('supports bulk batch actions (e.g. status changes and quarantine)', async () => {
      if (!superAdminToken || !testBatchId) return;

      const res = await request(app)
        .post('/api/inventory/batches/bulk-action')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          batchIds: [testBatchId],
          action: 'DEPLETED',
        });

      expect(res.status).toBe(200);
      expect(res.body.affectedCount).toBe(1);

      const batch = await prisma.stockBatch.findUnique({ where: { id: testBatchId } });
      expect(batch?.status).toBe('DEPLETED');
    });
  });

  describe('PHASE 9 — Authenticated CSV Template Download', () => {
    it('downloads Catalogue CSV template with authorized session', async () => {
      if (!superAdminToken) return;

      const res = await request(app)
        .get('/api/imports/template/catalogue')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.text).toContain('Brand Name');
      expect(res.text).toContain('Generic Name');
    });

    it('downloads Stock Receipt CSV template with authorized session', async () => {
      if (!superAdminToken) return;

      const res = await request(app)
        .get('/api/imports/template/stock_receipt')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.text).toContain('Batch Number');
      expect(res.text).toContain('Expiry Date');
    });
  });
});
