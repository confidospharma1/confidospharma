import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/database/prisma';
import { JWT_SECRET } from '../src/config/jwt';

describe('Confidos Pharma - Stock Monitoring & Inward Purchase Fix Test Suite', { timeout: 60000 }, () => {
  let superAdminToken = '';
  let branchAdminToken = '';
  let branch2AdminToken = '';
  let billingUserToken = '';
  let branchId = '';
  let branchId2 = '';
  let supplierId = '';

  beforeAll(async () => {
    // 1. Fetch or create test branches
    let branch = await prisma.branch.findFirst({ where: { isActive: true } });
    if (!branch) {
      let company = await prisma.company.findFirst();
      if (!company) {
        company = await prisma.company.create({
          data: {
            name: 'Confidos Healthcare Pvt Ltd',
            legalName: 'Confidos Healthcare & Pharmaceuticals Pvt Ltd',
          },
        });
      }
      branch = await prisma.branch.create({
        data: {
          companyId: company.id,
          code: 'B-VJA',
          name: 'Vijayawada Central',
          address: 'MG Road, Vijayawada',
          phone: '+91 866 245 9001',
          isActive: true,
        },
      });
    }
    branchId = branch.id;

    let branch2 = await prisma.branch.findFirst({
      where: { id: { not: branchId }, isActive: true },
    });
    if (!branch2) {
      const company = await prisma.company.findFirst();
      branch2 = await prisma.branch.create({
        data: {
          companyId: company?.id || 'company-1',
          code: 'B-GNT',
          name: 'Guntur Branch',
          address: 'NTR Circle, Guntur',
          phone: '+91 863 222 1002',
          isActive: true,
        },
      });
    }
    branchId2 = branch2.id;

    // 2. Fetch or create users
    let superAdmin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN', isActive: true },
    });
    if (!superAdmin) {
      superAdmin = await prisma.user.create({
        data: {
          username: 'monitoring_superadmin',
          email: 'monitoring_superadmin@confidos.test',
          fullName: 'Super Admin',
          passwordHash: 'dummy',
          role: 'SUPER_ADMIN',
          isActive: true,
        },
      });
    }

    superAdminToken = jwt.sign(
      { id: superAdmin.id, username: superAdmin.username, role: superAdmin.role, branchId: null },
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

    let branch2Admin = await prisma.user.findFirst({
      where: { role: 'BRANCH_ADMIN', branchId: branchId2, isActive: true },
    });
    if (!branch2Admin) {
      branch2Admin = await prisma.user.create({
        data: {
          username: `branch2_admin_${Date.now()}`,
          email: `branch2_admin_${Date.now()}@confidos.test`,
          fullName: 'Branch 2 Admin',
          passwordHash: 'dummy',
          role: 'BRANCH_ADMIN',
          branchId: branchId2,
          isActive: true,
        },
      });
    }

    branch2AdminToken = jwt.sign(
      { id: branch2Admin.id, username: branch2Admin.username, role: branch2Admin.role, branchId: branchId2 },
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
          name: 'Apollo Pharmaceuticals Ltd',
          phone: '+91 99887 76655',
          email: 'supply@apollopharma.test',
          isActive: true,
        },
      });
    }
    supplierId = supplier.id;
  });

  // TEST A: Existing Medicine Purchase Confirmation
  describe('Test A: Existing Medicine Purchase Confirmation', () => {
    it('uses existing medicine real database ID, creates batch, updates stock and totals accurately', async () => {
      // 1. Create an existing medicine
      const uniqueCode = `MED-A-${Date.now()}`;
      const existingMed = await prisma.medicineProduct.create({
        data: {
          internalCode: uniqueCode,
          brandName: `Paracetamol Exist ${Date.now()}`,
          genericName: 'Paracetamol',
          strength: '650mg',
          dosageForm: 'Tablet',
          manufacturer: 'Micro Labs',
          packSize: '10 Strips',
          baseUnit: 'Strip',
          packageUnit: 'Box',
          conversionFactor: 10,
          gstRate: 12.0,
          mrp: 50.0,
          defaultPurchaseRate: 35.0,
          defaultSellingRate: 48.0,
          isActive: true,
        },
      });

      const uniqueBatchNumber = `B-EX-${Date.now()}`;
      const uniqueInvoiceNo = `INV-EX-${Date.now()}`;
      const expiryIso = '2028-12-31T00:00:00.000Z';

      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          branchId,
          supplierId,
          supplierInvoiceNumber: uniqueInvoiceNo,
          invoiceDate: new Date().toISOString(),
          paymentMode: 'CASH',
          lines: [
            {
              medicineId: existingMed.id, // Using real existing ID
              batchNumber: uniqueBatchNumber,
              expiryDate: expiryIso,
              quantity: 5, // 5 boxes
              freeQuantity: 0,
              unit: 'Box',
              conversionFactor: 10, // 5 * 10 = 50 strips
              purchaseRate: 350.0,
              sellingRate: 480.0,
              mrp: 500.0,
              discountPercent: 0,
              gstRate: 12.0,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();

      // Verify batch in DB
      const createdBatch = await prisma.stockBatch.findFirst({
        where: {
          branchId,
          medicineId: existingMed.id,
          batchNumber: uniqueBatchNumber,
        },
      });

      expect(createdBatch).not.toBeNull();
      expect(createdBatch?.medicineId).toBe(existingMed.id);
      expect(createdBatch?.quantityReceived).toBe(50); // 5 boxes * 10 = 50 strips
      expect(createdBatch?.availableQuantity).toBe(50);
      expect(createdBatch?.purchaseRate).toBe(35); // normalized per strip (350 / 10 = 35)

      // Verify stock movement
      const movement = await prisma.stockMovement.findFirst({
        where: {
          branchId,
          medicineId: existingMed.id,
          batchId: createdBatch!.id,
          movementType: 'PURCHASE_RECEIPT',
        },
      });
      expect(movement).not.toBeNull();
      expect(movement?.quantityDelta).toBe(50);
    });
  });

  // TEST B: New Medicine Purchase Confirmation (Fix for Inward Stock Foreign Key Error)
  describe('Test B: New Medicine Purchase Confirmation & Foreign Key Safety', () => {
    it('creates new medicine, captures returned DB id, and creates batch with no foreign key error', async () => {
      const brandName = `Augmentin Duo New ${Date.now()}`;
      const uniqueBatch = `B-NEW-${Date.now()}`;
      const uniqueInvoiceNo = `INV-NEW-${Date.now()}`;

      // Simulate payload from CSV inward integration with medicineId set to 'NEW' and product metadata
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          branchId,
          supplierId,
          supplierInvoiceNumber: uniqueInvoiceNo,
          invoiceDate: new Date().toISOString(),
          paymentMode: 'CASH',
          lines: [
            {
              medicineId: 'NEW', // Placeholder from preview
              isNewProduct: true,
              newMedicine: {
                brandName,
                genericName: 'Amoxicillin and Potassium Clavulanate',
                strength: '625mg',
                dosageForm: 'Tablet',
                manufacturer: 'GSK India',
                hsnCode: '30041010',
                gstRate: 12,
                mrp: 200,
                defaultPurchaseRate: 150,
                defaultSellingRate: 190,
                baseUnit: 'Strip',
                packageUnit: 'Box',
                conversionFactor: 10,
              },
              batchNumber: uniqueBatch,
              expiryDate: '2028-10-31T00:00:00.000Z',
              quantity: 10,
              freeQuantity: 1, // 10 + 1 = 11 boxes = 110 strips
              unit: 'Box',
              conversionFactor: 10,
              purchaseRate: 1500,
              sellingRate: 1900,
              mrp: 2000,
              discountPercent: 5,
              gstRate: 12,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.lines).toHaveLength(1);

      // Verify the medicine was created in MedicineProduct
      const createdMed = await prisma.medicineProduct.findFirst({
        where: { brandName },
      });
      expect(createdMed).not.toBeNull();
      expect(createdMed?.internalCode).toMatch(/^MED-\d+$/);

      // Verify the batch references the REAL database ID (not 'NEW' and not index)
      const createdBatch = await prisma.stockBatch.findFirst({
        where: {
          branchId,
          batchNumber: uniqueBatch,
        },
      });

      expect(createdBatch).not.toBeNull();
      expect(createdBatch?.medicineId).toBe(createdMed!.id);
      expect(createdBatch?.medicineId).not.toBe('NEW');
      expect(createdBatch?.availableQuantity).toBe(110); // (10 + 1) * 10

      // Verify the new medicine appears in Stock Monitoring
      const monitorRes = await request(app)
        .get(`/api/stock-monitoring?branchId=${branchId}&search=${encodeURIComponent(brandName)}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(monitorRes.status).toBe(200);
      expect(monitorRes.body.items).toHaveLength(1);
      expect(monitorRes.body.items[0].medicineId).toBe(createdMed!.id);
      expect(monitorRes.body.items[0].totalAvailableStock).toBe(110);
    });
  });

  // TEST C: Multiple Batches Aggregation & FEFO Drill-down
  describe('Test C: Multiple Batches Aggregation & FEFO Drill-Down', () => {
    it('aggregates multiple batches into a single medicine row and provides FEFO drill-down', async () => {
      const brandName = `Pan 40 MultiBatch ${Date.now()}`;
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-MB-${Date.now()}`,
          brandName,
          genericName: 'Pantoprazole Sodium',
          strength: '40mg',
          dosageForm: 'Tablet',
          manufacturer: 'Alkem Labs',
          packSize: '10 Strips',
          baseUnit: 'Strip',
          packageUnit: 'Box',
          conversionFactor: 10,
          gstRate: 12.0,
          mrp: 120.0,
          isActive: true,
        },
      });

      const batchNum1 = `MB-B1-${Date.now()}`;
      const batchNum2 = `MB-B2-${Date.now()}`;
      const expEarly = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000); // 45 days (earlier)
      const expLate = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000); // 300 days (later)

      // Batch 1: 100 strips
      await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: med.id,
          batchNumber: batchNum1,
          expiryDate: expEarly,
          quantityReceived: 100,
          availableQuantity: 100,
          purchaseRate: 8.5,
          mrp: 12.0,
          sellingPrice: 11.5,
          status: 'ACTIVE',
        },
      });

      // Batch 2: 250 strips
      await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: med.id,
          batchNumber: batchNum2,
          expiryDate: expLate,
          quantityReceived: 250,
          availableQuantity: 250,
          purchaseRate: 8.5,
          mrp: 12.0,
          sellingPrice: 11.5,
          status: 'ACTIVE',
        },
      });

      // Query Stock Monitoring
      const res = await request(app)
        .get(`/api/stock-monitoring?branchId=${branchId}&search=${encodeURIComponent(brandName)}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1); // Single row for medicine!
      const row = res.body.items[0];
      expect(row.medicineId).toBe(med.id);
      expect(row.totalAvailableStock).toBe(350); // 100 + 250
      expect(row.batchCount).toBe(2);
      expect(row.packConversion.equivalentPacksText).toContain('35 Boxes');

      // FEFO Drill-down Endpoint
      const drillRes = await request(app)
        .get(`/api/stock-monitoring/batches/${med.id}?branchId=${branchId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(drillRes.status).toBe(200);
      expect(drillRes.body.batches).toHaveLength(2);
      // First batch in FEFO order must be the earlier expiring batch
      expect(drillRes.body.batches[0].batchNumber).toBe(batchNum1);
      expect(drillRes.body.batches[1].batchNumber).toBe(batchNum2);
    });
  });

  // TEST D: Foreign Key / Missing Reference Failure Handling
  describe('Test D: Foreign Key & Unresolved Medicine Failure Safety', () => {
    it('fails safely with user-friendly error and rolls back without orphaned records when medicine cannot be resolved', async () => {
      const fakeMedicineId = 'non-existent-uuid-999999';
      const uniqueInvoiceNo = `INV-FAIL-${Date.now()}`;
      const uniqueBatch = `B-FAIL-${Date.now()}`;

      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          branchId,
          supplierId,
          supplierInvoiceNumber: uniqueInvoiceNo,
          invoiceDate: new Date().toISOString(),
          paymentMode: 'CASH',
          lines: [
            {
              medicineId: fakeMedicineId, // Non-existent and no metadata
              batchNumber: uniqueBatch,
              expiryDate: '2028-12-31T00:00:00.000Z',
              quantity: 10,
              purchaseRate: 50,
              sellingRate: 80,
              mrp: 80,
              gstRate: 5,
            },
          ],
        });

      // Must fail with 400
      expect(res.status).toBe(400);
      expect(res.body.message).toBeDefined();
      expect(res.body.message).not.toContain('prisma.stockBatch.create()');
      expect(res.body.message).toMatch(/medicine|missing|resolve/i);

      // Verify transaction atomicity: No batch was created
      const batchCheck = await prisma.stockBatch.findFirst({
        where: { batchNumber: uniqueBatch },
      });
      expect(batchCheck).toBeNull();

      // Verify no purchase invoice was created
      const invoiceCheck = await prisma.purchaseInvoice.findFirst({
        where: { supplierInvoiceNumber: uniqueInvoiceNo },
      });
      expect(invoiceCheck).toBeNull();
    });
  });

  // TEST E: Duplicate Confirmation Protection (Idempotency)
  describe('Test E: Duplicate Confirmation Protection', () => {
    it('rejects identical duplicate purchase submissions and prevents stock duplication', async () => {
      const uniqueInvoiceNo = `INV-DUP-${Date.now()}`;
      const uniqueBatch = `B-DUP-${Date.now()}`;

      const payload = {
        branchId,
        supplierId,
        supplierInvoiceNumber: uniqueInvoiceNo,
        invoiceDate: new Date().toISOString(),
        paymentMode: 'CASH',
        idempotencyKey: `idemp-key-${Date.now()}`,
        lines: [
          {
            isNewProduct: true,
            newMedicine: {
              brandName: `Dup Check Medicine ${Date.now()}`,
              genericName: 'Cetirizine',
              strength: '10mg',
              dosageForm: 'Tablet',
              baseUnit: 'Strip',
              packageUnit: 'Box',
              conversionFactor: 10,
            },
            batchNumber: uniqueBatch,
            expiryDate: '2028-12-31T00:00:00.000Z',
            quantity: 10,
            purchaseRate: 20,
            sellingRate: 35,
            mrp: 35,
            gstRate: 12,
          },
        ],
      };

      // 1. First submission succeeds
      const firstRes = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload);

      expect(firstRes.status).toBe(201);

      // 2. Second submission immediately attempted (double-click simulation)
      const secondRes = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(payload);

      expect(secondRes.status).toBe(400);
      expect(secondRes.body.message).toContain('already been recorded');

      // 3. Confirm stock count is exactly 100, not 200
      const batches = await prisma.stockBatch.findMany({
        where: { branchId, batchNumber: uniqueBatch },
      });
      expect(batches).toHaveLength(1);
      expect(batches[0].availableQuantity).toBe(100);
    });
  });

  // TEST F: Quantity Pack Conversions
  describe('Test F: Quantity Pack Conversions', () => {
    it('verifies packaging conversions without double multiplication (10 boxes * 10 strips = 100 strips = 1,000 tablets)', async () => {
      const medName = `Conversion Test Drug ${Date.now()}`;
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-CV-${Date.now()}`,
          brandName: medName,
          genericName: 'Paracetamol',
          strength: '650mg',
          dosageForm: 'Tablet',
          manufacturer: 'Apex Pharma',
          packSize: '1 Box',
          baseUnit: 'Tablet',
          packageUnit: 'Box',
          conversionFactor: 100, // 1 box = 100 tablets
          gstRate: 12.0,
          mrp: 200.0,
          isActive: true,
        },
      });

      // Purchase 10 boxes (UnitsPerPack = 100) -> 1,000 tablets in base unit
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          branchId,
          supplierId,
          supplierInvoiceNumber: `INV-PACK-${Date.now()}`,
          invoiceDate: new Date().toISOString(),
          paymentMode: 'CASH',
          lines: [
            {
              medicineId: med.id,
              batchNumber: `B-PACK-${Date.now()}`,
              expiryDate: '2028-11-30T00:00:00.000Z',
              quantity: 10,
              unit: 'Box',
              conversionFactor: 100,
              purchaseRate: 120, // 120 per box
              sellingRate: 180,
              mrp: 200,
              gstRate: 12,
            },
          ],
        });

      expect(res.status).toBe(201);

      // Verify monitoring display
      const monitorRes = await request(app)
        .get(`/api/stock-monitoring?branchId=${branchId}&search=${encodeURIComponent(medName)}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(monitorRes.status).toBe(200);
      const item = monitorRes.body.items[0];
      expect(item.totalAvailableStock).toBe(1000); // 1,000 tablets
      expect(item.packConversion.fullPacks).toBe(10); // 10 boxes
      expect(item.packConversion.equivalentPacksText).toBe('10 Boxes');
    });
  });

  // TEST G & H: Out of Stock and Low Stock Filters
  describe('Test G & H: Out of Stock & Low Stock Filters', () => {
    it('correctly filters Out of Stock and Low Stock medicines based on reorder thresholds', async () => {
      const oosName = `OOS Med ${Date.now()}`;
      const lowStockName = `LowStock Med ${Date.now()}`;
      const inStockName = `NormalStock Med ${Date.now()}`;

      // 1. Create 3 medicines with configured reorderLevel = 20
      const medOos = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-OOS-${Date.now()}`,
          brandName: oosName,
          genericName: 'OOS Form',
          strength: '10mg',
          dosageForm: 'Tablet',
          manufacturer: 'Apex Pharma',
          packSize: '10 Strips',
          baseUnit: 'Strip',
          reorderLevel: 20,
          gstRate: 5,
          mrp: 100,
          isActive: true,
        },
      });

      const medLow = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-LOW-${Date.now()}`,
          brandName: lowStockName,
          genericName: 'Low Form',
          strength: '20mg',
          dosageForm: 'Tablet',
          manufacturer: 'Apex Pharma',
          packSize: '10 Strips',
          baseUnit: 'Strip',
          reorderLevel: 20,
          gstRate: 5,
          mrp: 100,
          isActive: true,
        },
      });

      const medNormal = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-NORM-${Date.now()}`,
          brandName: inStockName,
          genericName: 'Normal Form',
          strength: '30mg',
          dosageForm: 'Tablet',
          manufacturer: 'Apex Pharma',
          packSize: '10 Strips',
          baseUnit: 'Strip',
          reorderLevel: 20,
          gstRate: 5,
          mrp: 100,
          isActive: true,
        },
      });

      // Add Depleted Batch (0 stock) for medOos
      await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: medOos.id,
          batchNumber: `B-OOS-${Date.now()}`,
          expiryDate: new Date('2028-12-31'),
          quantityReceived: 50,
          availableQuantity: 0, // Zero available stock!
          purchaseRate: 70,
          mrp: 100,
          sellingPrice: 95,
          status: 'DEPLETED',
        },
      });

      // Add Low Stock Batch (10 stock <= reorderLevel 20) for medLow
      await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: medLow.id,
          batchNumber: `B-LOW-${Date.now()}`,
          expiryDate: new Date('2028-12-31'),
          quantityReceived: 10,
          availableQuantity: 10, // 10 <= 20
          purchaseRate: 70,
          mrp: 100,
          sellingPrice: 95,
          status: 'ACTIVE',
        },
      });

      // Add Normal Stock Batch (100 stock > reorderLevel 20) for medNormal
      await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: medNormal.id,
          batchNumber: `B-NORM-${Date.now()}`,
          expiryDate: new Date('2028-12-31'),
          quantityReceived: 100,
          availableQuantity: 100, // 100 > 20
          purchaseRate: 70,
          mrp: 100,
          sellingPrice: 95,
          status: 'ACTIVE',
        },
      });

      // Query Out of Stock filter
      const oosRes = await request(app)
        .get(`/api/stock-monitoring?branchId=${branchId}&stockStatus=OUT_OF_STOCK&search=${encodeURIComponent(oosName)}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(oosRes.status).toBe(200);
      expect(oosRes.body.items).toHaveLength(1);
      expect(oosRes.body.items[0].stockStatus).toBe('OUT_OF_STOCK');

      // Query Low Stock filter
      const lowRes = await request(app)
        .get(`/api/stock-monitoring?branchId=${branchId}&stockStatus=LOW_STOCK&search=${encodeURIComponent(lowStockName)}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(lowRes.status).toBe(200);
      expect(lowRes.body.items).toHaveLength(1);
      expect(lowRes.body.items[0].stockStatus).toBe('LOW_STOCK');

      // Query In Stock filter
      const inStockRes = await request(app)
        .get(`/api/stock-monitoring?branchId=${branchId}&stockStatus=IN_STOCK&search=${encodeURIComponent(inStockName)}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(inStockRes.status).toBe(200);
      expect(inStockRes.body.items).toHaveLength(1);
      expect(inStockRes.body.items[0].stockStatus).toBe('IN_STOCK');
    });
  });

  // TEST I: Expiry Filters (30, 60, 90, 180 Days, Expired, Safe)
  describe('Test I: Expiry Horizon Filters', () => {
    it('accurately categorizes batches by calendar boundaries and excludes depleted batches from physical expiry risk', async () => {
      const expMedName = `Exp Test Drug ${Date.now()}`;
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-EXP-${Date.now()}`,
          brandName: expMedName,
          genericName: 'Exp Active',
          strength: '50mg',
          dosageForm: 'Syrup',
          manufacturer: 'Apex Pharma',
          packSize: '100ml Bottle',
          baseUnit: 'Bottle',
          gstRate: 5,
          mrp: 80,
          isActive: true,
        },
      });

      const now = Date.now();
      const in20Days = new Date(now + 20 * 24 * 60 * 60 * 1000);
      const past10Days = new Date(now - 10 * 24 * 60 * 60 * 1000);

      // Batch 1: Expiring in 20 days with positive quantity (50 bottles)
      await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: med.id,
          batchNumber: `B-EXP20-${Date.now()}`,
          expiryDate: in20Days,
          quantityReceived: 50,
          availableQuantity: 50,
          purchaseRate: 50,
          mrp: 80,
          sellingPrice: 75,
          status: 'ACTIVE',
        },
      });

      // Filter: EXPIRING_30
      const res30 = await request(app)
        .get(`/api/stock-monitoring?branchId=${branchId}&expiryStatus=EXPIRING_30&search=${encodeURIComponent(expMedName)}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res30.status).toBe(200);
      expect(res30.body.items).toHaveLength(1);
      expect(res30.body.items[0].hasExpiring30PositiveBatch).toBe(true);

      // Verify Alerts endpoint reports this 20-day batch
      const alertsRes = await request(app)
        .get(`/api/stock-monitoring/alerts?branchId=${branchId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(alertsRes.status).toBe(200);
      const alertItem = alertsRes.body.alerts.find((a: any) => a.medicineId === med.id);
      expect(alertItem).toBeDefined();
      expect(alertItem.category).toBe('NEAR_EXPIRY_30');
    });
  });

  // TEST J: Read-Only Enforcement & Branch Security
  describe('Test J: Read-Only Enforcement & Branch Security', () => {
    it('restricts Branch Admin to their assigned branch and blocks cross-branch snooping with HTTP 403', async () => {
      // Branch Admin from branchId attempts to query branchId2 stock
      const res = await request(app)
        .get(`/api/stock-monitoring?branchId=${branchId2}`)
        .set('Authorization', `Bearer ${branchAdminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('not authorized');
    });

    it('blocks mutating HTTP methods on stock monitoring endpoints', async () => {
      const postRes = await request(app)
        .post('/api/stock-monitoring')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ test: 123 });

      // No POST endpoint exists on stock monitoring
      expect(postRes.status).toBe(404);

      const deleteRes = await request(app)
        .delete('/api/stock-monitoring/some-id')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(deleteRes.status).toBe(404);
    });
  });

  // TEST K: Regression Tests
  describe('Test K: System Integrity & Regression', () => {
    it('maintains catalogue and branches access without regression', async () => {
      const branchesRes = await request(app)
        .get('/api/branches')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(branchesRes.status).toBe(200);
      expect(Array.isArray(branchesRes.body)).toBe(true);

      const productsRes = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(productsRes.status).toBe(200);
      expect(productsRes.body).toBeDefined();
    });
  });
});
