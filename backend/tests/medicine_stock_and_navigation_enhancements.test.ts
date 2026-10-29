import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/database/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'confidos-jwt-secret-key-change-in-production';

describe('Confidos Pharma - Medicine Stock Entry & UI Enhancements Test Suite', { timeout: 30000 }, () => {
  let superAdminToken: string;
  let branchAdminToken: string;
  let billingUserToken: string;
  let branchId: string;
  let branchId2: string;
  let supplierId: string;

  beforeAll(async () => {
    // 1. Fetch or create test branches
    let branch1 = await prisma.branch.findFirst({ where: { isActive: true } });
    if (!branch1) {
      branch1 = await prisma.branch.create({
        data: {
          code: `BR1_${Date.now()}`,
          name: 'Main Pharmacy Center',
          phone: '+91 98765 43210',
          email: 'main@confidos.test',
          address: '123 Healthcare Ave',
          isActive: true,
        },
      });
    }
    branchId = branch1.id;

    let branch2 = await prisma.branch.findFirst({ where: { id: { not: branchId }, isActive: true } });
    if (!branch2) {
      branch2 = await prisma.branch.create({
        data: {
          code: `BR2_${Date.now()}`,
          name: 'Downtown Annex Branch',
          phone: '+91 98765 43211',
          email: 'annex@confidos.test',
          address: '456 Market St',
          isActive: true,
        },
      });
    }
    branchId2 = branch2.id;

    // 2. Fetch or create users
    let superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
    if (!superAdmin) {
      superAdmin = await prisma.user.create({
        data: {
          username: `super_admin_${Date.now()}`,
          email: `admin_${Date.now()}@confidos.test`,
          fullName: 'Super Admin',
          passwordHash: 'dummy',
          role: 'SUPER_ADMIN',
          branchId,
          isActive: true,
        },
      });
    }

    superAdminToken = jwt.sign(
      { id: superAdmin.id, username: superAdmin.username, role: superAdmin.role, branchId },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    let branchAdmin = await prisma.user.findFirst({
      where: { role: 'BRANCH_ADMIN', branchId, isActive: true },
    });
    if (!branchAdmin) {
      branchAdmin = await prisma.user.create({
        data: {
          username: `branch_admin_${Date.now()}`,
          email: `branch_admin_${Date.now()}@confidos.test`,
          fullName: 'Branch Admin',
          passwordHash: 'dummy',
          role: 'BRANCH_ADMIN',
          branchId,
          isActive: true,
        },
      });
    }

    branchAdminToken = jwt.sign(
      { id: branchAdmin.id, username: branchAdmin.username, role: branchAdmin.role, branchId },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    let billingUser = await prisma.user.findFirst({
      where: { role: 'BILLING_USER', branchId, isActive: true },
    });
    if (!billingUser) {
      billingUser = await prisma.user.create({
        data: {
          username: `cashier_${Date.now()}`,
          email: `cashier_${Date.now()}@confidos.test`,
          fullName: 'Billing Cashier',
          passwordHash: 'dummy',
          role: 'BILLING_USER',
          branchId,
          isActive: true,
        },
      });
    }

    billingUserToken = jwt.sign(
      { id: billingUser.id, username: billingUser.username, role: billingUser.role, branchId },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 3. Fetch or create supplier
    let supplier = await prisma.supplier.findFirst({ where: { isActive: true } });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          name: 'Cipla Healthcare Ltd',
          phone: '+91 98888 77777',
          email: 'supply@cipla.test',
          isActive: true,
        },
      });
    }
    supplierId = supplier.id;
  });

  // TEST A: New Medicine with Initial Stock
  describe('Test A: New Medicine with Initial Stock', () => {
    it('creates medicine, records initial stock batch and movement, and displays In Stock accurately', async () => {
      const brandName = `Calpol Plus ${Date.now()}`;
      const genericName = 'Paracetamol 650 mg';
      const batchNumber = `OPN-A-${Date.now().toString().slice(-6)}`;
      const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          brandName,
          genericName,
          dosageForm: 'Tablet',
          manufacturer: 'GSK Pharmaceuticals',
          packSize: '10 Strips',
          baseUnit: 'Strip',
          packageUnit: 'Box',
          conversionFactor: 10,
          hsnCode: '30049099',
          gstRate: 12.0,
          mrp: 150.0,
          defaultPurchaseRate: 100.0,
          defaultSellingRate: 140.0,
          reorderLevel: 20,
          // Initial Stock entry
          initialQuantity: 15, // 15 boxes
          quantityUnit: 'Box',
          batchNumber,
          expiryDate,
          branchId,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.brandName).toBe(brandName);
      // 15 boxes * 10 strips = 150 strips
      expect(res.body.totalAvailableStock).toBe(150);

      // Verify StockBatch was created in DB
      const batch = await prisma.stockBatch.findFirst({
        where: {
          medicineId: res.body.id,
          branchId,
          batchNumber,
        },
      });
      expect(batch).not.toBeNull();
      expect(batch?.availableQuantity).toBe(150);
      expect(batch?.quantityReceived).toBe(150);
      expect(batch?.status).toBe('ACTIVE');

      // Verify StockMovement was recorded
      const movement = await prisma.stockMovement.findFirst({
        where: {
          medicineId: res.body.id,
          batchId: batch!.id,
          referenceDocType: 'INITIAL_STOCK',
        },
      });
      expect(movement).not.toBeNull();
      expect(movement?.quantityDelta).toBe(150);

      // Verify presence in Stock Monitoring with IN_STOCK status
      const monitorRes = await request(app)
        .get(`/api/stock-monitoring?branchId=${branchId}&search=${encodeURIComponent(brandName)}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(monitorRes.status).toBe(200);
      expect(monitorRes.body.items).toHaveLength(1);
      const row = monitorRes.body.items[0];
      expect(row.totalAvailableStock).toBe(150);
      expect(row.stockStatus).toBe('IN_STOCK');
      expect(row.batchCount).toBe(1);
    });
  });

  // TEST B: New Medicine without Initial Stock
  describe('Test B: New Medicine without Initial Stock', () => {
    it('creates medicine in master catalogue without fabricating stock and reports Out of Stock', async () => {
      const brandName = `ZeroStock Med ${Date.now()}`;
      const genericName = 'Montelukast Sodium 10 mg';

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          brandName,
          genericName,
          dosageForm: 'Tablet',
          manufacturer: 'Sun Pharma',
          packSize: '10 Strips',
          baseUnit: 'Strip',
          packageUnit: 'Box',
          conversionFactor: 10,
          gstRate: 12.0,
          mrp: 180.0,
          reorderLevel: 10,
          // Zero initial stock
          initialQuantity: 0,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.totalAvailableStock).toBe(0);

      // Verify NO batches were created in DB
      const batchCount = await prisma.stockBatch.count({
        where: { medicineId: res.body.id },
      });
      expect(batchCount).toBe(0);

      // Verify NO movements were recorded
      const movementCount = await prisma.stockMovement.count({
        where: { medicineId: res.body.id },
      });
      expect(movementCount).toBe(0);

      // Verify Products catalogue reports Out of Stock (totalAvailableStock = 0)
      const prodRes = await request(app)
        .get(`/api/products?search=${encodeURIComponent(brandName)}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(prodRes.status).toBe(200);
      expect(prodRes.body.products).toHaveLength(1);
      expect(prodRes.body.products[0].totalAvailableStock).toBe(0);

      // Verify Stock Monitoring also reports Out of Stock
      const monitorRes = await request(app)
        .get(`/api/stock-monitoring?branchId=${branchId}&stockStatus=OUT_OF_STOCK&search=${encodeURIComponent(brandName)}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(monitorRes.status).toBe(200);
      expect(monitorRes.body.items).toHaveLength(1);
      expect(monitorRes.body.items[0].stockStatus).toBe('OUT_OF_STOCK');
      expect(monitorRes.body.items[0].totalAvailableStock).toBe(0);
    });
  });

  // TEST C: Pack Conversion on Initial Stock
  describe('Test C: Pack Conversion on Initial Stock Entry', () => {
    it('correctly converts 10 boxes (conversionFactor = 100) into 1,000 tablets without double multiplication', async () => {
      const brandName = `PackConv Drug ${Date.now()}`;
      const genericName = 'Metformin 500 mg';
      const batchNum = `OPN-C-${Date.now().toString().slice(-6)}`;

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          brandName,
          genericName,
          dosageForm: 'Tablet',
          manufacturer: 'Torrent Pharma',
          packSize: '1 Box',
          baseUnit: 'Tablet',
          packageUnit: 'Box',
          conversionFactor: 100, // 1 box = 100 tablets
          gstRate: 5.0,
          mrp: 250.0,
          defaultPurchaseRate: 180.0,
          reorderLevel: 200,
          initialQuantity: 10, // 10 boxes
          quantityUnit: 'Box',
          batchNumber: batchNum,
          branchId,
        });

      expect(res.status).toBe(201);
      // 10 boxes * 100 tablets = 1,000 tablets
      expect(res.body.totalAvailableStock).toBe(1000);

      const batch = await prisma.stockBatch.findFirst({
        where: { medicineId: res.body.id, branchId, batchNumber: batchNum },
      });
      expect(batch?.availableQuantity).toBe(1000);

      // Check Stock Monitoring displays 1,000 tablets and 10 Boxes equivalent
      const monitorRes = await request(app)
        .get(`/api/stock-monitoring?branchId=${branchId}&search=${encodeURIComponent(brandName)}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(monitorRes.status).toBe(200);
      const row = monitorRes.body.items[0];
      expect(row.totalAvailableStock).toBe(1000);
      expect(row.packConversion.fullPacks).toBe(10);
      expect(row.packConversion.equivalentPacksText).toBe('10 Boxes');
    });
  });

  // TEST D: Existing Medicine Edit Preservation
  describe('Test D: Existing Medicine Edit Preservation', () => {
    it('preserves existing stock batches and movements when updating product details', async () => {
      // 1. Create medicine with 50 units stock
      const brandName = `EditPreserve ${Date.now()}`;
      const createRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          brandName,
          genericName: 'Pantoprazole 40 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Alkem Laboratories',
          packSize: '10 Strips',
          baseUnit: 'Strip',
          packageUnit: 'Box',
          conversionFactor: 10,
          gstRate: 12.0,
          mrp: 120.0,
          reorderLevel: 10,
          initialQuantity: 50,
          quantityUnit: 'Strip',
          branchId,
        });

      expect(createRes.status).toBe(201);
      const medId = createRes.body.id;

      // Verify batch quantity = 50
      const initialBatch = await prisma.stockBatch.findFirst({
        where: { medicineId: medId, branchId },
      });
      expect(initialBatch?.availableQuantity).toBe(50);

      // 2. Edit medicine details (update manufacturer and genericName)
      const updateRes = await request(app)
        .put(`/api/products/${medId}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          brandName,
          genericName: 'Pantoprazole Gastro-resistant 40 mg',
          manufacturer: 'Alkem Healthcare Ltd Updated',
          mrp: 130.0,
        });

      expect(updateRes.status).toBe(200);

      // 3. Confirm stock batch and quantity remained EXACTLY 50
      const batchAfter = await prisma.stockBatch.findFirst({
        where: { medicineId: medId, branchId },
      });
      expect(batchAfter?.id).toBe(initialBatch?.id);
      expect(batchAfter?.availableQuantity).toBe(50);
      expect(batchAfter?.quantityReceived).toBe(50);
    });
  });

  // TEST E: Combined Generic / Active Ingredient and Strength
  describe('Test E: Combined Generic / Active Ingredient & Strength', () => {
    it('accepts combined genericName without requiring separate strength and performs accurate search', async () => {
      const brandName = `CombinedDrug ${Date.now()}`;
      const combinedGeneric = 'Amoxicillin 500 mg';

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          brandName,
          genericName: combinedGeneric, // Combined potency in generic field
          // No strength field sent!
          dosageForm: 'Capsule',
          manufacturer: 'Cipla India',
          packSize: '10 Capsules',
          baseUnit: 'Capsule',
          gstRate: 12.0,
          mrp: 85.0,
        });

      expect(res.status).toBe(201);
      expect(res.body.genericName).toBe(combinedGeneric);
      // Backend must have extracted or defaulted strength safely
      expect(res.body.strength).toMatch(/500\s*mg|Standard/i);

      // Search by brandName
      const searchRes1 = await request(app)
        .get(`/api/products?search=${encodeURIComponent(brandName)}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(searchRes1.status).toBe(200);
      expect(searchRes1.body.products).toHaveLength(1);

      // Search by ingredient portion ("Amoxicillin")
      const searchRes2 = await request(app)
        .get(`/api/products?search=Amoxicillin`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(searchRes2.status).toBe(200);
      expect(searchRes2.body.products.some((p: any) => p.id === res.body.id)).toBe(true);

      // Search by potency portion ("500 mg")
      const searchRes3 = await request(app)
        .get(`/api/products?search=${encodeURIComponent('500 mg')}`)
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(searchRes3.status).toBe(200);
      expect(searchRes3.body.products.some((p: any) => p.id === res.body.id)).toBe(true);
    });
  });

  // TEST F: Inward Purchase Regression Safety
  describe('Test F: Inward Purchase Confirmation Regression', () => {
    it('confirms inward supplier purchase with new medicine without foreign key errors', async () => {
      const brandName = `PurchaseInwardReg ${Date.now()}`;
      const batchNum = `B-INW-${Date.now().toString().slice(-6)}`;
      const invoiceNo = `INV-REG-${Date.now()}`;

      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          branchId,
          supplierId,
          supplierInvoiceNumber: invoiceNo,
          invoiceDate: new Date().toISOString(),
          paymentMode: 'CASH',
          lines: [
            {
              medicineId: 'NEW',
              isNewProduct: true,
              newMedicine: {
                brandName,
                genericName: 'Azithromycin 500 mg',
                dosageForm: 'Tablet',
                manufacturer: 'Lupin Pharma',
                baseUnit: 'Strip',
                packageUnit: 'Box',
                conversionFactor: 10,
                mrp: 120,
                defaultPurchaseRate: 80,
                gstRate: 12,
              },
              batchNumber: batchNum,
              expiryDate: new Date(Date.now() + 500 * 24 * 60 * 60 * 1000).toISOString(),
              quantity: 20,
              unit: 'Box',
              conversionFactor: 10,
              purchaseRate: 800,
              mrp: 1200,
              gstRate: 12,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.lines).toHaveLength(1);

      // Verify batch created with valid DB foreign key
      const createdBatch = await prisma.stockBatch.findFirst({
        where: { branchId, batchNumber: batchNum },
      });
      expect(createdBatch).not.toBeNull();
      expect(createdBatch?.availableQuantity).toBe(200); // 20 * 10
      expect(createdBatch?.medicineId).not.toBe('NEW');
    });
  });

  // TEST G: Indent Management UI Removal
  describe('Test G: Indent Management Route Safety', () => {
    it('preserves underlying database model and APIs while UI navigation is cleanly removed', async () => {
      // Direct API endpoints remain functional for existing backend data integrity
      const indentsRes = await request(app)
        .get('/api/indents')
        .set('Authorization', `Bearer ${superAdminToken}`);

      // Route exists and returns 200 without crashes
      expect(indentsRes.status).toBe(200);
      expect(Array.isArray(indentsRes.body.indents || indentsRes.body.data || indentsRes.body)).toBe(true);
    });
  });

  // TEST H: Permissions Verification
  describe('Test H: Role Permissions Verification', () => {
    it('blocks Billing User from adding catalogue medicines with HTTP 403', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${billingUserToken}`)
        .send({
          brandName: 'Forbidden Med',
          genericName: 'Forbidden Generic',
          dosageForm: 'Tablet',
          manufacturer: 'Unknown',
          mrp: 50,
          gstRate: 5,
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('not permitted');
    });

    it('rejects negative initial stock quantities with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          brandName: `NegativeQty ${Date.now()}`,
          genericName: 'Negative Generic',
          dosageForm: 'Tablet',
          manufacturer: 'Pharma',
          mrp: 50,
          gstRate: 5,
          initialQuantity: -10, // Invalid negative quantity
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('negative');
    });
  });
});
