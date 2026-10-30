import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/database/prisma';

/**
 * Confidos Pharma — Database Empty State Reset Script
 * 
 * Clears all business and inventory transactions, stock batches, catalogue medicines,
 * suppliers, branches, users, and companies, leaving a pure empty production-ready schema
 * with system configuration settings intact.
 * 
 * On next launch, the application triggers the Initial Administrator Onboarding Wizard.
 */
export async function resetDatabaseToEmptyState() {
  console.log('🔄 Initiating Confidos Pharma Pure Empty State Reset...');

  // 1. Transactional & Line Item Tables
  await prisma.purchaseIndentItem.deleteMany({});
  await prisma.purchaseIndent.deleteMany({});
  await prisma.salesInvoiceLine.deleteMany({});
  await prisma.salesInvoice.deleteMany({});
  await prisma.purchaseReturnLine.deleteMany({});
  await prisma.purchaseReturn.deleteMany({});
  await prisma.purchaseInvoiceLine.deleteMany({});
  await prisma.purchaseInvoice.deleteMany({});
  await prisma.expense.deleteMany({});

  // 2. Inventory Ledger & Batches
  await prisma.stockMovement.deleteMany({});
  await prisma.stockAdjustment.deleteMany({});
  await prisma.stockTransfer.deleteMany({});
  await prisma.stockBatch.deleteMany({});

  // 3. Import jobs, audit events, and privacy requests
  await prisma.importJob.deleteMany({});
  await prisma.privacyRequest.deleteMany({});
  await prisma.auditEvent.deleteMany({});

  // 4. Catalogue & Master Records
  await prisma.medicineProduct.deleteMany({});
  await prisma.supplier.deleteMany({});

  // 5. Users, Branches, and Company (enables fresh onboarding flow)
  await prisma.user.deleteMany({});
  await prisma.branch.deleteMany({});
  await prisma.company.deleteMany({});

  console.log('✅ All application data, inventory batches, catalogues, branches, and user records cleared.');
  console.log('✅ Database schema, migrations, constraints, and system configuration settings preserved.');
  console.log('🌟 The system will now open directly into the Initial Onboarding Wizard (GET /api/auth/setup-status -> needsSetup: true).');
}

if (require.main === module) {
  resetDatabaseToEmptyState()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Reset failed:', err);
      process.exit(1);
    });
}
