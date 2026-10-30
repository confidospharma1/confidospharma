import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import prisma from '../src/database/prisma';
import { JWT_SECRET } from '../src/config/jwt';
import {
  buildHeaderMapping,
  cleanHeaderString,
  normalizeHeaderKey,
  parseExpiryDate,
  parseCleanNumber,
  parseCleanInt,
} from '../src/modules/imports/imports.mapper';

describe('Bulk Import Unit & Integration Tests', { timeout: 35000 }, () => {
  let superAdminToken: string = '';
  let branchId: string = '';

  beforeAll(async () => {
    // Authenticate Super Admin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'confidossuperadmin', password: 'SuperAdmin@2026' });

    if (loginRes.status === 200 && loginRes.body?.token) {
      superAdminToken = loginRes.body.token;
    } else {
      // Fallback to test seed login if available
      const altLogin = await request(app)
        .post('/api/auth/login')
        .send({ usernameOrEmail: 'superadmin', password: 'Pharma@2026' });
      if (altLogin.status === 200 && altLogin.body?.token) {
        superAdminToken = altLogin.body.token;
      }
    }

    if (!superAdminToken) {
      let sa = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true } });
      if (!sa) {
        sa = await prisma.user.create({
          data: {
            username: 'import_test_superadmin',
            email: 'import_test_superadmin@confidos.test',
            fullName: 'Import Super Admin',
            passwordHash: 'dummy',
            role: 'SUPER_ADMIN',
            isActive: true,
          },
        });
      }
      superAdminToken = jwt.sign(
        { id: sa.id, username: sa.username, role: sa.role, branchId: sa.branchId },
        JWT_SECRET,
        { expiresIn: '1d' }
      );
    }

    let branch = await prisma.branch.findFirst({ where: { isActive: true } });
    if (!branch) {
      const company = (await prisma.company.findFirst()) || (await prisma.company.create({
        data: { name: 'Confidos Pharma Ltd.', legalName: 'Confidos Pharma Ltd.' },
      }));
      branch = await prisma.branch.create({
        data: {
          companyId: company.id,
          code: 'B-VJA',
          name: 'Vijayawada Central',
          address: 'MG Road',
          phone: '9999999999',
          isActive: true,
        },
      });
    }
    branchId = branch.id;
  });

  describe('1. Header Normalization & Mapper Unit Tests', () => {
    it('cleans UTF-8 BOM and whitespace from headers', () => {
      expect(cleanHeaderString('\uFEFFBrand Name')).toBe('Brand Name');
      expect(cleanHeaderString('  Brand Name  ')).toBe('Brand Name');
      expect(normalizeHeaderKey('\uFEFFbrand_name')).toBe('brand name');
      expect(normalizeHeaderKey('  BATCH-NUMBER  ')).toBe('batch number');
    });

    it('maps official Catalogue template headers without conflict', () => {
      const headers = [
        'Brand Name',
        'Generic Name',
        'Strength',
        'Dosage Form',
        'Manufacturer',
        'Pack Size',
        'HSN Code',
        'GST Rate',
        'MRP',
        'Barcode',
        'Prescription Type',
      ];
      const res = buildHeaderMapping(headers, 'CATALOGUE');
      expect(res.duplicateHeaders).toHaveLength(0);
      expect(res.conflictingColumns).toHaveLength(0);
      expect(res.headerMap.get('Brand Name')).toBe('brandName');
      expect(res.headerMap.get('Generic Name')).toBe('genericName');
      expect(res.headerMap.get('Strength')).toBe('strength');
      expect(res.headerMap.get('MRP')).toBe('mrp');
    });

    it('maps official Stock Receipt template headers without conflict', () => {
      const headers = [
        'Internal Code',
        'Brand Name',
        'Batch Number',
        'Expiry Date',
        'Quantity',
        'Purchase Rate',
        'MRP',
      ];
      const res = buildHeaderMapping(headers, 'STOCK_RECEIPT');
      expect(res.duplicateHeaders).toHaveLength(0);
      expect(res.conflictingColumns).toHaveLength(0);
      expect(res.headerMap.get('Internal Code')).toBe('internalCode');
      expect(res.headerMap.get('Brand Name')).toBe('brandName');
      expect(res.headerMap.get('Batch Number')).toBe('batchNumber');
      expect(res.headerMap.get('Expiry Date')).toBe('expiryDate');
      expect(res.headerMap.get('Quantity')).toBe('quantity');
      expect(res.headerMap.get('Purchase Rate')).toBe('purchaseRate');
      expect(res.headerMap.get('MRP')).toBe('mrp');
    });

    it('maps user 12-column test CSV headers for Catalogue without error', () => {
      const headers = [
        'medicine_name',
        'brand',
        'generic_name',
        'strength',
        'batch_number',
        'expiry_date',
        'quantity',
        'purchase_rate',
        'mrp',
        'hsn',
        'supplier_name',
        'invoice_number',
      ];
      const res = buildHeaderMapping(headers, 'CATALOGUE');
      expect(res.duplicateHeaders).toHaveLength(0);
      expect(res.conflictingColumns).toHaveLength(0);
      // Disambiguation: medicine_name -> brandName, brand -> manufacturer
      expect(res.headerMap.get('medicine_name')).toBe('brandName');
      expect(res.headerMap.get('brand')).toBe('manufacturer');
      expect(res.headerMap.get('generic_name')).toBe('genericName');
      expect(res.headerMap.get('strength')).toBe('strength');
      expect(res.headerMap.get('mrp')).toBe('mrp');
      expect(res.headerMap.get('hsn')).toBe('hsnCode');
    });

    it('maps user 12-column test CSV headers for Stock Receipt without error', () => {
      const headers = [
        'medicine_name',
        'brand',
        'generic_name',
        'strength',
        'batch_number',
        'expiry_date',
        'quantity',
        'purchase_rate',
        'mrp',
        'hsn',
        'supplier_name',
        'invoice_number',
      ];
      const res = buildHeaderMapping(headers, 'STOCK_RECEIPT');
      expect(res.duplicateHeaders).toHaveLength(0);
      expect(res.headerMap.get('batch_number')).toBe('batchNumber');
      expect(res.headerMap.get('expiry_date')).toBe('expiryDate');
      expect(res.headerMap.get('quantity')).toBe('quantity');
      expect(res.headerMap.get('purchase_rate')).toBe('purchaseRate');
      expect(res.headerMap.get('mrp')).toBe('mrp');
    });

    it('detects duplicate headers after normalization', () => {
      const headers = ['Brand Name', 'brand_name', 'MRP'];
      const res = buildHeaderMapping(headers, 'CATALOGUE');
      expect(res.duplicateHeaders.length).toBeGreaterThan(0);
    });
  });

  describe('2. Date & Numeric Parsing Unit Tests', () => {
    it('safely parses ISO YYYY-MM-DD dates', () => {
      const res = parseExpiryDate('2028-12-31');
      expect(res.error).toBeNull();
      expect(res.date).toBeInstanceOf(Date);
      expect(res.isoString).toContain('2028-12-31');
    });

    it('safely parses DD/MM/YYYY and DD-MM-YYYY dates', () => {
      const dmy = parseExpiryDate('31/12/2028');
      expect(dmy.error).toBeNull();
      expect(dmy.isoString).toContain('2028-12-31');

      const dmyDash = parseExpiryDate('30-06-2028');
      expect(dmyDash.error).toBeNull();
      expect(dmyDash.isoString).toContain('2028-06-30');
    });

    it('safely parses MM/YYYY dates to last day of month', () => {
      const my = parseExpiryDate('12/2028');
      expect(my.error).toBeNull();
      expect(my.isoString).toContain('2028-12');
    });

    it('returns error without throwing for invalid or empty dates', () => {
      expect(parseExpiryDate('invalid-date').error).toBeTruthy();
      expect(parseExpiryDate('').error).toBe('Expiry Date is required');
      expect(parseExpiryDate(null).error).toBe('Expiry Date is required');
    });

    it('cleans numeric fields with currency symbols and commas', () => {
      expect(parseCleanNumber('₹ 1,250.50')).toBe(1250.5);
      expect(parseCleanNumber('100')).toBe(100);
      expect(parseCleanInt('50 units')).toBe(50);
      expect(parseCleanNumber('')).toBeNaN();
    });
  });

  describe('3. Template Download API Endpoints', () => {
    it('rejects unauthenticated requests to template download with 401', async () => {
      const res = await request(app).get('/api/imports/template/catalogue');
      expect(res.status).toBe(401);
    });

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
      expect(res.text).toContain('Telma 20');
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
      expect(res.text).toContain('Dolo 650');
    });
  });

  describe('4. End-to-End Catalogue Import & Brand Name Validation Test', () => {
    it('successfully uploads and stages the user 3-row test CSV under Catalogue', async () => {
      if (!superAdminToken || !branchId) return;

      const userCsv = [
        'medicine_name,brand,generic_name,strength,batch_number,expiry_date,quantity,purchase_rate,mrp,hsn,supplier_name,invoice_number',
        'Paracetamol 500 mg Tablet,Demo Pharma,Paracetamol,500 mg,DEMO-PARA-001,2027-12-31,100,1.2,2.0,30049099,Demo Medical Distributors,DEMO-INV-001',
        'Cetirizine 10 mg Tablet,Demo Pharma,Cetirizine,10 mg,DEMO-CET-002,2028-06-30,50,0.8,1.5,30049099,Demo Medical Distributors,DEMO-INV-001',
        'ORS Powder Sachet,Demo Pharma,Oral Rehydration Salts,Standard,DEMO-ORS-003,2028-03-31,30,8.0,12.0,30049099,Demo Medical Distributors,DEMO-INV-001',
      ].join('\n');

      const res = await request(app)
        .post('/api/imports/upload')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('importType', 'CATALOGUE')
        .field('branchId', branchId)
        .attach('file', Buffer.from(userCsv), 'test_catalogue_user.csv');

      expect(res.status).toBe(201);
      expect(res.body.summary.totalRows).toBe(3);
      // All 3 rows must now be VALID and ready to commit!
      expect(res.body.summary.validRows).toBe(3);
      expect(res.body.summary.errorRows).toBe(0);
      expect(res.body.previewRows[0].status).toBe('READY');
      expect(res.body.previewRows[0].brandName).toBe('Paracetamol 500 mg Tablet');
      expect(res.body.previewRows[0].genericName).toBe('Paracetamol');
      expect(res.body.previewRows[0].errors).toHaveLength(0);

      // Now commit the staged catalogue medicines
      const commitRes = await request(app)
        .post(`/api/imports/${res.body.importId}/commit`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(commitRes.status).toBe(200);
      expect(commitRes.body.committedRows).toBe(3);

      // Verify records are present in MedicineProduct table
      const products = await prisma.medicineProduct.findMany({
        where: { brandName: 'Paracetamol 500 mg Tablet' },
      });
      expect(products.length).toBeGreaterThan(0);
      expect(products[0].genericName).toBe('Paracetamol');
    });

    it('successfully uploads and stages Stock Receipt for existing catalogue medicines without HTTP 500', async () => {
      if (!superAdminToken || !branchId) return;

      const stockReceiptCsv = [
        'brand_name,batch_number,expiry_date,quantity,purchase_rate,mrp',
        'Paracetamol 500 mg Tablet,DEMO-PARA-001,2027-12-31,100,1.2,2.0',
        'Cetirizine 10 mg Tablet,DEMO-CET-002,2028-06-30,50,0.8,1.5',
        'ORS Powder Sachet,DEMO-ORS-003,2028-03-31,30,8.0,12.0',
      ].join('\n');

      const res = await request(app)
        .post('/api/imports/upload')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('importType', 'STOCK_RECEIPT')
        .field('branchId', branchId)
        .attach('file', Buffer.from(stockReceiptCsv), 'test_stock_receipt_user.csv');

      // Crucial: Must NOT be HTTP 500!
      expect(res.status).toBe(201);
      expect(res.body.summary.totalRows).toBe(3);
      expect(res.body.summary.validRows).toBe(3);
      expect(res.body.summary.errorRows).toBe(0);
      expect(res.body.previewRows[0].status).toBe('READY');
      expect(res.body.previewRows[0].batchNumber).toBe('DEMO-PARA-001');

      // Commit the stock receipt
      const commitRes = await request(app)
        .post(`/api/imports/${res.body.importId}/commit`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(commitRes.status).toBe(200);
      expect(commitRes.body.committedRows).toBe(3);

      // Verify StockBatch and StockMovement records
      const batches = await prisma.stockBatch.findMany({
        where: { batchNumber: 'DEMO-PARA-001', branchId },
      });
      expect(batches.length).toBeGreaterThan(0);
      expect(batches[0].availableQuantity).toBe(100);

      const movements = await prisma.stockMovement.findMany({
        where: { batchId: batches[0].id, movementType: 'PURCHASE_RECEIPT' },
      });
      expect(movements.length).toBeGreaterThan(0);
    });

    it('returns structured validation errors without HTTP 500 for invalid stock receipt file', async () => {
      if (!superAdminToken || !branchId) return;

      const badCsv = [
        'Brand Name,Batch Number,Expiry Date,Quantity,Purchase Rate,MRP',
        'UnknownMedicineNonExistent,BATCH-001,invalid-date,-10,50,40', // unmapped medicine, bad date, negative qty, MRP < purchase rate
      ].join('\n');

      const res = await request(app)
        .post('/api/imports/upload')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .field('importType', 'STOCK_RECEIPT')
        .field('branchId', branchId)
        .attach('file', Buffer.from(badCsv), 'bad_stock.csv');

      // Must produce a clean 201 staging response with status 'ERROR' in preview, NEVER HTTP 500!
      expect(res.status).toBe(201);
      expect(res.body.summary.errorRows).toBe(1);
      expect(res.body.summary.validRows).toBe(0);
      expect(res.body.previewRows[0].status).toBe('ERROR');
      expect(res.body.previewRows[0].errors.length).toBeGreaterThan(0);
    });
  });
});
