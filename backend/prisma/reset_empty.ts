import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/database/prisma';

/**
 * Confidos Pharma — Database Empty State Reset Script (Phase 18)
 * 
 * Clears all business and inventory transactions, stock batches, catalogue medicines,
 * and suppliers, leaving an empty, production-ready schema while preserving administrative
 * access and branch infrastructure.
 */
export async function resetDatabaseToEmptyState() {
  console.log('🔄 Initiating Confidos Pharma Empty State Reset...');

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

  console.log('✅ All business records, inventory batches, and suppliers cleared.');
  console.log('✅ Database schema, migrations, system settings, branches, and admin accounts preserved.');
}

if (require.main === module) {
  resetDatabaseToEmptyState()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Reset failed:', err);
      process.exit(1);
    });
}
