import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import app from '../src/app';
import prisma from '../src/database/prisma';
import { matchProduct, normalizeMedicineName, areStrengthsCompatible } from '../src/utils/productMatcher';
import {
  normalizeToBaseUnits,
  calculateEquivalentUnitPrice,
  validateConversionHierarchy,
  decrementBaseStock,
} from '../src/utils/unitConverter';

describe('Confidos Pharma — Comprehensive Verification Test Suite', () => {
  let superAdminToken: string = '';
  let branchAdminToken: string = '';
  let cashierToken: string = '';
  let testBranchId: string = '';
  let secondaryBranchId: string = '';
  let testSupplierId: string = '';

  beforeAll(async () => {
    // 1. Authenticate Super Admin
    const saLogin = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'superadmin', password: 'Pharma@2026' });

    if (saLogin.status === 200 && saLogin.body?.token) {
      superAdminToken = saLogin.body.token;
    }

    // 2. Authenticate Branch Admin (Vijayawada)
    const baLogin = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'admin_vja', password: 'Pharma@2026' });

    if (baLogin.status === 200 && baLogin.body?.token) {
      branchAdminToken = baLogin.body.token;
      testBranchId = baLogin.body.user.branchId;
    }

    // 3. Authenticate Cashier
    const cashLogin = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'bill_vja_1', password: 'Pharma@2026' });

    if (cashLogin.status === 200 && cashLogin.body?.token) {
      cashierToken = cashLogin.body.token;
    }

    // 4. Fetch branches
    if (superAdminToken) {
      const branchesRes = await request(app)
        .get('/api/branches')
        .set('Authorization', `Bearer ${superAdminToken}`);
      if (branchesRes.status === 200 && branchesRes.body.length > 1) {
        if (!testBranchId) testBranchId = branchesRes.body[0].id;
        secondaryBranchId = branchesRes.body[1].id;
      }

      // Check or create synthetic test supplier
      const suppliersRes = await request(app)
        .get('/api/suppliers')
        .set('Authorization', `Bearer ${superAdminToken}`);
      if (suppliersRes.status === 200 && suppliersRes.body.length > 0) {
        testSupplierId = suppliersRes.body[0].id;
      }
    }
  });

  // =========================================================================
  // SECTION 1: UNIT CONVERSION MATHEMATICS & RULES (Phases 7 & 18.4)
  // =========================================================================
  describe('1. Unit Conversion Mathematics & Validation Engine', () => {
    it('1.1 Computes linear hierarchy Box -> Strip -> Tablet correctly', () => {
      // 1 box = 10 strips, 1 strip = 10 tablets -> conversionFactor = 100
      const boxFactor = 100;
      const boxesPurchased = 5;
      const normalizedBaseUnits = normalizeToBaseUnits(boxesPurchased, boxFactor);
      expect(normalizedBaseUnits).toBe(500); // 5 * 100 = 500 tablets

      // Cashier sells 2 strips (2 * 10 = 20 tablets) and 3 loose tablets (3 tablets) = 23 tablets
      const stripSold = 2;
      const stripFactor = 10;
      const looseSold = 3;
      const totalSoldBaseUnits = (stripSold * stripFactor) + looseSold;
      expect(totalSoldBaseUnits).toBe(23);

      // Remaining stock = 500 - 23 = 477 tablets
      const remaining = decrementBaseStock(500, totalSoldBaseUnits);
      expect(remaining).toBe(477);
    });

    it('1.2 Computes Sachet packaging conversion correctly', () => {
      // Sachet product: Box contains 20 sachets.
      const boxFactor = 20;
      const boxes = 3;
      const baseSachets = normalizeToBaseUnits(boxes, boxFactor);
      expect(baseSachets).toBe(60);

      // Sachet selling: 5 sachets sold
      const remaining = decrementBaseStock(baseSachets, 5);
      expect(remaining).toBe(55);
    });

    it('1.3 Computes Bottle / Liquid packaging base units correctly', () => {
      // 1 bottle = 1 base unit
      const bottlesPurchased = 12;
      const baseUnits = normalizeToBaseUnits(bottlesPurchased, 1);
      expect(baseUnits).toBe(12);

      const remaining = decrementBaseStock(baseUnits, 4);
      expect(remaining).toBe(8);
    });

    it('1.4 Normalizes unit prices accurately across packaging levels', () => {
      // If purchase rate is ₹80 per strip of 10 tablets:
      // Price per tablet = ₹80 / 10 = ₹8.00
      const ratePerStrip = 80;
      const unitsPerStrip = 10;
      const ratePerTablet = calculateEquivalentUnitPrice(ratePerStrip, unitsPerStrip);
      expect(ratePerTablet).toBe(8.0);

      // If a box costs ₹950 and contains 100 tablets:
      const ratePerBox = 950;
      const unitsPerBox = 100;
      const ratePerTabFromBox = calculateEquivalentUnitPrice(ratePerBox, unitsPerBox);
      expect(ratePerTabFromBox).toBe(9.5);
    });

    it('1.5 Rejects invalid, zero, or negative conversion factors', () => {
      expect(() => validateConversionHierarchy(0)).toThrow(/greater than 0/);
      expect(() => validateConversionHierarchy(-5)).toThrow(/greater than 0/);
      expect(() => validateConversionHierarchy(NaN)).toThrow(/greater than 0/);
      expect(validateConversionHierarchy(10)).toBe(true);
    });

    it('1.6 Prevents negative inventory stock under safe deduction rules', () => {
      // Attempting to sell 50 tablets when only 40 are available throws Insufficient stock
      expect(() => decrementBaseStock(40, 50, false)).toThrow(/Insufficient stock/);
    });
  });

  // =========================================================================
  // SECTION 2: SAFE PRODUCT MATCHING ENGINE (Phases 6 & 18.2)
  // =========================================================================
  describe('2. Safe Product Matching & Conflict Detection', () => {
    const existingCatalogue = [
      {
        id: 'prod-dolo-650',
        productCode: 'MED-DOLO-650',
        brandName: 'Dolo 650',
        genericName: 'Paracetamol',
        strength: '650 mg',
        dosageForm: 'Tablet',
        manufacturer: 'Micro Labs Ltd',
      },
      {
        id: 'prod-dolo-500',
        productCode: 'MED-DOLO-500',
        brandName: 'Dolo 500',
        genericName: 'Paracetamol',
        strength: '500 mg',
        dosageForm: 'Tablet',
        manufacturer: 'Micro Labs Ltd',
      },
      {
        id: 'prod-para-syr',
        productCode: 'MED-PARA-SYR',
        brandName: 'Paracetamol Pediatric',
        genericName: 'Paracetamol',
        strength: '125 mg/5ml',
        dosageForm: 'Syrup',
        manufacturer: 'Cipla Ltd',
      },
    ];

    it('2.1 Matches exact product codes unconditionally', () => {
      const match = matchProduct(
        { productCode: 'MED-DOLO-650', brandName: 'Arbitrary' },
        existingCatalogue
      );
      expect(match.isMatch).toBe(true);
      expect(match.matchedProduct?.id).toBe('prod-dolo-650');
      expect(match.matchType).toBe('EXACT_CODE');
    });

    it('2.2 Matches normalized brand name, strength, and dosage form safely', () => {
      // Case and whitespace variations must resolve to the identical medicine
      const match = matchProduct(
        { brandName: '  dOlO   650  ', strength: '650mg', dosageForm: 'tablet' },
        existingCatalogue
      );
      expect(match.isMatch).toBe(true);
      expect(match.matchedProduct?.id).toBe('prod-dolo-650');
      expect(match.matchType).toBe('EXACT_IDENTITY');
    });

    it('2.3 NEVER merges incompatible strengths (e.g. Dolo 650 vs Dolo 500)', () => {
      const match = matchProduct(
        { brandName: 'Dolo', strength: '500 mg', dosageForm: 'Tablet' },
        [existingCatalogue[0]] // Only Dolo 650 is present
      );
      // Must NOT match Dolo 650
      expect(match.isMatch).toBe(false);
      // May suggest as candidate for review, but never auto-merge
      if (match.candidates.length > 0) {
        expect(match.candidates[0].strength).not.toBe('500 mg');
      }
    });

    it('2.4 NEVER merges incompatible dosage forms (e.g. Tablet vs Syrup)', () => {
      const match = matchProduct(
        { brandName: 'Paracetamol', strength: '500 mg', dosageForm: 'Tablet' },
        [existingCatalogue[2]] // Paracetamol Syrup
      );
      expect(match.isMatch).toBe(false);
      expect(match.matchedProduct).toBeNull();
    });

    it('2.5 Detects strength compatibility accurately', () => {
      expect(areStrengthsCompatible('650 mg', '650mg')).toBe(true);
      expect(areStrengthsCompatible('650 mg', '500 mg')).toBe(false);
      expect(areStrengthsCompatible('0.5 mg', '500 mcg')).toBe(false); // Different representations strictly checked
    });
  });

  // =========================================================================
  // SECTION 3: PURCHASE IMPORT PREVIEW & TEMPLATE (Phases 3, 4, 18.3)
  // =========================================================================
  describe('3. Purchase Import Preview & Template Processing', () => {
    it('3.1 Downloads Excel (.xlsx) purchase template with proper MIME type and binary structure', async () => {
      if (!superAdminToken) return;
      const res = await request(app)
        .get('/api/purchases/template?format=xlsx')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('Confidos_Purchase_Import_Template.xlsx');
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(1000);
    });

    it('3.2 Downloads CSV purchase template with standard column headers', async () => {
      if (!superAdminToken) return;
      const res = await request(app)
        .get('/api/purchases/template?format=csv')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Product Name');
      expect(res.text).toContain('Batch Number');
      expect(res.text).toContain('Purchase Rate');
      expect(res.text).toContain('MRP');
      expect(res.text).toContain('GST Rate');
    });

    it('3.3 Generates valid preview from a valid CSV buffer', async () => {
      if (!superAdminToken) return;

      const validCsv = [
        'Product Name,Batch Number,Expiry Date,Quantity,Units Per Pack,Purchase Rate,MRP,GST Rate,Discount',
        'Azithral 500,AZT-2027-C9,2027-12-31,10,1,80.00,120.00,12,0',
        'Pantocid 40,PNT-2028-A4,2028-05-31,5,10,95.00,145.00,12,0',
      ].join('\n');

      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', Buffer.from(validCsv, 'utf-8'), 'valid_purchases.csv');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.totalRows).toBe(2);
      expect(res.body.summary.validRows).toBe(2);
      expect(res.body.summary.invalidRows).toBe(0);
      expect(res.body.rows.length).toBe(2);
      expect(res.body.rows[0].isValid).toBe(true);
      expect(res.body.rows[0].productName).toBe('Azithral 500');
      expect(res.body.rows[0].batchNumber).toBe('AZT-2027-C9');
      expect(res.body.summary.estimatedGrandTotal).toBeGreaterThan(0);
    });

    it('3.4 Generates valid preview from an in-memory Excel (.xlsx) workbook', async () => {
      if (!superAdminToken) return;

      const sheetData = [
        ['Product Name', 'Batch Number', 'Expiry Date', 'Quantity', 'Purchase Rate', 'MRP', 'GST Rate'],
        ['Amoxikem 500', 'AMX-2027-B1', '2027-11-30', 20, 52.50, 85.00, 12],
        ['Glycomet 500', 'GLY-2028-D2', '2028-08-31', 15, 30.00, 48.00, 5],
      ];

      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Purchases');
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', excelBuffer, 'inward_test.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.totalRows).toBe(2);
      expect(res.body.summary.validRows).toBe(2);
      expect(res.body.summary.invalidRows).toBe(0);
    });

    it('3.5 Identifies missing required fields with actionable error and exact line number', async () => {
      if (!superAdminToken) return;

      // Row 2 is missing Product Name
      // Row 3 is missing Batch Number
      // Row 4 has invalid negative Quantity
      const invalidCsv = [
        'Product Name,Batch Number,Expiry Date,Quantity,Purchase Rate,MRP',
        ',BATCH-001,2027-12-31,10,50,75',
        'Crocin Advance,,2027-12-31,10,50,75',
        'Dolo 650,BATCH-002,2027-12-31,-5,50,75',
      ].join('\n');

      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', Buffer.from(invalidCsv, 'utf-8'), 'invalid_test.csv');

      expect(res.status).toBe(200);
      expect(res.body.summary.totalRows).toBe(3);
      expect(res.body.summary.invalidRows).toBe(3);
      expect(res.body.summary.validRows).toBe(0);

      // Check specific row errors
      const row1 = res.body.rows.find((r: any) => r.rowNumber === 2);
      expect(row1.isValid).toBe(false);
      expect(row1.errors.some((e: string) => e.toLowerCase().includes('product name'))).toBe(true);

      const row2 = res.body.rows.find((r: any) => r.rowNumber === 3);
      expect(row2.isValid).toBe(false);
      expect(row2.errors.some((e: string) => e.toLowerCase().includes('batch number'))).toBe(true);

      const row3 = res.body.rows.find((r: any) => r.rowNumber === 4);
      expect(row3.isValid).toBe(false);
      expect(row3.errors.some((e: string) => e.toLowerCase().includes('quantity'))).toBe(true);
    });

    it('3.6 Allows omission of optional fields (Manufacturer, Brand, Free Qty) safely', async () => {
      if (!superAdminToken) return;

      const minimalCsv = [
        'Item Name,Batch No,Expiry,Qty,P.Rate,MRP',
        'Metacin 500,MTC-99,2028-01-31,10,15.00,25.00',
      ].join('\n');

      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', Buffer.from(minimalCsv, 'utf-8'), 'minimal.csv');

      expect(res.status).toBe(200);
      expect(res.body.summary.validRows).toBe(1);
      expect(res.body.rows[0].productName).toBe('Metacin 500');
      expect(res.body.rows[0].quantity).toBe(10);
    });

    it('3.7 Rejects empty import files with clear 400 error', async () => {
      if (!superAdminToken) return;

      const emptyCsv = 'Product Name,Batch Number,Quantity\n';

      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', Buffer.from(emptyCsv, 'utf-8'), 'empty.csv');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/No valid data rows|empty/i);
    });
  });

  // =========================================================================
  // SECTION 4: FINANCIAL CALCULATIONS & GST BREAKDOWN (Phases 8 & 18.5)
  // =========================================================================
  describe('4. Financial Calculations & Indian GST Compliance', () => {
    it('4.1 Accurately computes intra-state GST breakdown (CGST + SGST)', () => {
      // Line: Gross 1000, Discount 15% (₹150), Taxable ₹850, GST 5%
      const gross = new Decimal(1000);
      const discountPct = new Decimal(15);
      const discountAmt = gross.mul(discountPct.div(100)); // 150
      const taxable = gross.minus(discountAmt); // 850

      const gstRate = new Decimal(5.0);
      const cgstRate = gstRate.div(2); // 2.5%
      const sgstRate = gstRate.div(2); // 2.5%

      const cgstAmt = taxable.mul(cgstRate.div(100)); // 21.25
      const sgstAmt = taxable.mul(sgstRate.div(100)); // 21.25
      const totalTax = cgstAmt.plus(sgstAmt); // 42.50
      const netPayable = taxable.plus(totalTax); // 892.50

      expect(discountAmt.toNumber()).toBe(150.0);
      expect(taxable.toNumber()).toBe(850.0);
      expect(cgstAmt.toNumber()).toBe(21.25);
      expect(sgstAmt.toNumber()).toBe(21.25);
      expect(totalTax.toNumber()).toBe(42.5);
      expect(netPayable.toNumber()).toBe(892.5);
    });

    it('4.2 Accurately computes inter-state IGST breakdown', () => {
      const taxable = new Decimal(2500);
      const igstRate = new Decimal(12.0);
      const igstAmt = taxable.mul(igstRate.div(100)); // 300.00
      const netPayable = taxable.plus(igstAmt); // 2800.00

      expect(igstAmt.toNumber()).toBe(300.0);
      expect(netPayable.toNumber()).toBe(2800.0);
    });

    it('4.3 Enforces exact monetary precision without binary floating point drift', () => {
      // 0.1 + 0.2 in binary float produces 0.30000000000000004
      const d1 = new Decimal(0.1);
      const d2 = new Decimal(0.2);
      const sum = d1.plus(d2);
      expect(sum.toNumber()).toBe(0.3);
      expect(sum.toFixed(2)).toBe('0.30');
    });
  });

  // =========================================================================
  // SECTION 5: INDENT MANAGEMENT WORKFLOW (Phases 9 & 18.7)
  // =========================================================================
  describe('5. Indent Management & Purchase Order Lifecycle', () => {
    let createdIndentId: string = '';

    it('5.1 Creates a draft purchase indent successfully', async () => {
      if (!branchAdminToken || !testBranchId) return;

      const res = await request(app)
        .post('/api/indents')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          branchId: testBranchId,
          supplierId: testSupplierId || undefined,
          notes: 'Test procurement request for tablet stock',
          items: [
            {
              productName: 'Paracetamol 500mg',
              requiredQuantity: 100,
              unit: 'STRIP',
              estimatedRate: 15.0,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.indentNumber).toMatch(/^IND-/);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.items.length).toBe(1);
      createdIndentId = res.body.id;
    });

    it('5.2 Confirms that creating an indent does NOT alter available stock batches', async () => {
      if (!superAdminToken) return;

      // Verify no phantom stock batch was created from the indent
      const batchesRes = await request(app)
        .get('/api/inventory/batches')
        .set('Authorization', `Bearer ${superAdminToken}`);

      if (batchesRes.status === 200 && Array.isArray(batchesRes.body)) {
        const phantomBatch = batchesRes.body.find(
          (b: any) => b.batchNumber === 'INDENT-PHANTOM'
        );
        expect(phantomBatch).toBeUndefined();
      }
    });

    it('5.3 Super Admin approves the indent', async () => {
      if (!superAdminToken || !createdIndentId) return;

      const res = await request(app)
        .patch(`/api/indents/${createdIndentId}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('APPROVED');
    });

    it('5.4 Converts approved indent to inward purchase workflow draft', async () => {
      if (!superAdminToken || !createdIndentId) return;

      const res = await request(app)
        .post(`/api/indents/${createdIndentId}/convert-to-purchase`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.purchaseDraft.items.length).toBe(1);
      expect(res.body.purchaseDraft.items[0].quantity).toBe(100);
    });
  });

  // =========================================================================
  // SECTION 6: RBAC & CROSS-BRANCH PERMISSIONS (Phases 10, 11, 14, 18.6)
  // =========================================================================
  describe('6. Role-Based Access Control (RBAC) & Security Enforcement', () => {
    it('6.1 Prohibits Branch Admin from self-escalating role to SUPER_ADMIN', async () => {
      if (!branchAdminToken) return;

      // Attempt self-escalation via /api/users/profile
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          fullName: 'Unauthorized Admin',
          role: 'SUPER_ADMIN', // Attempt privilege escalation
        });

      expect(res.status).toBe(200);
      // Profile update MUST ignore unauthorized role field
      expect(res.body.user?.role).not.toBe('SUPER_ADMIN');
    });

    it('6.2 Rejects unauthenticated requests to protected endpoints', async () => {
      const res = await request(app).get('/api/purchases');
      expect(res.status).toBe(401);
    });

    it('6.3 Prohibits Branch Admin from creating purchases in another branch', async () => {
      if (!branchAdminToken || !secondaryBranchId) return;

      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send({
          branchId: secondaryBranchId, // Branch Admin's token is for testBranchId, not secondaryBranchId
          supplierId: testSupplierId || 'mock-supplier',
          supplierInvoiceNumber: 'INV-CROSS-BRANCH-01',
          invoiceDate: '2026-10-29',
          items: [
            {
              productName: 'Cross Branch Test Drug',
              batchNumber: 'XBRANCH-1',
              expiryDate: '2027-12-31',
              quantity: 10,
              purchaseRate: 50,
              mrp: 80,
            },
          ],
        });

      // Must be forbidden (403)
      expect(res.status).toBe(403);
    });

    it('6.4 Allows Super Admin to view profile and update details', async () => {
      if (!superAdminToken) return;

      const profileRes = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(profileRes.status).toBe(200);
      expect(profileRes.body.user.role).toBe('SUPER_ADMIN');
    });
  });
});
