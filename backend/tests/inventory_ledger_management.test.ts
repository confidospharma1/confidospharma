import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/database/prisma';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/config/jwt';

describe('Confidos Pharma — Dedicated Inventory Management & Ledger System Test Suite', { timeout: 60000 }, () => {
  let superAdminToken = '';
  let branchAdminToken = '';
  let otherBranchAdminToken = '';
  let cashierToken = '';

  let testBranchId = '';
  let otherBranchId = '';

  let supplierAId = '';
  let supplierBId = '';

  let testMedicineId = '';
  let testMedicineCode = '';

  // Clean-up tracker
  let createdBatchIds: string[] = [];
  let createdMovementIds: string[] = [];
  let createdInvoiceIds: string[] = [];
  let createdPurchaseIds: string[] = [];

  beforeAll(async () => {
    // 1. Resolve / Create Main Branch
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
          code: 'B-INV-LEDGER',
          name: 'Ledger Test Branch',
          address: 'Station Road, Vijayawada',
          phone: '+91 98765 11111',
          isActive: true,
        },
      });
    }
    testBranchId = branch.id;

    // 2. Resolve / Create Second Branch for Isolation Testing
    let secondBranch = await prisma.branch.findFirst({
      where: { id: { not: testBranchId }, isActive: true },
    });
    if (!secondBranch) {
      const company = await prisma.company.findFirst();
      secondBranch = await prisma.branch.create({
        data: {
          companyId: company!.id,
          code: 'B-ISOLATION',
          name: 'Isolation Test Branch',
          address: 'Guntur High Road',
          phone: '+91 98765 22222',
          isActive: true,
        },
      });
    }
    otherBranchId = secondBranch.id;

    // 3. Resolve Super Admin
    let superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
    if (!superAdmin) {
      superAdmin = await prisma.user.create({
        data: {
          username: `sa_inv_${Date.now()}`,
          email: `sa_inv_${Date.now()}@confidos.test`,
          fullName: 'Ledger Super Admin',
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

    // 4. Resolve Branch Admin (Test Branch)
    let branchAdmin = await prisma.user.findFirst({
      where: { role: 'BRANCH_ADMIN', branchId: testBranchId, isActive: true },
    });
    if (!branchAdmin) {
      branchAdmin = await prisma.user.create({
        data: {
          username: `ba_inv_${Date.now()}`,
          email: `ba_inv_${Date.now()}@confidos.test`,
          fullName: 'Ledger Branch Admin',
          passwordHash: 'dummy',
          role: 'BRANCH_ADMIN',
          branchId: testBranchId,
          isActive: true,
        },
      });
    }
    branchAdminToken = jwt.sign(
      { id: branchAdmin.id, username: branchAdmin.username, role: 'BRANCH_ADMIN', branchId: testBranchId },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 5. Resolve Other Branch Admin
    let otherAdmin = await prisma.user.findFirst({
      where: { role: 'BRANCH_ADMIN', branchId: otherBranchId, isActive: true },
    });
    if (!otherAdmin) {
      otherAdmin = await prisma.user.create({
        data: {
          username: `ba_other_${Date.now()}`,
          email: `ba_other_${Date.now()}@confidos.test`,
          fullName: 'Other Branch Admin',
          passwordHash: 'dummy',
          role: 'BRANCH_ADMIN',
          branchId: otherBranchId,
          isActive: true,
        },
      });
    }
    otherBranchAdminToken = jwt.sign(
      { id: otherAdmin.id, username: otherAdmin.username, role: 'BRANCH_ADMIN', branchId: otherBranchId },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 6. Cashier Token
    cashierToken = jwt.sign(
      { id: branchAdmin.id, username: 'cashier_user', role: 'BILLING_USER', branchId: testBranchId },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 7. Create Test Suppliers (Supplier A and Supplier B)
    const suppA = await prisma.supplier.create({
      data: {
        name: `Supplier A ${Date.now()}`,
        phone: '9876543210',
        email: `suppA_${Date.now()}@test.com`,
        gstin: '37AAAAA1111A1Z1',
        isActive: true,
      },
    });
    supplierAId = suppA.id;

    const suppB = await prisma.supplier.create({
      data: {
        name: `Supplier B ${Date.now()}`,
        phone: '9876543211',
        email: `suppB_${Date.now()}@test.com`,
        gstin: '37BBBBB2222B2Z2',
        isActive: true,
      },
    });
    supplierBId = suppB.id;

    // 8. Create Test Medicine (Box of 10 Tablets)
    testMedicineCode = `MED-LEDGER-${Date.now().toString().slice(-6)}`;
    const med = await prisma.medicineProduct.create({
      data: {
        internalCode: testMedicineCode,
        brandName: `Ledger Amox ${testMedicineCode}`,
        genericName: 'Amoxicillin Trihydrate',
        strength: '500 mg',
        dosageForm: 'Capsule',
        manufacturer: 'Confidos Labs',
        packSize: '10 Capsules',
        baseUnit: 'Capsule',
        packageUnit: 'Box',
        conversionFactor: 10,
        gstRate: 12.0,
        mrp: 15.0, // ₹15 per capsule (₹150 per box)
        defaultPurchaseRate: 8.0, // ₹8 per capsule
        defaultSellingRate: 12.0, // ₹12 per capsule
        reorderLevel: 50,
        isActive: true,
      },
    });
    testMedicineId = med.id;
  });

  afterAll(async () => {
    // Clean up created entities safely
    try {
      if (createdInvoiceIds.length > 0) {
        await prisma.salesInvoiceLine.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } });
        await prisma.salesInvoice.deleteMany({ where: { id: { in: createdInvoiceIds } } });
      }
      if (createdPurchaseIds.length > 0) {
        await prisma.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoiceId: { in: createdPurchaseIds } } });
        await prisma.purchaseInvoice.deleteMany({ where: { id: { in: createdPurchaseIds } } });
      }
      if (createdBatchIds.length > 0) {
        await prisma.stockMovement.deleteMany({ where: { batchId: { in: createdBatchIds } } });
        await prisma.stockAdjustment.deleteMany({ where: { batchId: { in: createdBatchIds } } });
        await prisma.stockBatch.deleteMany({ where: { id: { in: createdBatchIds } } });
      }
      if (testMedicineId) {
        await prisma.stockMovement.deleteMany({ where: { medicineId: testMedicineId } });
        await prisma.stockBatch.deleteMany({ where: { medicineId: testMedicineId } });
        await prisma.medicineProduct.deleteMany({ where: { id: testMedicineId } });
      }
      if (supplierAId) await prisma.supplier.deleteMany({ where: { id: supplierAId } });
      if (supplierBId) await prisma.supplier.deleteMany({ where: { id: supplierBId } });
    } catch (_) {}
  });

  // =========================================================================
  // REQUIREMENT 3: REPEATED PURCHASES OF SAME BATCH & EXPLICIT MATCHING RULE
  // =========================================================================
  describe('Requirement 3: Repeated Purchases of Same Batch & Explicit Matching Rule', () => {
    const batchNumber = `BATCH-${Date.now().toString().slice(-6)}`;
    const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let firstBatchId = '';

    it('1. First inward purchase: receives 10 tablets for Batch from Supplier A', async () => {
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          branchId: testBranchId,
          supplierId: supplierAId,
          supplierInvoiceNumber: `INV-SUPP-A-1-${Date.now()}`,
          invoiceDate: new Date().toISOString(),
          paymentMode: 'CASH',
          lines: [
            {
              medicineId: testMedicineId,
              batchNumber,
              expiryDate,
              quantity: 1, // 1 Box = 10 Capsules
              freeQuantity: 0,
              unit: 'Box',
              conversionFactor: 10,
              purchaseRate: 80.0, // ₹80 per box = ₹8.0 per capsule
              sellingRate: 120.0,
              mrp: 150.0,
              gstRate: 12.0,
            },
          ],
        });

      expect(res.status).toBe(201);
      createdPurchaseIds.push(res.body.id);

      // Verify batch created in database
      const batchInDb = await prisma.stockBatch.findFirst({
        where: { branchId: testBranchId, medicineId: testMedicineId, batchNumber },
      });
      expect(batchInDb).not.toBeNull();
      expect(batchInDb?.availableQuantity).toBe(10);
      expect(batchInDb?.quantityReceived).toBe(10);
      expect(batchInDb?.supplierId).toBe(supplierAId);
      firstBatchId = batchInDb!.id;
      createdBatchIds.push(firstBatchId);

      // Verify immutable stock movement ledger entry
      const movement = await prisma.stockMovement.findFirst({
        where: { batchId: firstBatchId, movementType: 'PURCHASE_RECEIPT' },
      });
      expect(movement).not.toBeNull();
      expect(movement?.quantityDelta).toBe(10);
      expect(movement?.unitPrice).toBe(8.0);
    });

    it('2. Second inward purchase (same batch, same supplier, same expiry): stock increases to 20 without overwriting historical ledger', async () => {
      // Simulate subsequent purchase on same batch
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          branchId: testBranchId,
          supplierId: supplierAId,
          supplierInvoiceNumber: `INV-SUPP-A-2-${Date.now()}`,
          invoiceDate: new Date().toISOString(),
          paymentMode: 'CASH',
          lines: [
            {
              medicineId: testMedicineId,
              batchNumber,
              expiryDate,
              quantity: 1, // 1 more box = 10 more capsules
              freeQuantity: 0,
              unit: 'Box',
              conversionFactor: 10,
              purchaseRate: 80.0,
              sellingRate: 120.0,
              mrp: 150.0,
              gstRate: 12.0,
            },
          ],
        });

      expect(res.status).toBe(201);
      createdPurchaseIds.push(res.body.id);

      // Verify current stock increased to 20
      const batchInDb = await prisma.stockBatch.findUnique({ where: { id: firstBatchId } });
      expect(batchInDb?.availableQuantity).toBe(20);
      expect(batchInDb?.quantityReceived).toBe(20);

      // Verify TWO separate, immutable movements exist for this batch
      const movements = await prisma.stockMovement.findMany({
        where: { batchId: firstBatchId, movementType: 'PURCHASE_RECEIPT' },
        orderBy: { createdAt: 'asc' },
      });
      expect(movements.length).toBe(2);
      expect(movements[0].quantityDelta).toBe(10);
      expect(movements[1].quantityDelta).toBe(10);
    });

    it('3. Conflicting supplier purchase with SAME batch number creates distinct batch without silent merge', async () => {
      // Same batch number arrives from Supplier B
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          branchId: testBranchId,
          supplierId: supplierBId, // DIFFERENT SUPPLIER
          supplierInvoiceNumber: `INV-SUPP-B-1-${Date.now()}`,
          invoiceDate: new Date().toISOString(),
          paymentMode: 'CASH',
          lines: [
            {
              medicineId: testMedicineId,
              batchNumber, // SAME batch number!
              expiryDate,
              quantity: 1, // 10 capsules
              freeQuantity: 0,
              unit: 'Box',
              conversionFactor: 10,
              purchaseRate: 85.0, // ₹85 per box
              sellingRate: 120.0,
              mrp: 150.0,
              gstRate: 12.0,
            },
          ],
        });

      expect(res.status).toBe(201);
      createdPurchaseIds.push(res.body.id);

      // Verify that Supplier B's batch is created as a DISTINCT batch, NOT silently merged into Supplier A's batch
      const allMatchingBatches = await prisma.stockBatch.findMany({
        where: { branchId: testBranchId, medicineId: testMedicineId, batchNumber },
      });
      expect(allMatchingBatches.length).toBe(2);

      const batchA = allMatchingBatches.find((b) => b.supplierId === supplierAId);
      const batchB = allMatchingBatches.find((b) => b.supplierId === supplierBId);

      expect(batchA?.availableQuantity).toBe(20);
      expect(batchB?.availableQuantity).toBe(10);
      createdBatchIds.push(batchB!.id);
    });
  });

  // =========================================================================
  // REQUIREMENT 5 & 6: POS BILLING & PACKAGING CONVERSION CONSISTENCY
  // =========================================================================
  describe('Requirement 5 & 6: POS Billing & Packaging Unit Consistency', () => {
    let billingBatchId = '';

    beforeAll(async () => {
      const batch = await prisma.stockBatch.create({
        data: {
          branchId: testBranchId,
          medicineId: testMedicineId,
          batchNumber: `POS-BATCH-${Date.now().toString().slice(-5)}`,
          expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
          quantityReceived: 50,
          availableQuantity: 50,
          purchaseRate: 8.0,
          sellingPrice: 12.0,
          mrp: 15.0,
          supplierId: supplierAId,
          status: 'ACTIVE',
        },
      });
      billingBatchId = batch.id;
      createdBatchIds.push(billingBatchId);

      // Record inward
      await prisma.stockMovement.create({
        data: {
          branchId: testBranchId,
          medicineId: testMedicineId,
          batchId: billingBatchId,
          movementType: 'PURCHASE_RECEIPT',
          quantityDelta: 50,
          unitPrice: 8.0,
          referenceDocType: 'PURCHASE_INVOICE',
          referenceDocId: 'INIT-POS-001',
          reason: 'Initial test stock',
          performedByUserId: 'test-user',
        },
      });
    });

    it('1. POS billing counter sells 15 capsules: reduces batch available stock to 35 and records outward SALE', async () => {
      const res = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          branchId: testBranchId,
          customerName: 'John Patient',
          customerPhone: '9876543210',
          paymentMethod: 'CASH',
          items: [
            {
              medicineId: testMedicineId,
              batchId: billingBatchId,
              quantity: 15, // 15 capsules
              unit: 'Capsule',
              discountPercent: 0,
            },
          ],
        });

      expect(res.status).toBe(201);
      const invoiceId = res.body.id;
      createdInvoiceIds.push(invoiceId);

      // Verify batch availableQuantity dropped from 50 to 35
      const batchInDb = await prisma.stockBatch.findUnique({ where: { id: billingBatchId } });
      expect(batchInDb?.availableQuantity).toBe(35);

      // Verify outward SALE movement in ledger with -15 delta
      const saleMovement = await prisma.stockMovement.findFirst({
        where: { batchId: billingBatchId, movementType: 'SALE' },
        orderBy: { createdAt: 'desc' },
      });
      expect(saleMovement).not.toBeNull();
      expect(saleMovement?.quantityDelta).toBe(-15);
    });

    it('2. Cancelling retail sales invoice restores 15 capsules and logs CUSTOMER_RETURN movement', async () => {
      const invoiceId = createdInvoiceIds[createdInvoiceIds.length - 1];
      const res = await request(app)
        .post(`/api/billing/invoices/${invoiceId}/cancel`)
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({ reason: 'Customer returned unopened capsules' });

      expect(res.status).toBe(200);

      // Stock restored to 50
      const batchInDb = await prisma.stockBatch.findUnique({ where: { id: billingBatchId } });
      expect(batchInDb?.availableQuantity).toBe(50);

      // CUSTOMER_RETURN movement recorded
      const returnMovement = await prisma.stockMovement.findFirst({
        where: { batchId: billingBatchId, movementType: 'CUSTOMER_RETURN' },
      });
      expect(returnMovement).not.toBeNull();
      expect(returnMovement?.quantityDelta).toBe(15);
    });

    it('3. Manual stock adjustment reduces quantity by 5 for damage and records ledger', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          batchId: billingBatchId,
          adjustmentType: 'DAMAGE',
          quantityDelta: -5,
          reason: 'Foil blister broken during counter transit',
        });

      expect(res.status).toBe(200);

      // Stock reduced from 50 to 45
      const batchInDb = await prisma.stockBatch.findUnique({ where: { id: billingBatchId } });
      expect(batchInDb?.availableQuantity).toBe(45);

      // Movement recorded
      const adjustMovement = await prisma.stockMovement.findFirst({
        where: { batchId: billingBatchId, movementType: 'STOCK_CORRECTION' },
        orderBy: { createdAt: 'desc' },
      });
      expect(adjustMovement).not.toBeNull();
      expect(adjustMovement?.quantityDelta).toBe(-5);
    });
  });

  // =========================================================================
  // REQUIREMENT 4 & 5: DEDICATED LEDGER DASHBOARD & MOVEMENTS TABLE API
  // =========================================================================
  describe('Requirement 4 & 5: Dedicated Ledger Summary & Movements API Endpoints', () => {
    it('1. GET /api/inventory/ledger/summary returns complete 8 KPI summary cards', async () => {
      const res = await request(app)
        .get(`/api/inventory/ledger/summary?branchId=${testBranchId}&period=last7days`)
        .set('Authorization', `Bearer ${branchAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('period');
      expect(res.body).toHaveProperty('openingStock');
      expect(res.body).toHaveProperty('inward');
      expect(res.body).toHaveProperty('outward');
      expect(res.body).toHaveProperty('currentStock');
      expect(res.body).toHaveProperty('inwardCost');
      expect(res.body).toHaveProperty('outwardValue');
      expect(res.body).toHaveProperty('salesRevenue');
      expect(res.body).toHaveProperty('cogs');
      expect(res.body).toHaveProperty('grossProfit');
      expect(res.body).toHaveProperty('grossProfitMargin');
      expect(res.body).toHaveProperty('adjustments');
      expect(res.body).toHaveProperty('valuationMethod');

      expect(typeof res.body.openingStock.quantity).toBe('number');
      expect(typeof res.body.currentStock.quantity).toBe('number');
      expect(typeof res.body.inwardCost).toBe('number');
      expect(typeof res.body.outwardValue).toBe('number');
    });

    it('2. GET /api/inventory/ledger/movements returns paginated, detailed movement table', async () => {
      const res = await request(app)
        .get(`/api/inventory/ledger/movements?branchId=${testBranchId}&period=last7days&limit=10`)
        .set('Authorization', `Bearer ${branchAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('limit');
      expect(res.body).toHaveProperty('totalPages');
      expect(Array.isArray(res.body.movements)).toBe(true);
      expect(res.body.movements.length).toBeGreaterThan(0);

      const first = res.body.movements[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('transactionDate');
      expect(first).toHaveProperty('medicine');
      expect(first.medicine).toHaveProperty('brandName');
      expect(first.medicine).toHaveProperty('baseUnit');
      expect(first).toHaveProperty('movementType');
      expect(first).toHaveProperty('movementTypeLabel');
      expect(first).toHaveProperty('quantityInward');
      expect(first).toHaveProperty('quantityOutward');
      expect(first).toHaveProperty('unitPurchaseCost');
      expect(first).toHaveProperty('totalMovementValue');
      expect(first).toHaveProperty('performedBy');
    });

    it('3. Movement type filter isolates specific movement records', async () => {
      const res = await request(app)
        .get(`/api/inventory/ledger/movements?branchId=${testBranchId}&movementType=PURCHASE_RECEIPT`)
        .set('Authorization', `Bearer ${branchAdminToken}`);

      expect(res.status).toBe(200);
      for (const m of res.body.movements) {
        expect(m.movementType).toBe('PURCHASE_RECEIPT');
        expect(m.quantityInward).toBeGreaterThan(0);
      }
    });

    it('4. Search query filters by medicine brand name or batch number', async () => {
      const res = await request(app)
        .get(`/api/inventory/ledger/movements?branchId=${testBranchId}&search=${testMedicineCode}`)
        .set('Authorization', `Bearer ${branchAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.movements.length).toBeGreaterThan(0);
      for (const m of res.body.movements) {
        expect(
          m.medicine.brandName.includes(testMedicineCode) ||
          m.medicine.internalCode.includes(testMedicineCode)
        ).toBe(true);
      }
    });
  });

  // =========================================================================
  // REQUIREMENT 8: BRANCH DATA ISOLATION & ACCESS CONTROL
  // =========================================================================
  describe('Requirement 8: Branch Data Isolation & Access Control', () => {
    it('1. Branch Admin cannot access another branch inventory ledger (HTTP 403)', async () => {
      const res = await request(app)
        .get(`/api/inventory/ledger/summary?branchId=${otherBranchId}`)
        .set('Authorization', `Bearer ${branchAdminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('2. Branch Admin cannot access another branch stock movements (HTTP 403)', async () => {
      const res = await request(app)
        .get(`/api/inventory/ledger/movements?branchId=${otherBranchId}`)
        .set('Authorization', `Bearer ${branchAdminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('3. Super Admin can query any branch inventory ledger freely', async () => {
      const res = await request(app)
        .get(`/api/inventory/ledger/summary?branchId=${otherBranchId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('currentStock');
    });
  });
});
