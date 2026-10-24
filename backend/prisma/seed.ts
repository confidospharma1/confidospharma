import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Confidos Pharma Database...');

  // Clean existing tables (in order of relations)
  await prisma.auditEvent.deleteMany();
  await prisma.salesInvoiceLine.deleteMany();
  await prisma.salesInvoice.deleteMany();
  await prisma.purchaseInvoiceLine.deleteMany();
  await prisma.purchaseInvoice.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockAdjustment.deleteMany();
  await prisma.stockTransfer.deleteMany();
  await prisma.stockBatch.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.privacyRequest.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.user.deleteMany();
  await prisma.medicineProduct.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.company.deleteMany();

  // 1. Company
  const company = await prisma.company.create({
    data: {
      name: 'Confidos Pharma Ltd.',
      legalName: 'Confidos Healthcare & Pharmaceuticals Private Limited',
      gstin: '37AAAAA1234A1Z5',
      address: 'Plot 42, APIIC Tech Zone, Vijayawada, Andhra Pradesh - 520008',
      phone: '+91 866 2554400',
      email: 'corporate@confidospharma.com',
    },
  });

  // 2. Branches (Vijayawada, Guntur, Tenali)
  const vjaBranch = await prisma.branch.create({
    data: {
      companyId: company.id,
      code: 'B-VJA',
      name: 'Vijayawada Central Branch',
      address: 'Beside Old Bus Stand, MG Road, Vijayawada, AP - 520002',
      phone: '+91 866 2471122',
      email: 'vja.branch@confidospharma.com',
      gstin: '37AAAAA1234A1Z5',
      drugLicenseNo: '20B/21B-AP/VJA/1042',
      isActive: true,
    },
  });

  const gntBranch = await prisma.branch.create({
    data: {
      companyId: company.id,
      code: 'B-GNT',
      name: 'Guntur Hospital Road Branch',
      address: 'Opposite Government General Hospital, Main Road, Guntur, AP - 522001',
      phone: '+91 863 2234455',
      email: 'gnt.branch@confidospharma.com',
      gstin: '37AAAAA1234A1Z6',
      drugLicenseNo: '20B/21B-AP/GNT/2058',
      isActive: true,
    },
  });

  const tnlBranch = await prisma.branch.create({
    data: {
      companyId: company.id,
      code: 'B-TNL',
      name: 'Tenali Market Branch',
      address: 'Near Market Center, Station Road, Tenali, AP - 522201',
      phone: '+91 864 4223344',
      email: 'tnl.branch@confidospharma.com',
      gstin: '37AAAAA1234A1Z7',
      drugLicenseNo: '20B/21B-AP/TNL/3091',
      isActive: true,
    },
  });

  console.log('Created Branches: Vijayawada, Guntur, Tenali');

  // 3. Users (PRD Section 2.5: Total 10 accounts)
  const defaultPasswordHash = await bcrypt.hash('Pharma@2026', 10);

  // Super Admin
  const superAdmin = await prisma.user.create({
    data: {
      username: 'superadmin',
      email: 'superadmin@confidospharma.com',
      fullName: 'Dr. K. S. Rao (Chief Operations)',
      passwordHash: defaultPasswordHash,
      role: 'SUPER_ADMIN',
      branchId: null,
      isActive: true,
    },
  });

  // Branch Admins
  const adminVja = await prisma.user.create({
    data: {
      username: 'admin_vja',
      email: 'admin.vja@confidospharma.com',
      fullName: 'Ramesh Varma (Branch Admin)',
      passwordHash: defaultPasswordHash,
      role: 'BRANCH_ADMIN',
      branchId: vjaBranch.id,
      isActive: true,
    },
  });

  const adminGnt = await prisma.user.create({
    data: {
      username: 'admin_gnt',
      email: 'admin.gnt@confidospharma.com',
      fullName: 'Srinivas Murthy (Branch Admin)',
      passwordHash: defaultPasswordHash,
      role: 'BRANCH_ADMIN',
      branchId: gntBranch.id,
      isActive: true,
    },
  });

  const adminTnl = await prisma.user.create({
    data: {
      username: 'admin_tnl',
      email: 'admin.tnl@confidospharma.com',
      fullName: 'Bhavani Prasad (Branch Admin)',
      passwordHash: defaultPasswordHash,
      role: 'BRANCH_ADMIN',
      branchId: tnlBranch.id,
      isActive: true,
    },
  });

  // Billing Users (2 per branch)
  const billUsers = [
    { username: 'bill_vja_1', email: 'bill1.vja@confidospharma.com', fullName: 'Anitha Reddy (Cashier)', branchId: vjaBranch.id },
    { username: 'bill_vja_2', email: 'bill2.vja@confidospharma.com', fullName: 'Kalyan Chakravarthy (Cashier)', branchId: vjaBranch.id },
    { username: 'bill_gnt_1', email: 'bill1.gnt@confidospharma.com', fullName: 'Prakash Rao (Cashier)', branchId: gntBranch.id },
    { username: 'bill_gnt_2', email: 'bill2.gnt@confidospharma.com', fullName: 'Swathi Priya (Cashier)', branchId: gntBranch.id },
    { username: 'bill_tnl_1', email: 'bill1.tnl@confidospharma.com', fullName: 'Venkatesh Kumar (Cashier)', branchId: tnlBranch.id },
    { username: 'bill_tnl_2', email: 'bill2.tnl@confidospharma.com', fullName: 'Madhavi Latha (Cashier)', branchId: tnlBranch.id },
  ];

  for (const u of billUsers) {
    await prisma.user.create({
      data: {
        username: u.username,
        email: u.email,
        fullName: u.fullName,
        passwordHash: defaultPasswordHash,
        role: 'BILLING_USER',
        branchId: u.branchId,
        isActive: true,
      },
    });
  }

  console.log('Created 10 User Accounts: 1 Super Admin, 3 Branch Admins, 6 Billing Users');

  // 4. Suppliers
  const supMedSource = await prisma.supplier.create({
    data: {
      name: 'MedSource Wholesalers Ltd',
      contactPerson: 'Suresh Naidu',
      phone: '+91 9848011223',
      email: 'sales@medsourceindia.com',
      gstin: '37AAECM1122P1ZB',
      address: 'Governorpet, Vijayawada',
      dlNumber: '20B/1290/2021',
      isActive: true,
    },
  });

  const supAndhra = await prisma.supplier.create({
    data: {
      name: 'Andhra Pharma Distributors',
      contactPerson: 'Chandra Sekhar',
      phone: '+91 9849033445',
      email: 'orders@andhrapharma.net',
      gstin: '37AABCA3344L1ZD',
      address: 'Kothapet, Guntur',
      dlNumber: '20B/3455/2022',
      isActive: true,
    },
  });

  const supKrishna = await prisma.supplier.create({
    data: {
      name: 'Sri Krishna Drug Agencies',
      contactPerson: 'Gopala Krishna',
      phone: '+91 9848155667',
      email: 'krishnadrugs@gmail.com',
      gstin: '37AAECK5566K1ZF',
      address: 'Bose Road, Tenali',
      dlNumber: '20B/4812/2020',
      isActive: true,
    },
  });

  // 5. Medicine Products Catalogue
  const productsData = [
    {
      internalCode: 'MED-001',
      brandName: 'Dolo 650',
      genericName: 'Paracetamol',
      strength: '650 mg',
      dosageForm: 'Tablet',
      manufacturer: 'Micro Labs Ltd',
      packSize: '15 Tablets',
      baseUnit: 'Strip',
      hsnCode: '30049060',
      gstRate: 12.0,
      mrp: 33.50,
      barcode: '8901117001014',
      prescriptionType: 'OTC',
      storageNotes: 'Store below 30°C in a dry place',
    },
    {
      internalCode: 'MED-002',
      brandName: 'Augmentin 625 Duo',
      genericName: 'Amoxicillin and Potassium Clavulanate',
      strength: '500 mg + 125 mg',
      dosageForm: 'Tablet',
      manufacturer: 'GlaxoSmithKline Pharmaceuticals Ltd',
      packSize: '10 Tablets',
      baseUnit: 'Strip',
      hsnCode: '30041010',
      gstRate: 12.0,
      mrp: 204.00,
      barcode: '8901117002028',
      prescriptionType: 'Schedule H1',
      storageNotes: 'Store below 25°C protected from moisture',
    },
    {
      internalCode: 'MED-003',
      brandName: 'Pan 40',
      genericName: 'Pantoprazole Gastro-resistant',
      strength: '40 mg',
      dosageForm: 'Tablet',
      manufacturer: 'Alkem Laboratories Ltd',
      packSize: '15 Tablets',
      baseUnit: 'Strip',
      hsnCode: '30049099',
      gstRate: 12.0,
      mrp: 155.00,
      barcode: '8901117003032',
      prescriptionType: 'Schedule H',
      storageNotes: 'Store in cool and dry place',
    },
    {
      internalCode: 'MED-004',
      brandName: 'Azithral 500',
      genericName: 'Azithromycin',
      strength: '500 mg',
      dosageForm: 'Tablet',
      manufacturer: 'Alembic Pharmaceuticals Ltd',
      packSize: '5 Tablets',
      baseUnit: 'Strip',
      hsnCode: '30042010',
      gstRate: 12.0,
      mrp: 120.00,
      barcode: '8901117004046',
      prescriptionType: 'Schedule H1',
      storageNotes: 'Store below 30°C',
    },
    {
      internalCode: 'MED-005',
      brandName: 'Glycomet-GP 1',
      genericName: 'Metformin Hydrochloride (SR) + Glimepiride',
      strength: '500 mg + 1 mg',
      dosageForm: 'Tablet',
      manufacturer: 'USV Private Ltd',
      packSize: '15 Tablets',
      baseUnit: 'Strip',
      hsnCode: '30049099',
      gstRate: 12.0,
      mrp: 110.00,
      barcode: '8901117005050',
      prescriptionType: 'Schedule H',
      storageNotes: 'Keep out of reach of children',
    },
    {
      internalCode: 'MED-006',
      brandName: 'Telma 40',
      genericName: 'Telmisartan',
      strength: '40 mg',
      dosageForm: 'Tablet',
      manufacturer: 'Glenmark Pharmaceuticals Ltd',
      packSize: '15 Tablets',
      baseUnit: 'Strip',
      hsnCode: '30049099',
      gstRate: 12.0,
      mrp: 145.00,
      barcode: '8901117006064',
      prescriptionType: 'Schedule H',
      storageNotes: 'Protect from moisture',
    },
    {
      internalCode: 'MED-007',
      brandName: 'Allegra 120mg',
      genericName: 'Fexofenadine Hydrochloride',
      strength: '120 mg',
      dosageForm: 'Tablet',
      manufacturer: 'Sanofi India Ltd',
      packSize: '10 Tablets',
      baseUnit: 'Strip',
      hsnCode: '30049099',
      gstRate: 12.0,
      mrp: 198.00,
      barcode: '8901117007078',
      prescriptionType: 'Schedule H',
      storageNotes: 'Store below 25°C',
    },
    {
      internalCode: 'MED-008',
      brandName: 'Montair-LC',
      genericName: 'Levocetirizine Dihydrochloride + Montelukast Sodium',
      strength: '5 mg + 10 mg',
      dosageForm: 'Tablet',
      manufacturer: 'Cipla Ltd',
      packSize: '10 Tablets',
      baseUnit: 'Strip',
      hsnCode: '30049099',
      gstRate: 12.0,
      mrp: 185.00,
      barcode: '8901117008082',
      prescriptionType: 'Schedule H',
      storageNotes: 'Store in airtight container',
    },
    {
      internalCode: 'MED-009',
      brandName: 'Shelcal 500',
      genericName: 'Calcium Carbonate + Vitamin D3',
      strength: '500 mg + 250 IU',
      dosageForm: 'Tablet',
      manufacturer: 'Torrent Pharmaceuticals Ltd',
      packSize: '15 Tablets',
      baseUnit: 'Strip',
      hsnCode: '30049099',
      gstRate: 12.0,
      mrp: 131.00,
      barcode: '8901117009096',
      prescriptionType: 'OTC',
      storageNotes: 'Store at room temperature',
    },
    {
      internalCode: 'MED-010',
      brandName: 'Ascoril D Plus',
      genericName: 'Dextromethorphan + Phenylephrine + Chlorpheniramine',
      strength: '10 mg + 5 mg + 2 mg / 5ml',
      dosageForm: 'Syrup',
      manufacturer: 'Glenmark Pharmaceuticals Ltd',
      packSize: '100 ml Bottle',
      baseUnit: 'Bottle',
      hsnCode: '30049099',
      gstRate: 12.0,
      mrp: 118.00,
      barcode: '8901117010108',
      prescriptionType: 'Schedule H',
      storageNotes: 'Shake well before use',
    },
  ];

  const createdProducts: any = {};
  for (const p of productsData) {
    const prod = await prisma.medicineProduct.create({ data: p });
    createdProducts[p.internalCode] = prod;
  }
  console.log(`Created ${productsData.length} Medicine Catalogue Products`);

  // 6. Batches for Branches (Separate Stock demonstration per PRD Section 3.1)
  // Vijayawada: 100 strips Dolo 650
  // Guntur: 35 strips Dolo 650
  // Tenali: 0 strips Dolo 650
  const dolo = createdProducts['MED-001'];
  const augmentin = createdProducts['MED-002'];
  const pan40 = createdProducts['MED-003'];
  const azithral = createdProducts['MED-004'];
  const glycomet = createdProducts['MED-005'];
  const telma = createdProducts['MED-006'];

  const now = new Date();
  const futureDate2027 = new Date('2027-12-31T00:00:00Z');
  const futureDate2026 = new Date('2026-11-30T00:00:00Z'); // Near-expiry (within 60 days)
  const expiredDate2025 = new Date('2025-05-31T00:00:00Z'); // Expired batch

  // Batch 1 for Vijayawada (Earliest expiry for FEFO)
  const b1Vja = await prisma.stockBatch.create({
    data: {
      branchId: vjaBranch.id,
      medicineId: dolo.id,
      batchNumber: 'DL-24A01',
      expiryDate: futureDate2026, // Expiry Nov 2026
      quantityReceived: 40,
      availableQuantity: 40,
      purchaseRate: 23.50,
      mrp: 33.50,
      sellingPrice: 33.50,
      supplierId: supMedSource.id,
      purchaseInvoiceRef: 'PI-2026-001',
      status: 'ACTIVE',
    },
  });

  // Batch 2 for Vijayawada (Later expiry)
  const b2Vja = await prisma.stockBatch.create({
    data: {
      branchId: vjaBranch.id,
      medicineId: dolo.id,
      batchNumber: 'DL-25B02',
      expiryDate: futureDate2027, // Expiry Dec 2027
      quantityReceived: 60,
      availableQuantity: 60,
      purchaseRate: 23.50,
      mrp: 33.50,
      sellingPrice: 33.50,
      supplierId: supMedSource.id,
      purchaseInvoiceRef: 'PI-2026-002',
      status: 'ACTIVE',
    },
  });
  // Total Dolo in Vijayawada: 40 + 60 = 100

  // Guntur: 35 strips Dolo 650
  await prisma.stockBatch.create({
    data: {
      branchId: gntBranch.id,
      medicineId: dolo.id,
      batchNumber: 'DL-24G01',
      expiryDate: futureDate2027,
      quantityReceived: 35,
      availableQuantity: 35,
      purchaseRate: 23.80,
      mrp: 33.50,
      sellingPrice: 33.50,
      supplierId: supAndhra.id,
      purchaseInvoiceRef: 'PI-GNT-101',
      status: 'ACTIVE',
    },
  });

  // Augmentin 625 in Vijayawada (50 strips)
  await prisma.stockBatch.create({
    data: {
      branchId: vjaBranch.id,
      medicineId: augmentin.id,
      batchNumber: 'AG-9021',
      expiryDate: futureDate2027,
      quantityReceived: 50,
      availableQuantity: 50,
      purchaseRate: 152.00,
      mrp: 204.00,
      sellingPrice: 204.00,
      supplierId: supMedSource.id,
      purchaseInvoiceRef: 'PI-2026-003',
      status: 'ACTIVE',
    },
  });

  // Pan 40 in Vijayawada (80 strips)
  await prisma.stockBatch.create({
    data: {
      branchId: vjaBranch.id,
      medicineId: pan40.id,
      batchNumber: 'PN-4432',
      expiryDate: futureDate2027,
      quantityReceived: 80,
      availableQuantity: 80,
      purchaseRate: 110.00,
      mrp: 155.00,
      sellingPrice: 155.00,
      supplierId: supMedSource.id,
      purchaseInvoiceRef: 'PI-2026-004',
      status: 'ACTIVE',
    },
  });

  // Azithral in Guntur (45 strips)
  await prisma.stockBatch.create({
    data: {
      branchId: gntBranch.id,
      medicineId: azithral.id,
      batchNumber: 'AZ-7711',
      expiryDate: futureDate2027,
      quantityReceived: 45,
      availableQuantity: 45,
      purchaseRate: 85.00,
      mrp: 120.00,
      sellingPrice: 120.00,
      supplierId: supAndhra.id,
      purchaseInvoiceRef: 'PI-GNT-102',
      status: 'ACTIVE',
    },
  });

  // Glycomet in Tenali (70 strips)
  await prisma.stockBatch.create({
    data: {
      branchId: tnlBranch.id,
      medicineId: glycomet.id,
      batchNumber: 'GL-5520',
      expiryDate: futureDate2027,
      quantityReceived: 70,
      availableQuantity: 70,
      purchaseRate: 78.00,
      mrp: 110.00,
      sellingPrice: 110.00,
      supplierId: supKrishna.id,
      purchaseInvoiceRef: 'PI-TNL-201',
      status: 'ACTIVE',
    },
  });

  // Expired & Quarantined Batch (demonstrating safety rules)
  await prisma.stockBatch.create({
    data: {
      branchId: vjaBranch.id,
      medicineId: telma.id,
      batchNumber: 'TL-EXP-01',
      expiryDate: expiredDate2025,
      quantityReceived: 15,
      availableQuantity: 15,
      purchaseRate: 100.00,
      mrp: 145.00,
      sellingPrice: 145.00,
      supplierId: supMedSource.id,
      purchaseInvoiceRef: 'PI-2025-OLD',
      status: 'EXPIRED', // Cannot be sold
    },
  });

  // Initial stock movements
  await prisma.stockMovement.create({
    data: {
      branchId: vjaBranch.id,
      medicineId: dolo.id,
      batchId: b1Vja.id,
      movementType: 'PURCHASE_RECEIPT',
      quantityDelta: 40,
      unitPrice: 23.50,
      referenceDocType: 'PURCHASE_INVOICE',
      referenceDocId: 'PI-2026-001',
      reason: 'Opening stock receipt from supplier MedSource',
      performedByUserId: adminVja.id,
    },
  });

  await prisma.stockMovement.create({
    data: {
      branchId: vjaBranch.id,
      medicineId: dolo.id,
      batchId: b2Vja.id,
      movementType: 'PURCHASE_RECEIPT',
      quantityDelta: 60,
      unitPrice: 23.50,
      referenceDocType: 'PURCHASE_INVOICE',
      referenceDocId: 'PI-2026-002',
      reason: 'Secondary stock receipt from supplier MedSource',
      performedByUserId: adminVja.id,
    },
  });

  // 7. System Settings
  await prisma.systemSetting.createMany({
    data: [
      { key: 'COMPANY_NAME', value: 'Confidos Pharma Ltd.', description: 'Corporate entity display name' },
      { key: 'DEFAULT_GST_RATE', value: '12.0', description: 'Standard pharma GST rate' },
      { key: 'NEAR_EXPIRY_THRESHOLD_DAYS', value: '60', description: 'Alert threshold for near-expiry batches' },
      { key: 'ALLOW_MANUAL_DISCOUNT', value: 'true', description: 'Allow cashier to apply up to 10% discount' },
      { key: 'MAX_DISCOUNT_PERCENT', value: '10.0', description: 'Maximum allowed POS discount' },
    ],
  });

  // 8. Audit Event for System Initialization
  await prisma.auditEvent.create({
    data: {
      branchId: null,
      userId: superAdmin.id,
      action: 'SYSTEM_INIT',
      targetEntity: 'SYSTEM',
      entityId: company.id,
      details: JSON.stringify({ message: 'Confidos Pharma system seeded with standard 3 branches and 10 default accounts' }),
      ipAddress: '127.0.0.1',
    },
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
