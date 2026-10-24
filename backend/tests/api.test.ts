import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('Confidos Pharma API Test Suite', () => {
  let superAdminToken: string;
  let vjaAdminToken: string;
  let gntAdminToken: string;
  let vjaCashierToken: string;
  let vjaBranchId: string;
  let gntBranchId: string;
  let doloProductId: string;
  let vjaDoloBatchId: string;

  beforeAll(async () => {
    // 1. Authenticate Super Admin
    const saRes = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'superadmin', password: 'Pharma@2026' });

    expect(saRes.status).toBe(200);
    expect(saRes.body.token).toBeDefined();
    superAdminToken = saRes.body.token;

    // 2. Authenticate Vijayawada Admin
    const vjaRes = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'admin_vja', password: 'Pharma@2026' });

    expect(vjaRes.status).toBe(200);
    vjaAdminToken = vjaRes.body.token;
    vjaBranchId = vjaRes.body.user.branchId;

    // 3. Authenticate Guntur Admin
    const gntRes = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'admin_gnt', password: 'Pharma@2026' });

    expect(gntRes.status).toBe(200);
    gntAdminToken = gntRes.body.token;
    gntBranchId = gntRes.body.user.branchId;

    // 4. Authenticate Vijayawada Cashier
    const cashierRes = await request(app)
      .post('/api/auth/login')
      .send({ usernameOrEmail: 'bill_vja_1', password: 'Pharma@2026' });

    expect(cashierRes.status).toBe(200);
    vjaCashierToken = cashierRes.body.token;
  });

  it('Health check endpoint returns status healthy', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  it('Enforces branch isolation: Guntur Admin CANNOT access Vijayawada stock batches', async () => {
    const res = await request(app)
      .get(`/api/inventory/batches?branchId=${vjaBranchId}`)
      .set('Authorization', `Bearer ${gntAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Access denied');
  });

  it('Billing User CANNOT create or edit catalogue products (PRD 2.3)', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${vjaCashierToken}`)
      .send({
        brandName: 'Unauthorized Drug',
        genericName: 'Sample',
        strength: '10mg',
        dosageForm: 'Tablet',
        manufacturer: 'Test',
        hsnCode: '30049099',
        gstRate: 12,
        mrp: 100,
      });

    expect(res.status).toBe(403);
  });

  it('FEFO Algorithm returns the earliest non-expired batch for Vijayawada', async () => {
    // Search for Dolo 650
    const prodRes = await request(app)
      .get('/api/products?search=Dolo')
      .set('Authorization', `Bearer ${vjaCashierToken}`);

    expect(prodRes.status).toBe(200);
    const dolo = prodRes.body.products.find((p: any) => p.brandName === 'Dolo 650');
    expect(dolo).toBeDefined();
    doloProductId = dolo.id;

    // Request FEFO batch
    const fefoRes = await request(app)
      .get(`/api/inventory/fefo/${doloProductId}`)
      .set('Authorization', `Bearer ${vjaCashierToken}`);

    expect(fefoRes.status).toBe(200);
    expect(fefoRes.body.batchNumber).toBe('DL-24A01'); // Earliest batch created in seed
    vjaDoloBatchId = fefoRes.body.id;
  });

  it('Prevents selling expired stock batch (PRD 5.2)', async () => {
    // Find Telma product
    const prodRes = await request(app)
      .get('/api/products?search=Telma')
      .set('Authorization', `Bearer ${vjaCashierToken}`);

    const telma = prodRes.body.products.find((p: any) => p.brandName === 'Telma 40');
    expect(telma).toBeDefined();

    // Find the expired batch
    const batchesRes = await request(app)
      .get(`/api/inventory/batches?medicineId=${telma.id}&expired=true`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    expect(batchesRes.status).toBe(200);
    const expiredBatch = batchesRes.body.find((b: any) => b.status === 'EXPIRED');
    expect(expiredBatch).toBeDefined();

    // Attempt to sell expired batch
    const billRes = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${vjaCashierToken}`)
      .send({
        customerName: 'Test Patient',
        items: [
          {
            medicineId: telma.id,
            batchId: expiredBatch.id,
            quantity: 1,
          },
        ],
      });

    expect(billRes.status).toBe(400);
    expect(billRes.body.message).toMatch(/expired/i);
  });

  it('Point of sale billing calculates GST, deducts stock atomically, and logs sale', async () => {
    // Check initial stock
    const initialCheck = await request(app)
      .get(`/api/inventory/batches?medicineId=${doloProductId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);
    const initialBatch = initialCheck.body.find((b: any) => b.id === vjaDoloBatchId);
    const initialQty = initialBatch.availableQuantity;

    const billRes = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${vjaCashierToken}`)
      .send({
        customerName: 'K. Srinivasan',
        customerPhone: '9848099887',
        paymentMethod: 'UPI',
        items: [
          {
            medicineId: doloProductId,
            batchId: vjaDoloBatchId,
            quantity: 2,
            discountPercent: 5,
          },
        ],
      });

    expect(billRes.status).toBe(201);
    expect(billRes.body.invoiceNumber).toMatch(/^INV-VJA-/);
    expect(billRes.body.lines.length).toBe(1);
    expect(billRes.body.grandTotal).toBeGreaterThan(0);
    expect(billRes.body.cgstTotal).toBeGreaterThan(0);
    expect(billRes.body.sgstTotal).toBeGreaterThan(0);

    // Verify stock was reduced by exactly 2
    const batchCheck = await request(app)
      .get(`/api/inventory/batches?medicineId=${doloProductId}`)
      .set('Authorization', `Bearer ${vjaAdminToken}`);

    const updatedBatch = batchCheck.body.find((b: any) => b.id === vjaDoloBatchId);
    expect(updatedBatch.availableQuantity).toBe(initialQty - 2);
  });

  it('Overselling rejection: Cannot sell more stock than available in branch', async () => {
    const billRes = await request(app)
      .post('/api/billing/invoices')
      .set('Authorization', `Bearer ${vjaCashierToken}`)
      .send({
        customerName: 'Bulk Buyer',
        items: [
          {
            medicineId: doloProductId,
            batchId: vjaDoloBatchId,
            quantity: 9999, // Way more than 38 available
          },
        ],
      });

    expect(billRes.status).toBe(400);
    expect(billRes.body.message).toContain('Insufficient stock');
  });
});
