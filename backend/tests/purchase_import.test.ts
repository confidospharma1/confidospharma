import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import * as xlsx from 'xlsx';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/database/prisma';
import { JWT_SECRET } from '../src/config/jwt';
import {
  buildHeaderMapping,
  areProductAndBrandCompatible,
  resolveProductAndBrandNames,
} from '../src/modules/imports/imports.mapper';

describe('Purchase Inward Import & Canonical Mapping Test Suite', { timeout: 35000 }, () => {
  let superAdminToken = '';
  let branchAdminToken = '';
  let otherBranchAdminToken = '';
  let billingUserToken = '';
  let branchId = '';
  let branchId2 = '';
  let inactiveBranchId = '';
  let supplierId = '';

  const binaryParser = (res: any, callback: any) => {
    res.setEncoding('binary');
    let data = '';
    res.on('data', (chunk: any) => {
      data += chunk;
    });
    res.on('end', () => {
      callback(null, Buffer.from(data, 'binary'));
    });
  };

  beforeAll(async () => {
    // 1. Fetch or create a Super Admin user
    let superAdminUser = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN', isActive: true },
    });

    if (!superAdminUser) {
      superAdminUser = await prisma.user.create({
        data: {
          username: 'import_test_superadmin',
          email: 'import_superadmin@confidos.test',
          fullName: 'Import Super Admin',
          passwordHash: 'dummy',
          role: 'SUPER_ADMIN',
          isActive: true,
        },
      });
    }

    // Ensure super admin has null branchId for testing strict target branch passing
    if (superAdminUser.branchId !== null) {
      superAdminUser = await prisma.user.update({
        where: { id: superAdminUser.id },
        data: { branchId: null },
      });
    }

    superAdminToken = jwt.sign(
      {
        id: superAdminUser.id,
        username: superAdminUser.username,
        role: superAdminUser.role,
        branchId: null,
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    let branch = await prisma.branch.findFirst({ where: { isActive: true } });
    if (!branch) {
      const company = await prisma.company.findFirst();
      branch = await prisma.branch.create({
        data: {
          companyId: company?.id || 'company-1',
          code: 'B-TEST',
          name: 'Test Branch',
          address: 'Test Address',
          phone: '+91 98765 43210',
          isActive: true,
        },
      });
    }
    branchId = branch.id;

    // Second active branch for isolation testing
    let branch2 = await prisma.branch.findFirst({
      where: { id: { not: branchId }, isActive: true },
    });
    if (!branch2) {
      const company = await prisma.company.findFirst();
      branch2 = await prisma.branch.create({
        data: {
          companyId: company?.id || 'company-1',
          code: 'B-TEST-2',
          name: 'Second Test Branch',
          address: 'Second Address',
          phone: '+91 98765 43211',
          isActive: true,
        },
      });
    }
    branchId2 = branch2.id;

    // Inactive branch for activity status validation
    let inactBranch = await prisma.branch.findFirst({ where: { isActive: false } });
    if (!inactBranch) {
      const company = await prisma.company.findFirst();
      inactBranch = await prisma.branch.create({
        data: {
          companyId: company?.id || 'company-1',
          code: 'B-INACT',
          name: 'Inactive Branch',
          address: 'Inactive Address',
          phone: '+91 98765 43212',
          isActive: false,
        },
      });
    }
    inactiveBranchId = inactBranch.id;

    // Branch Admin for branch 1
    let branchAdminUser = await prisma.user.findFirst({
      where: { role: 'BRANCH_ADMIN', branchId, isActive: true },
    });
    if (!branchAdminUser) {
      branchAdminUser = await prisma.user.create({
        data: {
          username: 'import_test_b_admin_1',
          email: 'badmin1_import@confidos.test',
          fullName: 'Branch Admin Branch 1',
          passwordHash: 'dummy',
          role: 'BRANCH_ADMIN',
          branchId,
          isActive: true,
        },
      });
    }
    branchAdminToken = jwt.sign(
      {
        id: branchAdminUser.id,
        username: branchAdminUser.username,
        role: branchAdminUser.role,
        branchId: branchAdminUser.branchId,
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Branch Admin for branch 2
    let otherBranchAdminUser = await prisma.user.findFirst({
      where: { role: 'BRANCH_ADMIN', branchId: branchId2, isActive: true },
    });
    if (!otherBranchAdminUser) {
      otherBranchAdminUser = await prisma.user.create({
        data: {
          username: 'import_test_b_admin_2',
          email: 'badmin2_import@confidos.test',
          fullName: 'Branch Admin Branch 2',
          passwordHash: 'dummy',
          role: 'BRANCH_ADMIN',
          branchId: branchId2,
          isActive: true,
        },
      });
    }
    otherBranchAdminToken = jwt.sign(
      {
        id: otherBranchAdminUser.id,
        username: otherBranchAdminUser.username,
        role: otherBranchAdminUser.role,
        branchId: otherBranchAdminUser.branchId,
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Billing User
    let billingUser = await prisma.user.findFirst({
      where: { role: 'BILLING_USER', isActive: true },
    });
    if (!billingUser) {
      billingUser = await prisma.user.create({
        data: {
          username: 'import_test_cashier',
          email: 'cashier_import@confidos.test',
          fullName: 'Import Cashier',
          passwordHash: 'dummy',
          role: 'BILLING_USER',
          branchId,
          isActive: true,
        },
      });
    }
    billingUserToken = jwt.sign(
      {
        id: billingUser.id,
        username: billingUser.username,
        role: billingUser.role,
        branchId: billingUser.branchId,
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Ensure an isolated test supplier exists
    let supplier = await prisma.supplier.findFirst({
      where: { name: 'Confidos Test Medical Supplies' },
    });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          name: 'Confidos Test Medical Supplies',
          contactPerson: 'Quality Assurance',
          phone: '+91 99999 88888',
          email: 'qa.supplier@confidospharma.com',
          gstin: '37AAAAA0000A1Z5',
          isActive: true,
        },
      });
    }
    supplierId = supplier.id;
  });

  // Helper to create an Excel buffer from JSON rows
  function createExcelBuffer(rows: any[], sheetName = 'Sheet1'): Buffer {
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, sheetName);
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  // Helper to create a CSV buffer from JSON rows
  function createCsvBuffer(rows: any[]): Buffer {
    const ws = xlsx.utils.json_to_sheet(rows);
    const csv = xlsx.utils.sheet_to_csv(ws);
    return Buffer.from(csv, 'utf8');
  }

  describe('1. Importing a file containing Product Name only', () => {
    it('accepts and stages rows with Product Name only without errors', async () => {
      const rows = [
        {
          'Product Name': 'Paracetamol 650mg Caplet',
          'Generic Name': 'Paracetamol',
          'Strength': '650mg',
          'Dosage Form': 'Tablet',
          'Manufacturer': 'Apex Pharma',
          'Batch Number': 'PARA-ONLY-01',
          'Expiry Date': '2028-12-31',
          'Purchase Unit': 'Strip',
          'Quantity': 100,
          'Units Per Pack': 10,
          'Purchase Rate': 15.0,
          'MRP': 25.0,
          'GST Rate': 12,
        },
      ];

      const buffer = createExcelBuffer(rows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .field('supplierId', supplierId)
        .attach('file', buffer, 'product_name_only.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.validRows).toBe(1);
      expect(res.body.errorRows).toBe(0);
      expect(res.body.rows[0].status).toBe('READY');
      expect(res.body.rows[0].productName).toBe('Paracetamol 650mg Caplet');
      expect(res.body.rows[0].brandName).toBe('Paracetamol 650mg Caplet');
    });
  });

  describe('2. Importing a file containing Brand Name only', () => {
    it('accepts and stages rows with Brand Name only without errors', async () => {
      const rows = [
        {
          'Brand Name': 'Augmentin 625 Duo',
          'Generic Name': 'Amoxicillin and Clavulanate Potassium',
          'Strength': '625mg',
          'Dosage Form': 'Tablet',
          'Manufacturer': 'GSK Pharma',
          'Batch Number': 'AUG-ONLY-02',
          'Expiry Date': '2028-11-30',
          'Purchase Unit': 'Strip',
          'Quantity': 40,
          'Units Per Pack': 10,
          'Purchase Rate': 140.0,
          'MRP': 210.0,
          'GST Rate': 12,
        },
      ];

      const buffer = createExcelBuffer(rows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .field('supplierId', supplierId)
        .attach('file', buffer, 'brand_name_only.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.validRows).toBe(1);
      expect(res.body.errorRows).toBe(0);
      expect(res.body.rows[0].status).toBe('READY');
      expect(res.body.rows[0].brandName).toBe('Augmentin 625 Duo');
      expect(res.body.rows[0].productName).toBe('Augmentin 625 Duo');
    });
  });

  describe('3. Importing a file containing both columns', () => {
    it('maps both Product Name and Brand Name without column conflict error', async () => {
      const rows = [
        {
          'Product Name': 'Dolo 650 Tablet',
          'Brand Name': 'Dolo 650',
          'Generic Name': 'Paracetamol',
          'Strength': '650mg',
          'Dosage Form': 'Tablet',
          'Manufacturer': 'Micro Labs Ltd',
          'Batch Number': 'DOLO-BOTH-03',
          'Expiry Date': '2029-01-31',
          'Purchase Unit': 'Strip',
          'Quantity': 50,
          'Units Per Pack': 15,
          'Purchase Rate': 25.0,
          'MRP': 35.0,
          'GST Rate': 12,
        },
      ];

      const buffer = createExcelBuffer(rows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .field('supplierId', supplierId)
        .attach('file', buffer, 'both_columns.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.validRows).toBe(1);
      expect(res.body.errorRows).toBe(0);
      expect(res.body.rows[0].productName).toBe('Dolo 650 Tablet');
      expect(res.body.rows[0].brandName).toBe('Dolo 650');
    });
  });

  describe('4. Importing the actual 18-column template', () => {
    it('successfully parses all 18 headers without column mapping collision', async () => {
      const rows = [
        {
          'Product Name': 'Dolo 650',
          'Brand Name': 'Dolo 650',
          'Generic Name': 'Paracetamol',
          'Strength': '650mg',
          'Dosage Form': 'Tablet',
          'Manufacturer': 'Micro Labs Ltd',
          'HSN Code': '30049099',
          'Batch Number': 'DL-2026-X1',
          'Expiry Date': '2028-12-31',
          'Purchase Unit': 'Strip',
          'Quantity': 50,
          'Free Quantity': 5,
          'Units Per Pack': 15,
          'Purchase Rate': 24.5,
          'MRP': 35.0,
          'GST Rate': 12,
          'Discount': 10,
          'Selling Unit': 'Tablet',
        },
        {
          'Product Name': 'Azithral 500',
          'Brand Name': 'Azithral 500',
          'Generic Name': 'Azithromycin',
          'Strength': '500mg',
          'Dosage Form': 'Tablet',
          'Manufacturer': 'Alembic Pharmaceuticals',
          'HSN Code': '30049099',
          'Batch Number': 'AZ-2026-B9',
          'Expiry Date': '2028-06-30',
          'Purchase Unit': 'Strip',
          'Quantity': 30,
          'Free Quantity': 0,
          'Units Per Pack': 5,
          'Purchase Rate': 85.0,
          'MRP': 125.0,
          'GST Rate': 12,
          'Discount': 5,
          'Selling Unit': 'Tablet',
        },
        {
          'Product Name': 'Benadryl Cough Syrup',
          'Brand Name': 'Benadryl Cough Formula',
          'Generic Name': 'Diphenhydramine + Ammonium Chloride',
          'Strength': '100ml',
          'Dosage Form': 'Syrup',
          'Manufacturer': 'Johnson & Johnson',
          'HSN Code': '30049099',
          'Batch Number': 'BN-2026-S3',
          'Expiry Date': '2027-11-30',
          'Purchase Unit': 'Bottle',
          'Quantity': 20,
          'Free Quantity': 2,
          'Units Per Pack': 1,
          'Purchase Rate': 95.0,
          'MRP': 140.0,
          'GST Rate': 12,
          'Discount': 0,
          'Selling Unit': 'Bottle',
        },
      ];

      const buffer = createExcelBuffer(rows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .field('supplierId', supplierId)
        .attach('file', buffer, 'confidos_purchase_template.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.totalRows).toBe(3);
      expect(res.body.validRows).toBe(3);
      expect(res.body.errorRows).toBe(0);
      expect(res.body.rows).toHaveLength(3);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.metrics.estimatedGrandTotal).toBeGreaterThan(0);
    });
  });

  describe('5. Conflicting product and brand values', () => {
    it('detects conflicting product values in a row and flags an explicit error', async () => {
      const rows = [
        {
          'Product Name': 'Dolo 650',
          'Brand Name': 'Azithral 500', // Materially conflicting product identity!
          'Generic Name': 'Paracetamol',
          'Strength': '650mg',
          'Dosage Form': 'Tablet',
          'Manufacturer': 'Micro Labs',
          'Batch Number': 'CONFLICT-01',
          'Expiry Date': '2028-12-31',
          'Purchase Unit': 'Strip',
          'Quantity': 10,
          'Purchase Rate': 20.0,
          'MRP': 30.0,
          'GST Rate': 12,
        },
      ];

      const buffer = createExcelBuffer(rows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .field('supplierId', supplierId)
        .attach('file', buffer, 'conflicting_values.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.errorRows).toBe(1);
      expect(res.body.validRows).toBe(0);
      expect(res.body.rows[0].status).toBe('ERROR');
      expect(
        res.body.rows[0].errors.some((e: string) => e.includes('Conflicting product identity'))
      ).toBe(true);
    });

    it('unit tests areProductAndBrandCompatible function directly', () => {
      expect(areProductAndBrandCompatible('Dolo 650', 'Dolo 650')).toBe(true);
      expect(areProductAndBrandCompatible('Dolo 650 Tablet', 'Dolo 650')).toBe(true);
      expect(areProductAndBrandCompatible('Benadryl Cough Syrup', 'Benadryl Cough Formula')).toBe(true);
      expect(areProductAndBrandCompatible('Dolo 650', '')).toBe(true);
      expect(areProductAndBrandCompatible('', 'Dolo 650')).toBe(true);
      expect(areProductAndBrandCompatible('Dolo 650', 'Azithral 500')).toBe(false);
      expect(areProductAndBrandCompatible('Paracetamol 500', 'Amoxicillin 250')).toBe(false);
    });
  });

  describe('6. Duplicate headers', () => {
    it('rejects files with duplicate headers after normalization with HTTP 400', async () => {
      const rawCsv = 'Product Name,product_name,Batch Number,Expiry Date,Quantity,Purchase Rate,MRP\nDolo 650,Dolo 650,BATCH-01,2028-12-31,10,20,30\n';

      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .attach('file', Buffer.from(rawCsv), 'duplicate_headers.csv');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Duplicate column headers detected/i);
    });
  });

  describe('7. Missing mandatory columns', () => {
    it('flags rows missing mandatory product name, batch number, or quantity', async () => {
      const rows = [
        {
          // Missing Product Name and Brand Name
          'Generic Name': 'Paracetamol',
          'Batch Number': 'BATCH-MAND-01',
          'Expiry Date': '2028-12-31',
          'Quantity': 10,
          'Purchase Rate': 20.0,
          'MRP': 30.0,
          'GST Rate': 12,
        },
        {
          'Product Name': 'Dolo 650',
          // Missing Batch Number
          'Expiry Date': '2028-12-31',
          'Quantity': 10,
          'Purchase Rate': 20.0,
          'MRP': 30.0,
          'GST Rate': 12,
        },
        {
          'Product Name': 'Dolo 650',
          'Batch Number': 'BATCH-MAND-03',
          'Expiry Date': '2028-12-31',
          // Missing / invalid Quantity
          'Quantity': 0,
          'Purchase Rate': 20.0,
          'MRP': 30.0,
          'GST Rate': 12,
        },
      ];

      const buffer = createExcelBuffer(rows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .field('supplierId', supplierId)
        .attach('file', buffer, 'missing_mandatory.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.errorRows).toBe(3);
      expect(res.body.validRows).toBe(0);
      expect(res.body.rows[0].errors.some((e: string) => e.includes('Product / Brand Name is required'))).toBe(true);
      expect(res.body.rows[1].errors.some((e: string) => e.includes('Batch Number is required'))).toBe(true);
      expect(res.body.rows[2].errors.some((e: string) => e.includes('Quantity is required'))).toBe(true);
    });
  });

  describe('8. Excel and CSV consistency', () => {
    it('produces identical validation metrics between XLSX and CSV uploads', async () => {
      const sample = [
        {
          'Product Name': 'Telma 40',
          'Brand Name': 'Telma 40',
          'Generic Name': 'Telmisartan',
          'Strength': '40mg',
          'Dosage Form': 'Tablet',
          'Manufacturer': 'Glenmark',
          'Batch Number': 'TEL-2028-01',
          'Expiry Date': '2028-09-30',
          'Purchase Unit': 'Strip',
          'Quantity': 25,
          'Free Quantity': 2,
          'Units Per Pack': 15,
          'Purchase Rate': 120.0,
          'MRP': 180.0,
          'GST Rate': 12,
          'Discount': 5,
        },
      ];

      const xlsxBuffer = createExcelBuffer(sample);
      const csvBuffer = createCsvBuffer(sample);

      const [resXlsx, resCsv] = await Promise.all([
        request(app)
          .post('/api/purchases/import-preview')
          .set('Authorization', `Bearer ${superAdminToken}`)
          .field('branchId', branchId)
          .field('supplierId', supplierId)
          .attach('file', xlsxBuffer, 'sample.xlsx'),
        request(app)
          .post('/api/purchases/import-preview')
          .set('Authorization', `Bearer ${superAdminToken}`)
          .field('branchId', branchId)
          .field('supplierId', supplierId)
          .attach('file', csvBuffer, 'sample.csv'),
      ]);

      expect(resXlsx.status).toBe(200);
      expect(resCsv.status).toBe(200);

      expect(resXlsx.body.validRows).toBe(resCsv.body.validRows);
      expect(resXlsx.body.errorRows).toBe(resCsv.body.errorRows);
      expect(resXlsx.body.metrics.estimatedGrandTotal).toBe(resCsv.body.metrics.estimatedGrandTotal);
      expect(resXlsx.body.metrics.estimatedTax).toBe(resCsv.body.metrics.estimatedTax);
      expect(resXlsx.body.metrics.estimatedDiscount).toBe(resCsv.body.metrics.estimatedDiscount);
    });
  });

  describe('9. Invalid expiry dates and batch numbers', () => {
    it('flags expired batches and malformed dates with row-level errors', async () => {
      const rows = [
        {
          'Product Name': 'Expired Medicine',
          'Batch Number': 'EXP-2020',
          'Expiry Date': '2020-01-01', // Expired
          'Quantity': 10,
          'Purchase Rate': 50,
          'MRP': 80,
          'GST Rate': 12,
        },
        {
          'Product Name': 'Malformed Date Medicine',
          'Batch Number': 'MALFORMED-DATE',
          'Expiry Date': 'invalid-not-a-date',
          'Quantity': 10,
          'Purchase Rate': 50,
          'MRP': 80,
          'GST Rate': 12,
        },
      ];

      const buffer = createExcelBuffer(rows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .field('supplierId', supplierId)
        .attach('file', buffer, 'invalid_dates.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.errorRows).toBe(2);
      expect(res.body.rows[0].errors.some((e: string) => e.includes('already expired'))).toBe(true);
      expect(res.body.rows[1].errors.some((e: string) => e.includes('Invalid Expiry Date'))).toBe(true);
    });
  });

  describe('10. Quantity conversion and free quantities', () => {
    it('correctly calculates total base units using conversion factor and free quantities', async () => {
      const rows = [
        {
          'Product Name': 'Conversion Test Tablet',
          'Brand Name': 'Conversion Test Tablet',
          'Batch Number': 'CONV-TEST-01',
          'Expiry Date': '2028-10-31',
          'Purchase Unit': 'Box',
          'Quantity': 10,
          'Free Quantity': 2,
          'Units Per Pack': 20, // 20 tablets per box
          'Purchase Rate': 100.0,
          'MRP': 150.0,
          'GST Rate': 12,
        },
      ];

      const buffer = createExcelBuffer(rows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .field('supplierId', supplierId)
        .attach('file', buffer, 'conversion.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.validRows).toBe(1);
      const row = res.body.rows[0];
      // Total Units = (10 + 2) * 20 = 240 units
      expect(row.totalUnits).toBe(240);
      expect(row.quantity).toBe(10);
      expect(row.freeQuantity).toBe(2);
      expect(row.conversionFactor).toBe(20);
    });
  });

  describe('11. Tax and discount calculations', () => {
    it('computes gross, discount, taxable, GST, and grand total with Decimal precision', async () => {
      // 10 units @ 100 purchase rate = 1000 gross
      // 10% discount = 100 discount
      // Taxable = 900
      // 12% GST on 900 = 108 tax
      // Grand Total = 900 + 108 = 1008
      const rows = [
        {
          'Product Name': 'Tax Test Pharma',
          'Batch Number': 'TAX-TEST-01',
          'Expiry Date': '2028-10-31',
          'Quantity': 10,
          'Purchase Rate': 100.0,
          'MRP': 150.0,
          'GST Rate': 12,
          'Discount': 10,
        },
      ];

      const buffer = createExcelBuffer(rows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .field('supplierId', supplierId)
        .attach('file', buffer, 'tax_calc.xlsx');

      expect(res.status).toBe(200);
      const row = res.body.rows[0];
      expect(row.discountAmount).toBe(100.0);
      expect(row.taxableAmount).toBe(900.0);
      expect(row.taxAmount).toBe(108.0);
      expect(row.lineTotal).toBe(1008.0);
      expect(res.body.metrics.estimatedGrandTotal).toBe(1008.0);
    });
  });

  describe('12. Downloading and re-uploading the generated template', () => {
    it('downloads the official XLSX template and uploads it back successfully with 0 conflicts', async () => {
      // Step A: Download Excel template
      const downloadRes = await request(app)
        .get('/api/purchases/template?format=xlsx')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .buffer(true)
        .parse(binaryParser);

      expect(downloadRes.status).toBe(200);
      expect(downloadRes.header['content-type']).toContain('spreadsheetml');
      const downloadedBuffer = downloadRes.body;
      expect(Buffer.isBuffer(downloadedBuffer)).toBe(true);

      // Step B: Re-upload the exact downloaded XLSX buffer to import-preview
      const uploadRes = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .field('supplierId', supplierId)
        .attach('file', downloadedBuffer, 'confidos_purchase_template.xlsx');

      // Crucial: Must be 200 with 0 duplicate headers and 0 conflicting columns!
      expect(uploadRes.status).toBe(200);
      expect(uploadRes.body.totalRows).toBe(3);
      expect(uploadRes.body.validRows).toBe(3);
      expect(uploadRes.body.errorRows).toBe(0);
    });

    it('downloads the official CSV template and uploads it back successfully with 0 conflicts', async () => {
      // Step A: Download CSV template
      const downloadCsvRes = await request(app)
        .get('/api/purchases/template?format=csv')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(downloadCsvRes.status).toBe(200);
      expect(downloadCsvRes.header['content-type']).toContain('text/csv');
      const csvBuffer = Buffer.from(downloadCsvRes.text, 'utf8');

      // Step B: Re-upload CSV to import-preview
      const uploadRes = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .field('supplierId', supplierId)
        .attach('file', csvBuffer, 'confidos_purchase_template.csv');

      expect(uploadRes.status).toBe(200);
      expect(uploadRes.body.totalRows).toBe(3);
      expect(uploadRes.body.validRows).toBe(3);
      expect(uploadRes.body.errorRows).toBe(0);
    });
  });

  describe('13. Staged preview and final invoice posting', () => {
    it('verifies that staged preview does not mutate inventory, and final invoice posting creates records correctly', async () => {
      const uniqueBatch = `POST-TEST-${Date.now()}`;
      const uniqueInvoiceNo = `INV-TEST-${Date.now()}`;

      const rows = [
        {
          'Product Name': 'Posting Workflow Medicine',
          'Brand Name': 'Posting Workflow Medicine',
          'Generic Name': 'Workflow Test Formulation',
          'Strength': '500mg',
          'Dosage Form': 'Tablet',
          'Manufacturer': 'Workflow Labs',
          'Batch Number': uniqueBatch,
          'Expiry Date': '2028-12-31',
          'Purchase Unit': 'Box',
          'Quantity': 10,
          'Free Quantity': 1,
          'Units Per Pack': 10,
          'Purchase Rate': 50.0,
          'MRP': 80.0,
          'GST Rate': 12,
          'Discount': 0,
        },
      ];

      const buffer = createExcelBuffer(rows);

      // 1. Stage Preview
      const previewRes = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .field('supplierId', supplierId)
        .attach('file', buffer, 'post_test.xlsx');

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.validRows).toBe(1);

      // Verify that no batch exists in database prior to invoice posting
      const batchBeforePost = await prisma.stockBatch.findFirst({
        where: { batchNumber: uniqueBatch, branchId },
      });
      expect(batchBeforePost).toBeNull();

      // 2. Commit Invoice via POST /api/purchases
      const validItem = previewRes.body.rows[0];
      const postPayload = {
        branchId,
        supplierId,
        supplierInvoiceNumber: uniqueInvoiceNo,
        invoiceDate: new Date().toISOString(),
        paymentMode: 'CASH',
        paidAmount: previewRes.body.metrics.estimatedGrandTotal,
        notes: 'Testing end-to-end import preview to invoice posting',
        lines: [
          {
            medicineId: validItem.medicineId,
            newMedicine: validItem.newMedicine,
            batchNumber: validItem.batchNumber,
            expiryDate: validItem.expiryDate,
            quantity: validItem.quantity,
            freeQuantity: validItem.freeQuantity,
            unit: validItem.unit,
            conversionFactor: validItem.conversionFactor,
            purchaseRate: validItem.purchaseRate,
            sellingRate: validItem.sellingRate,
            mrp: validItem.mrp,
            discountPercent: validItem.discountPercent,
            discountAmount: validItem.discountAmount,
            gstRate: validItem.gstRate,
          },
        ],
      };

      const postRes = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(postPayload);

      expect(postRes.status).toBe(201);
      expect(postRes.body.id || postRes.body.invoice?.id).toBeDefined();
      expect(postRes.body.invoiceNumber || postRes.body.invoice?.invoiceNumber).toBeDefined();

      // Verify batch and inventory now exist in database
      const batchAfterPost = await prisma.stockBatch.findFirst({
        where: { batchNumber: uniqueBatch, branchId },
      });
      expect(batchAfterPost).not.toBeNull();
      // Total available quantity = (10 + 1) * 10 = 110 units
      expect(batchAfterPost?.availableQuantity).toBe(110);

      // Verify stock movement was recorded
      const movement = await prisma.stockMovement.findFirst({
        where: { batchId: batchAfterPost?.id, movementType: 'PURCHASE_RECEIPT' },
      });
      expect(movement).not.toBeNull();
      expect(movement?.quantityDelta).toBe(110);
    });
  });

  describe('14. Target Branch Validation, Isolation & Propagation Regression Tests', () => {
    const validSampleRows = [
      {
        'Product Name': 'Paracetamol 650mg Caplet',
        'Generic Name': 'Paracetamol',
        'Strength': '650mg',
        'Dosage Form': 'Tablet',
        'Manufacturer': 'Apex Pharma',
        'Batch Number': 'REG-BR-01',
        'Expiry Date': '2028-12-31',
        'Purchase Unit': 'Box',
        'Quantity': 20,
        'Free Quantity': 2,
        'Units Per Pack': 10,
        'Purchase Rate': 30.0,
        'MRP': 45.0,
        'GST Rate': 12,
        'Discount': 5,
      },
    ];

    it('14.1 A valid selected branch is passed to the import API and returns targetBranchId & branchName', async () => {
      const buffer = createExcelBuffer(validSampleRows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .field('supplierId', supplierId)
        .attach('file', buffer, 'branch_valid.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.targetBranchId).toBe(branchId);
      expect(res.body.branchName).toBeDefined();
      expect(res.body.validRows).toBe(1);
      expect(res.body.errorRows).toBe(0);
    });

    it('14.2 A missing branch produces a clear HTTP 400 validation message', async () => {
      const buffer = createExcelBuffer(validSampleRows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        // Intentionally omit branchId
        .field('supplierId', supplierId)
        .attach('file', buffer, 'no_branch.xlsx');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Target branch is required for purchase import');
    });

    it('14.3 An unauthorized branch is rejected by the backend with HTTP 403 for Branch Admin', async () => {
      const buffer = createExcelBuffer(validSampleRows);
      // branchAdminToken belongs to branchId (Branch 1). Attempting to import into branchId2 (Branch 2):
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .field('branchId', branchId2)
        .attach('file', buffer, 'unauthorized_branch.xlsx');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('not authorized to import purchases into another branch');
    });

    it('14.4 Branch Admin can import into their own authorized branch without specifying branchId', async () => {
      const buffer = createExcelBuffer(validSampleRows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .attach('file', buffer, 'own_branch.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.targetBranchId).toBe(branchId);
      expect(res.body.validRows).toBe(1);
    });

    it('14.5 Branch Admin is rejected when attempting to record a purchase invoice for another branch', async () => {
      const postPayload = {
        branchId: branchId2, // Unauthorized branch
        supplierId,
        supplierInvoiceNumber: `INV-UNAUTH-${Date.now()}`,
        invoiceDate: new Date().toISOString(),
        paymentMode: 'CASH',
        lines: [
          {
            batchNumber: 'UNAUTH-01',
            expiryDate: '2028-12-31',
            quantity: 10,
            purchaseRate: 20,
            mrp: 30,
            gstRate: 5,
          },
        ],
      };

      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${branchAdminToken}`)
        .send(postPayload);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('not authorized to record purchases for another branch');
    });

    it('14.6 Inactive branch is rejected with HTTP 400', async () => {
      const buffer = createExcelBuffer(validSampleRows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', inactiveBranchId)
        .attach('file', buffer, 'inactive_branch.xlsx');

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Target branch is inactive');
    });

    it('14.7 Non-existent branch is rejected with HTTP 404', async () => {
      const buffer = createExcelBuffer(validSampleRows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', '00000000-0000-0000-0000-000000000000')
        .attach('file', buffer, 'non_existent.xlsx');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Target branch not found');
    });

    it('14.8 Billing users are rejected with HTTP 403', async () => {
      const buffer = createExcelBuffer(validSampleRows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${billingUserToken}`)
        .field('branchId', branchId)
        .attach('file', buffer, 'billing_user.xlsx');

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Billing users cannot import purchases');
    });

    it('14.9 Switching branches updates the target branch correctly', async () => {
      const buffer = createExcelBuffer(validSampleRows);

      // Super Admin imports into Branch 1
      const res1 = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .attach('file', buffer, 'switch_branch_1.xlsx');

      expect(res1.status).toBe(200);
      expect(res1.body.targetBranchId).toBe(branchId);

      // Super Admin switches to Branch 2
      const res2 = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId2)
        .attach('file', buffer, 'switch_branch_2.xlsx');

      expect(res2.status).toBe(200);
      expect(res2.body.targetBranchId).toBe(branchId2);
      expect(res2.body.targetBranchId).not.toBe(res1.body.targetBranchId);
    });

    it('14.10 A valid Excel import (confidos_purchase_dummy_data.xlsx) generates staged preview', async () => {
      const filePath = 'f:/pharma/samples/confidos_purchase_dummy_data.xlsx';
      const fileBuffer = require('fs').readFileSync(filePath);

      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .attach('file', fileBuffer, 'confidos_purchase_dummy_data.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.targetBranchId).toBe(branchId);
      expect(res.body.totalRows).toBe(8);
      expect(res.body.validRows).toBe(8);
      expect(res.body.errorRows).toBe(0);
      expect(res.body.metrics.estimatedGrandTotal).toBeGreaterThan(0);
    });

    it('14.11 A valid CSV import (confidos_purchase_dummy_data.csv) generates staged preview', async () => {
      const filePath = 'f:/pharma/samples/confidos_purchase_dummy_data.csv';
      const fileBuffer = require('fs').readFileSync(filePath);

      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .attach('file', fileBuffer, 'confidos_purchase_dummy_data.csv');

      expect(res.status).toBe(200);
      expect(res.body.targetBranchId).toBe(branchId);
      expect(res.body.totalRows).toBe(8);
      expect(res.body.validRows).toBe(8);
      expect(res.body.errorRows).toBe(0);
      expect(res.body.metrics.estimatedGrandTotal).toBeGreaterThan(0);
    });

    it('14.12 Failed validation does not create partial inventory or ledger records', async () => {
      const batchesCountBefore = await prisma.stockBatch.count();
      const invoicesCountBefore = await prisma.purchaseInvoice.count();

      // Trigger a failed import attempt
      const buffer = createExcelBuffer(validSampleRows);
      const res = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', '00000000-0000-0000-0000-000000000000')
        .attach('file', buffer, 'fail_test.xlsx');

      expect(res.status).toBe(404);

      const batchesCountAfter = await prisma.stockBatch.count();
      const invoicesCountAfter = await prisma.purchaseInvoice.count();

      expect(batchesCountAfter).toBe(batchesCountBefore);
      expect(invoicesCountAfter).toBe(invoicesCountBefore);
    });

    it('14.13 Final invoice posting updates only the intended branch\'s stock and does not pollute other branches', async () => {
      const uniqueBatch = `ISO-B1-${Date.now()}`;
      const uniqueInvoiceNo = `INV-ISO-${Date.now()}`;

      // 1. Stage Preview for Branch 1
      const rows = [
        {
          'Product Name': 'Isolated Branch Drug 500mg',
          'Generic Name': 'Isolacin',
          'Strength': '500mg',
          'Dosage Form': 'Tablet',
          'Manufacturer': 'Isolation Labs',
          'Batch Number': uniqueBatch,
          'Expiry Date': '2028-12-31',
          'Purchase Unit': 'Box',
          'Quantity': 25,
          'Free Quantity': 0,
          'Units Per Pack': 10,
          'Purchase Rate': 40.0,
          'MRP': 60.0,
          'GST Rate': 12,
          'Discount': 0,
        },
      ];

      const previewRes = await request(app)
        .post('/api/purchases/import-preview')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('branchId', branchId)
        .attach('file', createExcelBuffer(rows), 'iso_test.xlsx');

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.targetBranchId).toBe(branchId);
      const validItem = previewRes.body.rows[0];

      // 2. Post invoice into Branch 1
      const postPayload = {
        branchId, // Target: Branch 1
        supplierId,
        supplierInvoiceNumber: uniqueInvoiceNo,
        invoiceDate: new Date().toISOString(),
        paymentMode: 'CASH',
        paidAmount: previewRes.body.metrics.estimatedGrandTotal,
        notes: 'Testing strict branch isolation',
        lines: [
          {
            medicineId: validItem.medicineId,
            newMedicine: validItem.newMedicine,
            batchNumber: validItem.batchNumber,
            expiryDate: validItem.expiryDate,
            quantity: validItem.quantity,
            freeQuantity: validItem.freeQuantity,
            unit: validItem.unit,
            conversionFactor: validItem.conversionFactor,
            purchaseRate: validItem.purchaseRate,
            sellingRate: validItem.sellingRate,
            mrp: validItem.mrp,
            discountPercent: validItem.discountPercent,
            discountAmount: validItem.discountAmount,
            gstRate: validItem.gstRate,
          },
        ],
      };

      const postRes = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(postPayload);

      expect(postRes.status).toBe(201);

      // Verify batch exists in intended branch (Branch 1)
      const batchInBranch1 = await prisma.stockBatch.findFirst({
        where: { batchNumber: uniqueBatch, branchId },
      });
      expect(batchInBranch1).not.toBeNull();
      expect(batchInBranch1?.availableQuantity).toBe(250); // 25 * 10

      // CRITICAL CHECK: Verify batch does NOT exist in Branch 2!
      const batchInBranch2 = await prisma.stockBatch.findFirst({
        where: { batchNumber: uniqueBatch, branchId: branchId2 },
      });
      expect(batchInBranch2).toBeNull();
    });
  });
});
