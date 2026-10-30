import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/database/prisma';

import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/config/jwt';

describe('Confidos Pharma — Quality Audit Verified Fixes Regression Test Suite', { timeout: 60000 }, () => {
  let superAdminToken = '';
  let branchAdminToken = '';
  let cashierToken = '';
  let testBranchId = '';
  let testSupplierId = '';

  beforeAll(async () => {
    // 1. Resolve or create test branch
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
          code: 'B-REG-BRANCH',
          name: 'Regression Branch',
          address: 'Main Street, Vijayawada',
          phone: '+91 98765 43210',
          isActive: true,
        },
      });
    }
    testBranchId = branch.id;

    // 2. Resolve or create Super Admin
    let superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
    if (!superAdmin) {
      superAdmin = await prisma.user.create({
        data: {
          username: `sa_reg_${Date.now()}`,
          email: `sa_reg_${Date.now()}@confidos.test`,
          fullName: 'Regression Super Admin',
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

    // 3. Resolve or create Branch Admin
    let branchAdmin = await prisma.user.findFirst({
      where: { role: 'BRANCH_ADMIN', branchId: branch.id, isActive: true },
    });
    if (!branchAdmin) {
      branchAdmin = await prisma.user.create({
        data: {
          username: `ba_reg_${Date.now()}`,
          email: `ba_reg_${Date.now()}@confidos.test`,
          fullName: 'Regression Branch Admin',
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

    // 4. Resolve or create Cashier
    let cashier = await prisma.user.findFirst({
      where: { role: 'BILLING_USER', branchId: branch.id, isActive: true },
    });
    if (!cashier) {
      cashier = await prisma.user.create({
        data: {
          username: `cash_reg_${Date.now()}`,
          email: `cash_reg_${Date.now()}@confidos.test`,
          fullName: 'Regression Cashier',
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

    // 5. Resolve or create synthetic test supplier
    let supplier = await prisma.supplier.findFirst({ where: { isActive: true } });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          name: `Audit Supplier ${Date.now()}`,
          phone: `+91 99999 ${Math.floor(10000 + Math.random() * 90000)}`,
          email: `supplier_${Date.now()}@test.com`,
          isActive: true,
        },
      });
    }
    testSupplierId = supplier.id;
  });

  // =========================================================================
  // DEF-001 REGRESSION TEST: Packaging Unit Base Quantity on Cancel Purchase
  // =========================================================================
  describe('DEF-001 Regression: Purchase Cancellation Unit Conversion Stock Reversal', () => {
    it('correctly deducts full base units when cancelling a purchase recorded in packaging units (Boxes -> Tablets)', async () => {
      // 1. Create medicine configured with 1 Box = 100 Tablets (conversionFactor = 100)
      const uniqueSuffix = Date.now();
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-CANCEL-${uniqueSuffix}`,
          brandName: `Cancel Test Drug ${uniqueSuffix}`,
          genericName: 'Paracetamol 500 mg',
          strength: '500 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Confidos Pharma Ltd',
          packSize: '100 Tablets Box',
          baseUnit: 'Tablet',
          packageUnit: 'Box',
          conversionFactor: 100, // 100 tablets per box
          gstRate: 12.0,
          mrp: 200.0,
          isActive: true,
        },
      });

      // 2. Post purchase invoice for 5 Boxes (5 * 100 = 500 Tablets received into stock)
      const invoiceNumber = `INV-SUP-CANCEL-${uniqueSuffix}`;
      const batchNumber = `B-CANCEL-${uniqueSuffix}`;

      const purchaseRes = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          branchId: testBranchId,
          supplierId: testSupplierId,
          supplierInvoiceNumber: invoiceNumber,
          invoiceDate: new Date().toISOString(),
          paymentMode: 'CASH',
          lines: [
            {
              medicineId: med.id,
              batchNumber,
              expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              quantity: 5, // 5 Boxes
              freeQuantity: 0,
              unit: 'Box',
              conversionFactor: 100,
              purchaseRate: 80.0, // ₹80 per box
              sellingRate: 150.0,
              mrp: 200.0,
              gstRate: 12.0,
            },
          ],
        });

      expect(purchaseRes.status).toBe(201);
      const purchaseId = purchaseRes.body.id;

      // 3. Verify database state: StockBatch should have received exactly 500 base units (tablets)
      const batchAfterPurchase = await prisma.stockBatch.findFirst({
        where: {
          branchId: testBranchId,
          medicineId: med.id,
          batchNumber,
        },
      });
      expect(batchAfterPurchase).toBeDefined();
      expect(batchAfterPurchase?.quantityReceived).toBe(500);
      expect(batchAfterPurchase?.availableQuantity).toBe(500);
      expect(batchAfterPurchase?.status).toBe('ACTIVE');

      // 4. Cancel the purchase invoice with valid reason
      const cancelRes = await request(app)
        .post(`/api/purchases/${purchaseId}/cancel`)
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          reason: 'Supplier delivered damaged consignments; full invoice cancelled.',
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.message).toContain('cancelled successfully');

      const invoiceInDb = await prisma.purchaseInvoice.findUnique({ where: { id: purchaseId } });
      expect(invoiceInDb?.status).toBe('CANCELLED');

      // 5. Verify batch stock in database:
      // DEF-001 bug was: deducted only 5 units (500 - 5 = 495 ghost units left).
      // Fixed behavior: deducts all 500 units (500 - 500 = 0), status marked DEPLETED!
      const batchAfterCancel = await prisma.stockBatch.findUnique({
        where: { id: batchAfterPurchase!.id },
      });
      expect(batchAfterCancel?.availableQuantity).toBe(0);
      expect(batchAfterCancel?.quantityReceived).toBe(0);
      expect(batchAfterCancel?.status).toBe('DEPLETED');

      // 6. Verify stock movement audit trail recorded -500 base units
      const cancelMovement = await prisma.stockMovement.findFirst({
        where: {
          branchId: testBranchId,
          medicineId: med.id,
          batchId: batchAfterPurchase!.id,
          movementType: 'STOCK_CORRECTION',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(cancelMovement).toBeDefined();
      expect(cancelMovement?.quantityDelta).toBe(-500);
    });

    it('blocks cancellation if available stock has been partially sold at retail counter', async () => {
      const uniqueSuffix = Date.now() + 1;
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-PARTIAL-${uniqueSuffix}`,
          brandName: `Partial Sale Drug ${uniqueSuffix}`,
          genericName: 'Amoxicillin 500 mg',
          strength: '500 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Cipla',
          packSize: '10 Strips Box',
          baseUnit: 'Tablet',
          packageUnit: 'Box',
          conversionFactor: 100,
          gstRate: 5.0,
          mrp: 100.0,
          isActive: true,
        },
      });

      const batchNum = `B-PARTIAL-${uniqueSuffix}`;
      const purchaseRes = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          branchId: testBranchId,
          supplierId: testSupplierId,
          supplierInvoiceNumber: `INV-PARTIAL-${uniqueSuffix}`,
          invoiceDate: new Date().toISOString(),
          paymentMode: 'CASH',
          lines: [
            {
              medicineId: med.id,
              batchNumber: batchNum,
              expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              quantity: 2, // 2 boxes = 200 tablets
              conversionFactor: 100,
              purchaseRate: 50.0,
              sellingRate: 80.0,
              mrp: 100.0,
              gstRate: 5.0,
            },
          ],
        });

      expect(purchaseRes.status).toBe(201);
      const purchaseId = purchaseRes.body.id;

      // Sell 10 tablets at retail counter
      const batch = await prisma.stockBatch.findFirst({
        where: { branchId: testBranchId, medicineId: med.id, batchNumber: batchNum },
      });

      const saleRes = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId: testBranchId,
          customerName: 'Test Patient',
          items: [
            {
              medicineId: med.id,
              batchId: batch!.id,
              quantity: 10,
              unit: 'Tablet',
            },
          ],
        });

      expect(saleRes.status).toBe(201);

      // Now attempt to cancel the purchase: 200 were received, only 190 remain
      const cancelRes = await request(app)
        .post(`/api/purchases/${purchaseId}/cancel`)
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          reason: 'Attempting invalid cancellation of sold goods',
        });

      expect(cancelRes.status).toBe(400);
      expect(cancelRes.body.message).toContain('remain in stock');

      // Verify stock was preserved at 190
      const batchCheck = await prisma.stockBatch.findUnique({ where: { id: batch!.id } });
      expect(batchCheck?.availableQuantity).toBe(190);
    });
  });

  // =========================================================================
  // DEF-004 REGRESSION TEST: Standardized User-Facing Guidance on Bulk Deletions
  // =========================================================================
  describe('DEF-004 Regression: Standardized User Guidance on Prohibited Bulk Deletions', () => {
    it('returns exact standardized Super Admin guidance when Branch Admin calls bulkDeleteProducts', async () => {
      const res = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          ids: ['dummy-id-1', 'dummy-id-2'],
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        'You do not have permission to delete these records. Please contact the Super Admin for assistance.'
      );
    });

    it('returns exact standardized Super Admin guidance when Branch Admin calls bulkDeleteSuppliers', async () => {
      const res = await request(app)
        .post('/api/suppliers/bulk-delete')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          ids: ['dummy-supplier-1'],
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        'You do not have permission to delete these records. Please contact the Super Admin for assistance.'
      );
    });

    it('allows Super Admin to perform bulk deletions on unreferenced records', async () => {
      // Create temporary unreferenced product
      const tempMed = await prisma.medicineProduct.create({
        data: {
          internalCode: `TEMP-DEL-${Date.now()}`,
          brandName: `Temp Med ${Date.now()}`,
          genericName: 'Temp Generic',
          strength: '100 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Temp Pharma',
          packSize: '10 Tablets',
          gstRate: 5.0,
          mrp: 10.0,
          isActive: true,
        },
      });

      const res = await request(app)
        .post('/api/products/bulk-delete')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          ids: [tempMed.id],
        });

      expect(res.status).toBe(200);
      expect(res.body.deleted.length).toBeGreaterThanOrEqual(1);
      expect(res.body.totalProcessed).toBeGreaterThanOrEqual(1);

      // Verify product is gone
      const deletedCheck = await prisma.medicineProduct.findUnique({ where: { id: tempMed.id } });
      expect(deletedCheck).toBeNull();
    });
  });
});
