import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/database/prisma';

/**
 * Confidos Pharma — Database Complete Purge / Fresh Production Reset Script
 * 
 * Safely clears all data across all database tables (transactions, batches,
 * catalogue items, suppliers, audit events, import jobs, privacy requests,
 * expenses, branches, companies, users, and system settings).
 * 
 * Database schema, migrations, constraints, and relationships remain fully intact.
 * On application start, the system triggers the initial Super Administrator onboarding wizard.
 */
export async function resetDatabaseToEmptyState() {
  console.log('🔄 Initiating Confidos Pharma Complete Database Purge...');

  const allTables = [
    'AuditEvent',
    'Branch',
    'Company',
    'Expense',
    'ImportJob',
    'MedicineProduct',
    'PrivacyRequest',
    'PurchaseIndent',
    'PurchaseIndentItem',
    'PurchaseInvoice',
    'PurchaseInvoiceLine',
    'PurchaseReturn',
    'PurchaseReturnLine',
    'SalesInvoice',
    'SalesInvoiceLine',
    'StockAdjustment',
    'StockBatch',
    'StockMovement',
    'StockTransfer',
    'Supplier',
    'SystemSetting',
    'User',
  ];

  const truncateQuery = `TRUNCATE TABLE ${allTables.map((t) => `"${t}"`).join(', ')} CASCADE;`;
  await prisma.$executeRawUnsafe(truncateQuery);

  console.log('✅ TRUNCATE TABLE CASCADE executed successfully across all application tables.');
  console.log('\n📊 Verifying row counts across all database tables:');

  let totalRemainingRows = 0;
  for (const tableName of allTables) {
    const res: Array<{ count: bigint | number | string }> = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM "${tableName}";`
    );
    const count = Number(res[0]?.count || 0);
    console.log(`  ✓ ${tableName.padEnd(25)}: ${count} rows`);
    totalRemainingRows += count;
  }

  console.log(`\n🎉 Total application rows remaining: ${totalRemainingRows}`);
  if (totalRemainingRows === 0) {
    console.log('✨ All database tables are now completely EMPTY.');
    console.log('🚀 Ready to start fresh production! The onboarding wizard is active at /login (GET /api/auth/setup-status -> needsSetup: true).');
  } else {
    console.warn(`⚠️ Warning: Expected 0 rows but found ${totalRemainingRows} rows remaining.`);
  }
}

if (require.main === module) {
  resetDatabaseToEmptyState()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Reset failed:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
