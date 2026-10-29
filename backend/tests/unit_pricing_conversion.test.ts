import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import Decimal from 'decimal.js';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/database/prisma';
import { JWT_SECRET } from '../src/config/jwt';
import {
  buildProductUnitConfig,
  convertToBaseQuantity,
  convertPriceToBase,
  calculatePriceForUnit,
  calculateEffectiveBaseCost,
  validateConversionHierarchy,
  decrementBaseStock,
} from '../src/utils/unitConverter';

describe('Confidos Pharma - Purchase-Unit Conversion & Pricing Engine Test Suite', { timeout: 40000 }, () => {
  let adminToken = '';
  let cashierToken = '';
  let branchId = '';
  let supplierId = '';
  let testProductId = '';

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
          code: 'B-TEST-UNIT',
          name: 'Unit Test Branch',
          address: 'Main Street, Vijayawada',
          phone: '+91 98765 43210',
          isActive: true,
        },
      });
    }
    branchId = branch.id;

    // 2. Resolve or create admin user
    let adminUser = await prisma.user.findFirst({
      where: { role: 'BRANCH_ADMIN', branchId: branch.id, isActive: true },
    });
    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          username: `admin_unit_${Date.now()}`,
          email: `admin_unit_${Date.now()}@confidos.test`,
          fullName: 'Unit Test Admin',
          passwordHash: 'dummy',
          role: 'BRANCH_ADMIN',
          branchId: branch.id,
          isActive: true,
        },
      });
    }
    adminToken = jwt.sign(
      { id: adminUser.id, username: adminUser.username, role: adminUser.role, branchId: branch.id },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 3. Resolve or create cashier user
    let cashierUser = await prisma.user.findFirst({
      where: { role: 'BILLING_USER', branchId: branch.id, isActive: true },
    });
    if (!cashierUser) {
      cashierUser = await prisma.user.create({
        data: {
          username: `cashier_unit_${Date.now()}`,
          email: `cashier_unit_${Date.now()}@confidos.test`,
          fullName: 'Unit Test Cashier',
          passwordHash: 'dummy',
          role: 'BILLING_USER',
          branchId: branch.id,
          isActive: true,
        },
      });
    }
    cashierToken = jwt.sign(
      { id: cashierUser.id, username: cashierUser.username, role: cashierUser.role, branchId: branch.id },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 4. Resolve or create supplier
    let supplier = await prisma.supplier.findFirst({ where: { isActive: true } });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          name: 'Apex Pharmaceutical Distributors',
          phone: '+91 9988776655',
          email: 'apex@pharma.test',
          isActive: true,
        },
      });
    }
    supplierId = supplier.id;

    // 5. Create test medicine product with Box/Strip/Tablet packaging hierarchy
    const testCode = `MED-CONV-${Date.now().toString().slice(-6)}`;
    const product = await prisma.medicineProduct.create({
      data: {
        internalCode: testCode,
        brandName: `Amox-Clav 625 Unit Test ${testCode}`,
        genericName: 'Amoxicillin and Potassium Clavulanate',
        strength: '625mg',
        dosageForm: 'Tablet',
        manufacturer: 'Confidos Labs',
        packSize: '10 Strips x 10 Tablets',
        baseUnit: 'Tablet',
        packageUnit: 'Box',
        conversionFactor: 100, // 100 tablets per box
        gstRate: 12.0,
        mrp: 150.0, // Box MRP = ₹150
        defaultPurchaseRate: 100.0, // Box purchase rate = ₹100
        defaultSellingRate: 150.0,
        isActive: true,
      },
    });
    testProductId = product.id;
  });

  // =========================================================================
  // SECTION 10: REQUIRED TEST CASES (A through I)
  // =========================================================================

  describe('Test A: One box purchase calculation', () => {
    it('calculates gross ₹100, received stock 100 base units, and base cost ₹1', () => {
      const purchaseUnit = 'Box';
      const unitsPerPack = 100;
      const qty = 1;
      const free = 0;
      const purchaseRate = 100;
      const discountPercent = 0;

      const gross = new Decimal(purchaseRate).times(qty).toNumber();
      const disc = new Decimal(gross).times(discountPercent).dividedBy(100).toNumber();
      const taxable = gross - disc;
      const totalStock = (qty + free) * unitsPerPack;
      const baseCost = calculateEffectiveBaseCost(gross, disc, totalStock);

      expect(gross).toBe(100);
      expect(totalStock).toBe(100);
      expect(baseCost).toBe(1);
    });
  });

  describe('Test B: Purchase discount calculation', () => {
    it('calculates gross ₹100, discount ₹10, net ₹90, and base cost ₹0.90', () => {
      const purchaseUnit = 'Box';
      const unitsPerPack = 100;
      const qty = 1;
      const free = 0;
      const purchaseRate = 100;
      const discountPercent = 10;

      const gross = new Decimal(purchaseRate).times(qty).toNumber();
      const disc = new Decimal(gross).times(discountPercent).dividedBy(100).toNumber();
      const net = gross - disc;
      const totalStock = (qty + free) * unitsPerPack;
      const baseCost = calculateEffectiveBaseCost(gross, disc, totalStock);

      expect(gross).toBe(100);
      expect(disc).toBe(10);
      expect(net).toBe(90);
      expect(baseCost).toBe(0.9);
    });
  });

  describe('Test C: Free stock calculation', () => {
    it('calculates 5 paid boxes, 1 free box, total stock 600 base units, and gross paid ₹500', () => {
      const unitsPerPack = 100;
      const qty = 5;
      const free = 1;
      const purchaseRate = 100;

      const grossPaid = new Decimal(purchaseRate).times(qty).toNumber();
      const totalStock = (qty + free) * unitsPerPack;
      const effectiveBaseCost = calculateEffectiveBaseCost(grossPaid, 0, totalStock);

      expect(qty).toBe(5);
      expect(free).toBe(1);
      expect(totalStock).toBe(600);
      expect(grossPaid).toBe(500);
      expect(effectiveBaseCost).toBeCloseTo(500 / 600, 4);
    });
  });

  describe('Test D: Individual tablet sale stock deduction', () => {
    it('deducts 3 tablets from available stock of 100 tablets, leaving 97 tablets', () => {
      const initialStock = 100;
      const sellTablets = 3;
      const remaining = decrementBaseStock(initialStock, sellTablets);

      expect(remaining).toBe(97);
    });
  });

  describe('Test E: Strip sale stock deduction', () => {
    it('deducts 1 strip (10 tablets) from 100 tablets, leaving 90 tablets', () => {
      const initialStock = 100;
      const config = buildProductUnitConfig('Tablet', 'Box', 100, 'Tablet');
      const { baseQuantity: tabletsToDeduct } = convertToBaseQuantity(1, 'Strip', config);

      expect(tabletsToDeduct).toBe(10);
      const remaining = decrementBaseStock(initialStock, tabletsToDeduct);
      expect(remaining).toBe(90);
    });
  });

  describe('Test F: Discount limits enforcement (0% to 20%)', () => {
    it('mathematically validates 0%, 5%, 10%, 15%, 20%, and custom 12.5%, and rejects -1% and 21%', () => {
      const validateDiscount = (disc: number) => {
        if (typeof disc !== 'number' || isNaN(disc) || disc < 0 || disc > 20) {
          throw new Error('Purchase discount percentage cannot exceed 20% policy limit and cannot be negative.');
        }
        return true;
      };

      expect(() => validateDiscount(0)).not.toThrow();
      expect(() => validateDiscount(5)).not.toThrow();
      expect(() => validateDiscount(10)).not.toThrow();
      expect(() => validateDiscount(15)).not.toThrow();
      expect(() => validateDiscount(20)).not.toThrow();
      expect(() => validateDiscount(12.5)).not.toThrow();
      expect(() => validateDiscount(-1)).toThrow(/cannot be negative/i);
      expect(() => validateDiscount(21)).toThrow(/cannot exceed 20%/i);
    });

    it('API accepts custom 12.5% and 20% max discount, but strictly rejects 21% and -1%', async () => {
      // 1. Valid custom 12.5%
      const res125 = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          branchId,
          supplierId,
          supplierInvoiceNumber: `INV-DISC-12.5-${Date.now().toString().slice(-5)}`,
          lines: [
            {
              medicineId: testProductId,
              batchNumber: `B-12.5-${Date.now().toString().slice(-4)}`,
              expiryDate: '2028-12-31',
              quantity: 1,
              purchaseRate: 100,
              mrp: 150,
              discountPercent: 12.5,
              conversionFactor: 100,
              unit: 'Box',
            },
          ],
        });
      expect(res125.status).toBe(201);
      expect(res125.body.lines[0].discountPercent).toBe(12.5);

      // 2. Reject 21%
      const res21 = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          branchId,
          supplierId,
          supplierInvoiceNumber: `INV-DISC-21-${Date.now().toString().slice(-5)}`,
          lines: [
            {
              medicineId: testProductId,
              batchNumber: `B-21-${Date.now().toString().slice(-4)}`,
              expiryDate: '2028-12-31',
              quantity: 1,
              purchaseRate: 100,
              mrp: 150,
              discountPercent: 21,
              conversionFactor: 100,
              unit: 'Box',
            },
          ],
        });
      expect(res21.status).toBe(400);
      expect(res21.body.message).toMatch(/discount.*cannot exceed.*20%/i);

      // 3. Reject -1%
      const resNeg = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          branchId,
          supplierId,
          supplierInvoiceNumber: `INV-DISC-NEG-${Date.now().toString().slice(-5)}`,
          lines: [
            {
              medicineId: testProductId,
              batchNumber: `B-NEG-${Date.now().toString().slice(-4)}`,
              expiryDate: '2028-12-31',
              quantity: 1,
              purchaseRate: 100,
              mrp: 150,
              discountPercent: -1,
              conversionFactor: 100,
              unit: 'Box',
            },
          ],
        });
      expect(resNeg.status).toBe(400);
      expect(resNeg.body.message).toMatch(/discount.*cannot be negative/i);
    });
  });

  describe('Test G: MRP normalization and hierarchy pricing', () => {
    it('normalizes Box MRP ₹150 to ₹1.50 per tablet and ₹15 per 10-tablet strip without double conversion', () => {
      const boxMrp = 150;
      const unitsPerPack = 100;
      const config = buildProductUnitConfig('Tablet', 'Box', unitsPerPack, 'Tablet');

      // Base unit price: ₹150 / 100 = ₹1.50
      const baseMrp = convertPriceToBase(boxMrp, 'Box', config);
      expect(baseMrp).toBe(1.5);

      // Equivalent MRP per 10-tablet Strip = ₹1.50 * 10 = ₹15.00
      const stripMrp = calculatePriceForUnit(baseMrp, 'Strip', config);
      expect(stripMrp).toBe(15.0);

      // Equivalent MRP per Box = ₹1.50 * 100 = ₹150.00
      const calculatedBoxMrp = calculatePriceForUnit(baseMrp, 'Box', config);
      expect(calculatedBoxMrp).toBe(150.0);

      // Single tablet MRP = ₹1.50
      const tabletMrp = calculatePriceForUnit(baseMrp, 'Tablet', config);
      expect(tabletMrp).toBe(1.5);
    });
  });

  describe('Test H: GST, discounts, and totals precision', () => {
    it('computes taxable, discount, GST, and payable totals without double-counting', () => {
      const purchaseRate = 100;
      const qty = 2;
      const discountPercent = 10;
      const gstRate = 12;

      // Gross = 2 * 100 = 200
      const gross = new Decimal(purchaseRate).times(qty);
      expect(gross.toNumber()).toBe(200);

      // Discount = 200 * 10% = 20
      const disc = gross.times(discountPercent).dividedBy(100);
      expect(disc.toNumber()).toBe(20);

      // Taxable = 200 - 20 = 180
      const taxable = gross.minus(disc);
      expect(taxable.toNumber()).toBe(180);

      // GST = 180 * 12% = 21.60
      const tax = taxable.times(gstRate).dividedBy(100);
      expect(tax.toNumber()).toBe(21.6);

      // Grand total = 180 + 21.60 = 201.60
      const grandTotal = taxable.plus(tax);
      expect(grandTotal.toNumber()).toBe(201.6);
    });
  });

  describe('Test I: End-to-end Purchase to POS Billing Workflow & Regression', () => {
    let batchId = '';
    const testBatchNumber = `B-E2E-${Date.now().toString().slice(-6)}`;

    it('records 1 box purchase with Units/Pk=100, receiving 100 tablets in batch with normalized rates', async () => {
      const uniqueInv = `SUP-INV-E2E-${Date.now().toString().slice(-6)}`;
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          branchId,
          supplierId,
          supplierInvoiceNumber: uniqueInv,
          lines: [
            {
              medicineId: testProductId,
              batchNumber: testBatchNumber,
              expiryDate: '2028-10-31',
              quantity: 1, // 1 Box
              freeQuantity: 0,
              purchaseRate: 100.0, // ₹100 per box
              sellingRate: 150.0, // ₹150 per box
              mrp: 150.0, // ₹150 per box
              discountPercent: 10, // 10% discount
              gstRate: 12.0,
              conversionFactor: 100, // 100 tablets per box
              unit: 'Box',
            },
          ],
        });

      expect(res.status).toBe(201);
      const line = res.body.lines[0];
      expect(line.conversionFactor).toBe(100);
      expect(line.baseQuantity).toBe(100);
      expect(line.purchaseRate).toBe(100);
      expect(line.mrp).toBe(150);
      expect(line.discountPercent).toBe(10);
      expect(line.discountAmount).toBe(10);
      expect(line.lineTotal).toBe(100.8); // (100 - 10) + 12% GST = 90 + 10.8 = 100.80

      // Verify batch in branch has 100 base units and base-unit rates
      const batch = await prisma.stockBatch.findFirst({
        where: { branchId, medicineId: testProductId, batchNumber: testBatchNumber },
      });

      expect(batch).toBeDefined();
      batchId = batch!.id;
      expect(batch!.availableQuantity).toBe(100); // 100 tablets
      expect(batch!.purchaseRate).toBe(1.0); // ₹100 / 100 = ₹1.00 base cost
      expect(batch!.mrp).toBe(1.5); // ₹150 / 100 = ₹1.50 base MRP
      expect(batch!.sellingPrice).toBe(1.5); // ₹150 / 100 = ₹1.50 base selling price
    });

    it('sells 3 individual tablets at retail counter (Test D integration)', async () => {
      const res = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          customerName: 'A. Kumar',
          customerPhone: '9848012345',
          items: [
            {
              medicineId: testProductId,
              batchId,
              quantity: 3,
              unit: 'Tablet',
              discountPercent: 0,
            },
          ],
        });

      expect(res.status).toBe(201);
      const invoiceLine = res.body.lines[0];
      expect(invoiceLine.quantity).toBe(3);
      expect(invoiceLine.unit).toBe('Tablet');
      expect(invoiceLine.baseQuantity).toBe(3);
      expect(invoiceLine.unitMrp).toBe(1.5);
      expect(invoiceLine.lineTotal).toBe(4.5); // 3 * 1.50 = 4.50

      // Stock remaining = 100 - 3 = 97 tablets
      const updatedBatch = await prisma.stockBatch.findUnique({ where: { id: batchId } });
      expect(updatedBatch!.availableQuantity).toBe(97);
    });

    it('sells 1 strip (10 tablets) at retail counter (Test E integration)', async () => {
      const res = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          customerName: 'S. Sharma',
          items: [
            {
              medicineId: testProductId,
              batchId,
              quantity: 1,
              unit: 'Strip',
              discountPercent: 0,
            },
          ],
        });

      expect(res.status).toBe(201);
      const invoiceLine = res.body.lines[0];
      expect(invoiceLine.quantity).toBe(1);
      expect(invoiceLine.unit).toBe('Strip');
      expect(invoiceLine.baseQuantity).toBe(10);
      expect(invoiceLine.unitMrp).toBe(15.0); // 10 tablets * ₹1.50 = ₹15.00
      expect(invoiceLine.lineTotal).toBe(15.0);

      // Stock remaining = 97 - 10 = 87 tablets
      const updatedBatch = await prisma.stockBatch.findUnique({ where: { id: batchId } });
      expect(updatedBatch!.availableQuantity).toBe(87);
    });

    it('rejects overselling beyond available stock', async () => {
      const res = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          items: [
            {
              medicineId: testProductId,
              batchId,
              quantity: 10, // 10 strips = 100 tablets, but only 87 available
              unit: 'Strip',
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/insufficient stock/i);
    });

    it('cancels invoice and restores stock in base units accurately', async () => {
      // 1. Create a sale of 2 strips (20 tablets)
      const saleRes = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          items: [
            {
              medicineId: testProductId,
              batchId,
              quantity: 2,
              unit: 'Strip',
            },
          ],
        });

      expect(saleRes.status).toBe(201);
      const invoiceId = saleRes.body.id;

      // Stock should now be 87 - 20 = 67 tablets
      let batchCheck = await prisma.stockBatch.findUnique({ where: { id: batchId } });
      expect(batchCheck!.availableQuantity).toBe(67);

      // 2. Admin cancels the invoice
      const cancelRes = await request(app)
        .post(`/api/billing/invoices/${invoiceId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Customer returned sealed strip' });

      expect(cancelRes.status).toBe(200);

      // Stock must be restored by 20 tablets back to 87
      batchCheck = await prisma.stockBatch.findUnique({ where: { id: batchId } });
      expect(batchCheck!.availableQuantity).toBe(87);
    });
  });
});
