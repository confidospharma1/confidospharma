import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import prisma from '../src/database/prisma';

export async function backupDatabase() {
  console.log('📦 Starting Confidos Pharma Database Backup...');

  const backupDir = path.resolve(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(backupDir, `db-backup-${timestamp}.json`);

  const backupData: Record<string, any[]> = {};
  const stats: Record<string, number> = {};

  const models: Array<{ name: string; fetch: () => Promise<any[]> }> = [
    { name: 'company', fetch: () => prisma.company.findMany() },
    { name: 'branch', fetch: () => prisma.branch.findMany() },
    { name: 'user', fetch: () => prisma.user.findMany() },
    { name: 'medicineProduct', fetch: () => prisma.medicineProduct.findMany() },
    { name: 'supplier', fetch: () => prisma.supplier.findMany() },
    { name: 'stockBatch', fetch: () => prisma.stockBatch.findMany() },
    { name: 'stockMovement', fetch: () => prisma.stockMovement.findMany() },
    { name: 'stockTransfer', fetch: () => prisma.stockTransfer.findMany() },
    { name: 'salesInvoice', fetch: () => prisma.salesInvoice.findMany() },
    { name: 'salesInvoiceLine', fetch: () => prisma.salesInvoiceLine.findMany() },
    { name: 'purchaseInvoice', fetch: () => prisma.purchaseInvoice.findMany() },
    { name: 'purchaseInvoiceLine', fetch: () => prisma.purchaseInvoiceLine.findMany() },
    { name: 'purchaseReturn', fetch: () => prisma.purchaseReturn.findMany() },
    { name: 'purchaseReturnLine', fetch: () => prisma.purchaseReturnLine.findMany() },
    { name: 'purchaseIndent', fetch: () => prisma.purchaseIndent.findMany() },
    { name: 'purchaseIndentItem', fetch: () => prisma.purchaseIndentItem.findMany() },
    { name: 'stockAdjustment', fetch: () => prisma.stockAdjustment.findMany() },
    { name: 'importJob', fetch: () => prisma.importJob.findMany() },
    { name: 'auditEvent', fetch: () => prisma.auditEvent.findMany() },
    { name: 'privacyRequest', fetch: () => prisma.privacyRequest.findMany() },
    { name: 'systemSetting', fetch: () => prisma.systemSetting.findMany() },
    { name: 'expense', fetch: () => prisma.expense.findMany() },
  ];

  for (const model of models) {
    try {
      const records = await model.fetch();
      backupData[model.name] = records;
      stats[model.name] = records.length;
      console.log(`  ✓ ${model.name.padEnd(20)}: ${records.length} records`);
    } catch (err: any) {
      console.error(`  ✗ Error backing up ${model.name}:`, err.message);
      backupData[model.name] = [];
      stats[model.name] = -1;
    }
  }

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`\n💾 Full database backup safely written to: ${backupFilePath}`);
  console.log('📊 Table summary:', stats);

  return { backupFilePath, stats };
}

if (require.main === module) {
  backupDatabase()
    .then(() => {
      console.log('✅ Backup completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Backup failed:', err);
      process.exit(1);
    });
}
