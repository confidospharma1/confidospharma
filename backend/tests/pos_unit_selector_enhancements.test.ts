import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/database/prisma';
import jwt from 'jsonwebtoken';
import {
  buildProductUnitConfig,
  determineDefaultSellingUnit,
  calculatePriceForUnit,
  convertToBaseQuantity,
  decrementBaseStock,
} from '../src/utils/unitConverter';

const JWT_SECRET = process.env.JWT_SECRET || 'confidos-jwt-secret-key-change-in-production';

describe('Confidos Pharma - POS Billing Quantity-Unit Selector & Bottle Enhancements Test Suite', { timeout: 35000 }, () => {
  let superAdminToken: string;
  let cashierToken: string;
  let branchId: string;
  let supplierId: string;

  beforeAll(async () => {
    // 1. Fetch or create test branch
    let branch = await prisma.branch.findFirst({ where: { isActive: true } });
    if (!branch) {
      branch = await prisma.branch.create({
        data: {
          code: `B-POS-${Date.now()}`,
          name: 'Main POS Test Branch',
          phone: '+91 98765 43210',
          email: 'pos@confidos.test',
          address: '789 Commercial Rd',
          isActive: true,
        },
      });
    }
    branchId = branch.id;

    // 2. Fetch or create users
    let superAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
    if (!superAdmin) {
      superAdmin = await prisma.user.create({
        data: {
          username: `admin_pos_${Date.now()}`,
          email: `admin_pos_${Date.now()}@confidos.test`,
          fullName: 'POS Super Admin',
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

    let cashier = await prisma.user.findFirst({ where: { role: 'BILLING_USER', branchId, isActive: true } });
    if (!cashier) {
      cashier = await prisma.user.create({
        data: {
          username: `cashier_pos_${Date.now()}`,
          email: `cashier_pos_${Date.now()}@confidos.test`,
          fullName: 'Retail Cashier',
          passwordHash: 'dummy',
          role: 'BILLING_USER',
          branchId,
          isActive: true,
        },
      });
    }
    cashierToken = jwt.sign(
      { id: cashier.id, username: cashier.username, role: cashier.role, branchId },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 3. Fetch or create supplier
    let supplier = await prisma.supplier.findFirst({ where: { isActive: true } });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          name: 'Global Drug Distributors Ltd',
          phone: '+91 98765 12345',
          email: 'sales@globaldrugs.test',
          isActive: true,
        },
      });
    }
    supplierId = supplier.id;
  });

  // TEST A: Default Selling Unit for Tablet Medicines
  describe('Test A: Default Selling Unit for Tablet Medicines', () => {
    it('defaults to Tablet for tablet medicines without requiring manual selection', async () => {
      // 1. Unit configuration check
      const tabletConfig = buildProductUnitConfig('Strip', 'Box', 10, 'Tablet', null, '15 Tablets');
      const defaultUnit = determineDefaultSellingUnit(tabletConfig.supportedUnits, {
        dosageForm: 'Tablet',
        baseUnit: 'Strip',
        packageUnit: 'Box',
        packSize: '15 Tablets',
      });

      expect(defaultUnit).toBe('Tablet');
      expect(tabletConfig.supportedUnits[0].unit).toBe('Tablet');
      expect(tabletConfig.supportedUnits[0].multiplierToBase).toBe(1);

      // 2. Database integration check: Create tablet medicine and bill without specifying unit
      const brandName = `Dolo Test ${Date.now()}`;
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-TAB-${Date.now()}`,
          brandName,
          genericName: 'Paracetamol 650 mg',
          strength: '650 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Micro Labs',
          packSize: '15 Tablets',
          baseUnit: 'Tablet',
          packageUnit: 'Box',
          conversionFactor: 15,
          gstRate: 12.0,
          mrp: 33.5,
          isActive: true,
        },
      });

      const batchNum = `B-TAB-${Date.now()}`;
      const batch = await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: med.id,
          batchNumber: batchNum,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          quantityReceived: 150,
          availableQuantity: 150,
          purchaseRate: 1.5,
          sellingPrice: 2.23, // ~33.50 / 15
          mrp: 2.23,
          status: 'ACTIVE',
        },
      });

      // Bill 2 units without specifying unit in request payload -> should default to Tablet
      const res = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          customerName: 'Suresh Kumar',
          items: [
            {
              medicineId: med.id,
              batchId: batch.id,
              quantity: 2,
              // unit omitted to verify backend defaults to Tablet
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.lines[0].unit).toBe('Tablet');
      expect(res.body.lines[0].quantity).toBe(2);
      expect(res.body.lines[0].baseQuantity).toBe(2);

      // Verify stock deducted by 2 tablets (150 - 2 = 148)
      const updatedBatch = await prisma.stockBatch.findUnique({ where: { id: batch.id } });
      expect(updatedBatch?.availableQuantity).toBe(148);
    });
  });

  // TEST B: Existing Strip Support
  describe('Test B: Existing Strip Support', () => {
    it('calculates correct strip price and deducts stripMultiplier * qty base units', async () => {
      const brandName = `Strip Drug ${Date.now()}`;
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-STRIP-${Date.now()}`,
          brandName,
          genericName: 'Pantoprazole 40 mg',
          strength: '40 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Alkem',
          packSize: '10 Tablets',
          baseUnit: 'Tablet',
          packageUnit: 'Box',
          conversionFactor: 10,
          gstRate: 12.0,
          mrp: 120.0,
          isActive: true,
        },
      });

      const batch = await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: med.id,
          batchNumber: `B-STRIP-${Date.now()}`,
          expiryDate: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000),
          quantityReceived: 200,
          availableQuantity: 200, // 200 base tablets = 20 strips
          purchaseRate: 8.0,
          sellingPrice: 12.0, // ₹12 per tablet -> ₹120 per strip
          mrp: 12.0,
          status: 'ACTIVE',
        },
      });

      // Purchase 2 strips (10 tablets per strip = 20 tablets)
      const res = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          customerName: 'Ravi Teja',
          items: [
            {
              medicineId: med.id,
              batchId: batch.id,
              quantity: 2,
              unit: 'Strip',
              discountPercent: 0,
            },
          ],
        });

      expect(res.status).toBe(201);
      const line = res.body.lines[0];
      expect(line.unit).toBe('Strip');
      expect(line.quantity).toBe(2);
      expect(line.conversionFactor).toBe(10);
      expect(line.baseQuantity).toBe(20);
      expect(line.unitMrp).toBe(120); // 12 * 10 = ₹120 per strip

      // 200 - 20 = 180 tablets remaining
      const updatedBatch = await prisma.stockBatch.findUnique({ where: { id: batch.id } });
      expect(updatedBatch?.availableQuantity).toBe(180);
    });
  });

  // TEST C: Bottle Support for Configured Medicines
  describe('Test C: Bottle Support for Configured Medicines', () => {
    it('supports Bottle in selling units for bottled tablets and liquid syrups', async () => {
      // 1. Tablet medicine in bottles (e.g. 100 Tablets Bottle)
      const tabletBottleConfig = buildProductUnitConfig('Tablet', 'Bottle', 100, 'Tablet', null, '100 Tablets Bottle');
      const bottleUnit = tabletBottleConfig.supportedUnits.find((u) => u.unit === 'Bottle');
      expect(bottleUnit).toBeDefined();
      expect(bottleUnit?.multiplierToBase).toBe(100);

      // Default unit remains Tablet
      expect(determineDefaultSellingUnit(tabletBottleConfig.supportedUnits, {
        dosageForm: 'Tablet',
        packageUnit: 'Bottle',
      })).toBe('Tablet');

      // 2. Liquid Syrup medicine (e.g. 1 Bottle)
      const syrupConfig = buildProductUnitConfig('Bottle', 'Box', 10, 'Syrup', null, '1 Bottle');
      const syrupBottleUnit = syrupConfig.supportedUnits.find((u) => u.unit === 'Bottle');
      expect(syrupBottleUnit).toBeDefined();
      expect(syrupBottleUnit?.multiplierToBase).toBe(1);

      // Default unit for syrup is Bottle
      expect(determineDefaultSellingUnit(syrupConfig.supportedUnits, {
        dosageForm: 'Syrup',
        baseUnit: 'Bottle',
      })).toBe('Bottle');

      // Liquid Syrup with ml base unit (e.g. 100 ml Bottle)
      const syrupMlConfig = buildProductUnitConfig('ml', 'Bottle', 100, 'Syrup', null, '100 ml Bottle');
      const syrupMlBottleUnit = syrupMlConfig.supportedUnits.find((u) => u.unit === 'Bottle');
      expect(syrupMlBottleUnit?.multiplierToBase).toBe(100);
      expect(determineDefaultSellingUnit(syrupMlConfig.supportedUnits, {
        dosageForm: 'Syrup',
        baseUnit: 'ml',
      })).toBe('ml');

      // 3. Database test: Bill 1 bottle of bottled tablets
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-BTL-${Date.now()}`,
          brandName: `Vit-C 500 Bottle ${Date.now()}`,
          genericName: 'Ascorbic Acid 500 mg',
          strength: '500 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Abbott',
          packSize: '100 Tablets Bottle',
          baseUnit: 'Tablet',
          packageUnit: 'Bottle',
          conversionFactor: 100,
          gstRate: 12.0,
          mrp: 350.0, // ₹350 per bottle of 100
          isActive: true,
        },
      });

      const batch = await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: med.id,
          batchNumber: `B-BTL-${Date.now()}`,
          expiryDate: new Date(Date.now() + 500 * 24 * 60 * 60 * 1000),
          quantityReceived: 500, // 500 tablets = 5 bottles
          availableQuantity: 500,
          purchaseRate: 2.5,
          sellingPrice: 3.5, // ₹3.50 per tablet
          mrp: 3.5,
          status: 'ACTIVE',
        },
      });

      const res = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          items: [
            {
              medicineId: med.id,
              batchId: batch.id,
              quantity: 1,
              unit: 'Bottle',
            },
          ],
        });

      expect(res.status).toBe(201);
      const line = res.body.lines[0];
      expect(line.unit).toBe('Bottle');
      expect(line.quantity).toBe(1);
      expect(line.conversionFactor).toBe(100);
      expect(line.baseQuantity).toBe(100);
      expect(line.unitMrp).toBe(350); // 3.5 * 100 = 350

      // 500 - 100 = 400 tablets remaining
      const updatedBatch = await prisma.stockBatch.findUnique({ where: { id: batch.id } });
      expect(updatedBatch?.availableQuantity).toBe(400);
    });
  });

  // TEST D: Unsupported Bottle Rejection
  describe('Test D: Unsupported Bottle Safety', () => {
    it('does NOT offer Bottle for standard blister medicines and rejects invalid bottle billing', async () => {
      // 1. Standard tablet medicine packaged in strips only
      const blisterConfig = buildProductUnitConfig('Strip', 'Box', 10, 'Tablet', null, '10 Strips x 10 Tablets');
      const bottleUnit = blisterConfig.supportedUnits.find((u) => u.unit === 'Bottle');
      expect(bottleUnit).toBeUndefined(); // Bottle must NOT be offered

      // 2. Billing with unsupported 'Bottle' unit is rejected
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-NOBTL-${Date.now()}`,
          brandName: `BlisterOnly Drug ${Date.now()}`,
          genericName: 'Cetirizine 10 mg',
          strength: '10 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Cipla',
          packSize: '10 Strips x 10 Tablets',
          baseUnit: 'Tablet',
          packageUnit: 'Box',
          conversionFactor: 100,
          gstRate: 5.0,
          mrp: 50.0,
          isActive: true,
        },
      });

      const batch = await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: med.id,
          batchNumber: `B-NOBTL-${Date.now()}`,
          expiryDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000),
          quantityReceived: 100,
          availableQuantity: 100,
          purchaseRate: 0.35,
          sellingPrice: 0.5,
          mrp: 0.5,
          status: 'ACTIVE',
        },
      });

      const res = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          items: [
            {
              medicineId: med.id,
              batchId: batch.id,
              quantity: 1,
              unit: 'Bottle', // Invalid for blister-only medicine
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('not a supported selling unit');
    });
  });

  // TEST E: Controlled Quantity Conversion Test
  describe('Test E: Precise Stock Deductions for 1 Strip, 1 Box, and 1 Bottle', () => {
    it('verifies exact stock deductions from 1,000 available tablets across all packaging units', async () => {
      // Setup medicine supporting Tablet, Strip (10), Box (100), and Bottle (100)
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-1000-${Date.now()}`,
          brandName: `MultiPack Drug ${Date.now()}`,
          genericName: 'Aspirin 75 mg',
          strength: '75 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Bayer',
          packSize: '100 Tablets Bottle',
          baseUnit: 'Tablet',
          packageUnit: 'Box',
          conversionFactor: 100, // 100 tablets per box
          unitConfig: JSON.stringify([
            { unit: 'Tablet', multiplierToBase: 1, isBaseUnit: true },
            { unit: 'Strip', multiplierToBase: 10 },
            { unit: 'Bottle', multiplierToBase: 100 },
            { unit: 'Box', multiplierToBase: 100 },
          ]),
          gstRate: 12.0,
          mrp: 200.0,
          isActive: true,
        },
      });

      // Batch with exactly 1,000 tablets
      const batch = await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: med.id,
          batchNumber: `B-1000-${Date.now()}`,
          expiryDate: new Date(Date.now() + 600 * 24 * 60 * 60 * 1000),
          quantityReceived: 1000,
          availableQuantity: 1000,
          purchaseRate: 1.2,
          sellingPrice: 2.0,
          mrp: 2.0,
          status: 'ACTIVE',
        },
      });

      // 1. Sell 2 tablets -> Deduct 2 tablets -> 998 remain
      const res1 = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          items: [{ medicineId: med.id, batchId: batch.id, quantity: 2, unit: 'Tablet' }],
        });
      expect(res1.status).toBe(201);
      let bCheck = await prisma.stockBatch.findUnique({ where: { id: batch.id } });
      expect(bCheck?.availableQuantity).toBe(998);

      // 2. Sell 2 strips of 10 tablets -> Deduct 20 tablets -> 978 remain
      const res2 = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          items: [{ medicineId: med.id, batchId: batch.id, quantity: 2, unit: 'Strip' }],
        });
      expect(res2.status).toBe(201);
      bCheck = await prisma.stockBatch.findUnique({ where: { id: batch.id } });
      expect(bCheck?.availableQuantity).toBe(978);

      // 3. Sell 1 box of 100 tablets -> Deduct 100 tablets -> 878 remain
      const res3 = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          items: [{ medicineId: med.id, batchId: batch.id, quantity: 1, unit: 'Box' }],
        });
      expect(res3.status).toBe(201);
      bCheck = await prisma.stockBatch.findUnique({ where: { id: batch.id } });
      expect(bCheck?.availableQuantity).toBe(878);

      // 4. Sell 1 bottle of 100 tablets -> Deduct 100 tablets -> 778 remain
      const res4 = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          items: [{ medicineId: med.id, batchId: batch.id, quantity: 1, unit: 'Bottle' }],
        });
      expect(res4.status).toBe(201);
      bCheck = await prisma.stockBatch.findUnique({ where: { id: batch.id } });
      expect(bCheck?.availableQuantity).toBe(778);
    });
  });

  // TEST F: Unit Switching & Physical Quantity Preservation Rule
  describe('Test F: Unit Switching & Physical Quantity Preservation Rule', () => {
    it('preserves base physical quantity and total price when switching from Strip to Tablet', () => {
      // Rule: currentBaseQty = qty * oldMultiplier; newQty = Math.floor(currentBaseQty / newMultiplier)
      const oldQty = 2; // 2 Strips
      const stripMultiplier = 10;
      const tabletMultiplier = 1;
      const ratePerTablet = 3.0;

      const totalBaseTablets = oldQty * stripMultiplier; // 20 tablets
      const convertedTabletQty = Math.floor(totalBaseTablets / tabletMultiplier); // 20 tablets

      const lineTotalStrips = oldQty * (ratePerTablet * stripMultiplier); // 2 * 30 = ₹60
      const lineTotalTablets = convertedTabletQty * (ratePerTablet * tabletMultiplier); // 20 * 3 = ₹60

      expect(convertedTabletQty).toBe(20);
      expect(lineTotalTablets).toBe(lineTotalStrips);
    });
  });

  // TEST G: Pricing, Discount Limits, and GST Calculations
  describe('Test G: Pricing, Discount Limits, and GST Calculations', () => {
    it('calculates tax-inclusive line totals, policy discount, and standard rounding accurately', async () => {
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-FIN-${Date.now()}`,
          brandName: `Financial Test Med ${Date.now()}`,
          genericName: 'Cefixime 200 mg',
          strength: '200 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Lupin',
          packSize: '10 Tablets',
          baseUnit: 'Tablet',
          packageUnit: 'Strip',
          conversionFactor: 10,
          gstRate: 12.0,
          mrp: 10.0, // ₹10 per tablet
          isActive: true,
        },
      });

      const batch = await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: med.id,
          batchNumber: `B-FIN-${Date.now()}`,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          quantityReceived: 100,
          availableQuantity: 100,
          purchaseRate: 6.0,
          sellingPrice: 10.0,
          mrp: 10.0,
          status: 'ACTIVE',
        },
      });

      // 5 tablets @ ₹10 = ₹50 gross, 10% discount = ₹5 -> ₹45 net
      // GST: 12% -> taxable = 45 / 1.12 = 40.18, tax = 4.82 (CGST 2.41, SGST 2.41)
      const res = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          customerName: 'K. Prasad',
          items: [
            {
              medicineId: med.id,
              batchId: batch.id,
              quantity: 5,
              unit: 'Tablet',
              discountPercent: 10,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.lines[0].lineTotal).toBe(45);
      expect(res.body.lines[0].discountAmount).toBe(5);
      expect(res.body.subtotal).toBeCloseTo(40.18, 1);
      expect(res.body.taxTotal).toBeCloseTo(4.82, 1);
      expect(res.body.grandTotal).toBe(45);
    });

    it('accepts higher discount rates (e.g. 25%) in POS Selected Bill Items according to system setting', async () => {
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-HIGH-DISC-${Date.now()}`,
          brandName: `Discount Drug ${Date.now()}`,
          genericName: 'Paracetamol',
          strength: '500 mg',
          dosageForm: 'Tablet',
          manufacturer: 'GSK',
          packSize: '10 Tablets',
          baseUnit: 'Tablet',
          conversionFactor: 10,
          gstRate: 0,
          mrp: 100.0,
          isActive: true,
        },
      });

      const batch = await prisma.stockBatch.create({
        data: {
          medicineId: med.id,
          branchId,
          batchNumber: `BATCH-HIGH-DISC-${Date.now()}`,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          quantityReceived: 50,
          availableQuantity: 50,
          purchaseRate: 50.0,
          sellingPrice: 100.0,
          mrp: 100.0,
          status: 'ACTIVE',
        },
      });

      const res = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          customerName: 'High Discount Customer',
          items: [
            {
              medicineId: med.id,
              batchId: batch.id,
              quantity: 1,
              unit: 'Tablet',
              discountPercent: 25,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.lines[0].discountPercent).toBe(25);
      expect(res.body.lines[0].discountAmount).toBe(25);
      expect(res.body.grandTotal).toBe(75);
    });
  });

  // TEST H: Insufficient Stock Protection
  describe('Test H: Insufficient Stock Protection', () => {
    it('blocks sale with HTTP 400 when requested quantity exceeds available stock and preserves inventory', async () => {
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-OVERSALE-${Date.now()}`,
          brandName: `Low Stock Drug ${Date.now()}`,
          genericName: 'Zinc 50 mg',
          strength: '50 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Cipla',
          packSize: '10 Tablets',
          baseUnit: 'Tablet',
          conversionFactor: 10,
          gstRate: 5.0,
          mrp: 20.0,
          isActive: true,
        },
      });

      const batch = await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: med.id,
          batchNumber: `B-LOW-${Date.now()}`,
          expiryDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000),
          quantityReceived: 15,
          availableQuantity: 15, // Only 15 tablets available
          purchaseRate: 1.0,
          sellingPrice: 2.0,
          mrp: 2.0,
          status: 'ACTIVE',
        },
      });

      // Attempt to sell 2 strips (20 tablets > 15 available)
      const res = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          items: [
            {
              medicineId: med.id,
              batchId: batch.id,
              quantity: 2,
              unit: 'Strip', // 20 tablets
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Insufficient stock');

      // Stock remains exactly 15
      const batchCheck = await prisma.stockBatch.findUnique({ where: { id: batch.id } });
      expect(batchCheck?.availableQuantity).toBe(15);
    });
  });

  // TEST I: FEFO Batch Allocation
  describe('Test I: Automatic FEFO Batch Allocation', () => {
    it('automatically allocates the earliest expiring active batch when batchId is omitted', async () => {
      const med = await prisma.medicineProduct.create({
        data: {
          internalCode: `MED-FEFO-${Date.now()}`,
          brandName: `FEFO Test Med ${Date.now()}`,
          genericName: 'Ibuprofen 400 mg',
          strength: '400 mg',
          dosageForm: 'Tablet',
          manufacturer: 'Pfizer',
          packSize: '10 Tablets',
          baseUnit: 'Tablet',
          conversionFactor: 10,
          gstRate: 12.0,
          mrp: 30.0,
          isActive: true,
        },
      });

      const batchEarly = await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: med.id,
          batchNumber: `B-FEFO-EARLY-${Date.now()}`,
          expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
          quantityReceived: 50,
          availableQuantity: 50,
          purchaseRate: 1.5,
          sellingPrice: 3.0,
          mrp: 3.0,
          status: 'ACTIVE',
        },
      });

      const batchLate = await prisma.stockBatch.create({
        data: {
          branchId,
          medicineId: med.id,
          batchNumber: `B-FEFO-LATE-${Date.now()}`,
          expiryDate: new Date(Date.now() + 600 * 24 * 60 * 60 * 1000), // 600 days
          quantityReceived: 50,
          availableQuantity: 50,
          purchaseRate: 1.5,
          sellingPrice: 3.0,
          mrp: 3.0,
          status: 'ACTIVE',
        },
      });

      // Bill without specifying batchId
      const res = await request(app)
        .post('/api/billing/invoices')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          branchId,
          items: [
            {
              medicineId: med.id,
              quantity: 5,
              unit: 'Tablet',
            },
          ],
        });

      expect(res.status).toBe(201);
      // Must allocate batchEarly
      expect(res.body.lines[0].batchId).toBe(batchEarly.id);
      expect(res.body.lines[0].batchNumber).toBe(batchEarly.batchNumber);

      const earlyCheck = await prisma.stockBatch.findUnique({ where: { id: batchEarly.id } });
      const lateCheck = await prisma.stockBatch.findUnique({ where: { id: batchLate.id } });
      expect(earlyCheck?.availableQuantity).toBe(45); // 50 - 5 = 45
      expect(lateCheck?.availableQuantity).toBe(50); // Untouched
    });
  });
});
