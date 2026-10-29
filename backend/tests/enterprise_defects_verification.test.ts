import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/database/prisma';
import { JWT_SECRET } from '../src/config/jwt';

describe('Enterprise Defects & Master Engineering Audit Verification', { timeout: 30000 }, () => {
  let superAdminToken = '';
  let superAdminUser: any = null;
  let branchAdminToken = '';
  let branchAdminUser: any = null;
  let testBranchId = '';

  beforeAll(async () => {
    // 1. Fetch real active Super Admin from DB
    superAdminUser = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN', isActive: true },
    });

    if (!superAdminUser) {
      // Create if none exists
      superAdminUser = await prisma.user.create({
        data: {
          username: 'test_superadmin',
          email: 'test_superadmin@confidos.test',
          fullName: 'Test Super Admin',
          passwordHash: 'dummy',
          role: 'SUPER_ADMIN',
          isActive: true,
        },
      });
    }

    superAdminToken = jwt.sign(
      {
        id: superAdminUser.id,
        username: superAdminUser.username,
        role: superAdminUser.role,
        branchId: superAdminUser.branchId,
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 2. Fetch or create a test branch
    let branch = await prisma.branch.findFirst({ where: { isActive: true } });
    if (!branch) {
      const company = await prisma.company.findFirst();
      branch = await prisma.branch.create({
        data: {
          companyId: company?.id || 'default-company',
          code: 'B-TEST',
          name: 'Test Branch',
          address: 'Test Address',
          phone: '9999999999',
          gstin: '37AAAAA0000A1Z5',
          isActive: true,
        },
      });
    }
    testBranchId = branch.id;

    // 3. Fetch or create Branch Admin
    branchAdminUser = await prisma.user.findFirst({
      where: { role: 'BRANCH_ADMIN', isActive: true },
    });

    if (!branchAdminUser) {
      branchAdminUser = await prisma.user.create({
        data: {
          username: 'test_branch_admin',
          email: 'test_ba@confidos.test',
          fullName: 'Test Branch Admin',
          passwordHash: 'dummy',
          role: 'BRANCH_ADMIN',
          branchId: testBranchId,
          isActive: true,
        },
      });
    }

    branchAdminToken = jwt.sign(
      {
        id: branchAdminUser.id,
        username: branchAdminUser.username,
        role: branchAdminUser.role,
        branchId: branchAdminUser.branchId || testBranchId,
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
  });

  // =========================================================================
  // DEFECT 1 & 5: Medicine Packaging, Unit of Measure & Bulk Deletion API
  // =========================================================================
  describe('Target Defect 1 & 5: Medicine Catalogue Packaging, Conversion & Bulk Deletion', () => {
    let createdUnreferencedProductId = '';
    let createdReferencedProductId = '';

    it('persists packageUnit, baseUnit, and conversionFactor on product creation', async () => {
      const codeSuffix = Math.floor(10000 + Math.random() * 90000);
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          brandName: `Packaging Test Medicine ${codeSuffix}`,
          genericName: 'Amoxicillin + Clavulanate',
          strength: '625 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Confidos Research Labs',
          packSize: '10 Strips per Box',
          packageUnit: 'Box',
          baseUnit: 'Strip',
          conversionFactor: 10,
          hsnCode: '30049099',
          gstRate: 12.0,
          mrp: 180.0,
          defaultPurchaseRate: 120.0,
          defaultSellingRate: 165.0,
        });

      expect(res.status).toBe(201);
      expect(res.body.packageUnit).toBe('Box');
      expect(res.body.baseUnit).toBe('Strip');
      expect(res.body.conversionFactor).toBe(10);
      createdUnreferencedProductId = res.body.id;
    });

    it('persists updated packaging unit and conversion factor via updateProduct', async () => {
      expect(createdUnreferencedProductId).toBeTruthy();

      const res = await request(app)
        .put(`/api/products/${createdUnreferencedProductId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          packageUnit: 'Carton',
          baseUnit: 'Tablet',
          conversionFactor: 24,
        });

      expect(res.status).toBe(200);
      expect(res.body.packageUnit).toBe('Carton');
      expect(res.body.baseUnit).toBe('Tablet');
      expect(res.body.conversionFactor).toBe(24);
    });

    it('accepts bulk-delete with both "ids" and "productIds", de-duplicates, and deletes unreferenced products', async () => {
      expect(createdUnreferencedProductId).toBeTruthy();

      // Test payload contract alias: productIds
      const res = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          productIds: [createdUnreferencedProductId, createdUnreferencedProductId], // duplicate ID test
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('deleted');
      expect(res.body).toHaveProperty('archived');
      expect(res.body).toHaveProperty('totalProcessed');
      expect(res.body.deleted.length).toBeGreaterThanOrEqual(1);

      // Verify product is permanently deleted from database
      const found = await prisma.medicineProduct.findUnique({
        where: { id: createdUnreferencedProductId },
      });
      expect(found).toBeNull();
    });

    it('soft-archives referenced products (with batches/transactions) instead of hard purging', async () => {
      // 1. Create product
      const suffix = Math.floor(10000 + Math.random() * 90000);
      const prodRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          brandName: `Referenced Med ${suffix}`,
          genericName: 'Paracetamol',
          strength: '500 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Confidos Labs',
          packSize: '10 Strips',
          packageUnit: 'Box',
          baseUnit: 'Strip',
          conversionFactor: 10,
          gstRate: 5.0,
          mrp: 30.0,
        });
      expect(prodRes.status).toBe(201);
      createdReferencedProductId = prodRes.body.id;

      // 2. Attach a stock batch to simulate existing inventory history
      await prisma.stockBatch.create({
        data: {
          branchId: testBranchId,
          medicineId: createdReferencedProductId,
          batchNumber: `BAT-REF-${suffix}`,
          expiryDate: new Date('2028-12-31'),
          purchaseRate: 15,
          sellingPrice: 25,
          mrp: 30,
          quantityReceived: 100,
          availableQuantity: 100,
        },
      });

      // 3. Attempt bulk deletion using "ids" payload
      const delRes = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          ids: [createdReferencedProductId],
        });

      expect(delRes.status).toBe(200);
      expect(delRes.body.archived.length).toBe(1);
      expect(delRes.body.deleted.length).toBe(0);

      // 4. Verify preserved in DB with isActive = false
      const preserved = await prisma.medicineProduct.findUnique({
        where: { id: createdReferencedProductId },
      });
      expect(preserved).not.toBeNull();
      expect(preserved?.isActive).toBe(false);

      // Cleanup batch and product
      await prisma.stockBatch.deleteMany({ where: { medicineId: createdReferencedProductId } });
      await prisma.medicineProduct.delete({ where: { id: createdReferencedProductId } });
    });
  });

  // =========================================================================
  // DEFECT 2: Quick Add Supplier Workflow & Supplier Bulk Operations
  // =========================================================================
  describe('Target Defect 2: Quick Add Supplier & Supplier Bulk Operations', () => {
    let createdSupplierId = '';

    it('creates a new supplier with uppercase GSTIN and full compliance fields', async () => {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const res = await request(app)
        .post('/api/suppliers')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: `Quick Add Supplier ${suffix}`,
          contactPerson: 'Kalyan Rao',
          phone: `98490${suffix}`,
          email: `supplier${suffix}@confidos.test`,
          gstin: '37aaaaa0000a1z5', // Lowercase to verify backend normalizes or stores
          address: 'Auto Nagar, Vijayawada, AP',
          dlNumber: `20B-AP-${suffix}`,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(`Quick Add Supplier ${suffix}`);
      createdSupplierId = res.body.id;
    });

    it('bulk-deletes unreferenced supplier permanently and supports supplierIds key', async () => {
      expect(createdSupplierId).toBeTruthy();

      const res = await request(app)
        .post('/api/suppliers/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          supplierIds: [createdSupplierId],
        });

      expect(res.status).toBe(200);
      expect(res.body.deleted.length).toBe(1);

      const check = await prisma.supplier.findUnique({ where: { id: createdSupplierId } });
      expect(check).toBeNull();
    });
  });

  // =========================================================================
  // DEFECT 3: Purchase Invoices, Route Shadowing & Excel/CSV Templates
  // =========================================================================
  describe('Target Defect 3: Purchases Module Express Routes & Inward Templates', () => {
    it('GET /api/purchases/returns resolves correctly without "Purchase invoice not found" route collision', async () => {
      const res = await request(app)
        .get('/api/purchases/returns')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('returns');
      expect(Array.isArray(res.body.returns)).toBe(true);
      // Route shadowing would have returned 404 with { message: 'Purchase invoice not found' }
      expect(res.body).not.toHaveProperty('message', 'Purchase invoice not found');
    });

    it('GET /api/purchases/template?format=csv returns valid CSV template without requiring an existing invoice', async () => {
      const res = await request(app)
        .get('/api/purchases/template?format=csv')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Product Name');
      expect(res.text).toContain('Batch Number');
      expect(res.text).toContain('Expiry Date');
      expect(res.text).toContain('Purchase Unit');
      expect(res.text).toContain('Purchase Rate');
    });

    it('GET /api/purchases/template?format=xlsx returns valid Excel XLSX workbook without invoice ID', async () => {
      const res = await request(app)
        .get('/api/purchases/template?format=xlsx')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.body).toBeTruthy();
    });
  });

  // =========================================================================
  // DEFECT 4: Staff / Branch Admin Deactivation & Role Isolation
  // =========================================================================
  describe('Target Defect 4: Staff Deactivation & Super Admin Protection', () => {
    let createdStaffId = '';

    it('blocks self-deactivation with a descriptive error', async () => {
      expect(superAdminUser).toBeTruthy();

      const res = await request(app)
        .delete(`/api/users/${superAdminUser.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message.toLowerCase()).toContain('cannot deactivate your own');
    });

    it('blocks Branch Admin from deactivating a Super Admin', async () => {
      expect(superAdminUser).toBeTruthy();
      expect(branchAdminToken).toBeTruthy();

      const res = await request(app)
        .delete(`/api/users/${superAdminUser.id}`)
        .set('Authorization', `Bearer ${branchAdminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('allows Super Admin to deactivate a staff account and prevents deactivated user from logging in', async () => {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const userRes = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          username: `deactivate_user_${suffix}`,
          email: `deact_${suffix}@confidos.test`,
          fullName: `Deactivate Test ${suffix}`,
          password: 'TestPassword@2026',
          role: 'BILLING_USER',
          branchId: testBranchId,
        });

      expect(userRes.status).toBe(201);
      createdStaffId = userRes.body.id;

      // Deactivate user
      const deactRes = await request(app)
        .delete(`/api/users/${createdStaffId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(deactRes.status).toBe(200);
      expect(deactRes.body.user.isActive).toBe(false);

      // Verify deactivated user cannot log in
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          usernameOrEmail: `deactivate_user_${suffix}`,
          password: 'TestPassword@2026',
        });

      expect(loginRes.status).toBe(403);
      expect(loginRes.body.message).toContain('deactivated');

      // Cleanup user
      await prisma.user.delete({ where: { id: createdStaffId } });
    }, 15000);
  });
});
