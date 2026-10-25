import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';

export const uploadAndPreviewImport = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users are not permitted to run bulk imports' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded. Please upload a .csv, .xlsx, or .xls file.' });
    }

    const { importType = 'CATALOGUE', branchId } = req.body;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId || req.user.branchId) : req.user.branchId;

    if (!targetBranchId) {
      return res.status(400).json({ message: 'Target branch is required for imports' });
    }

    // Read buffer with xlsx
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return res.status(400).json({ message: 'Uploaded workbook contains no sheets.' });
    }

    const rawRows = xlsx.utils.sheet_to_json<any>(workbook.Sheets[firstSheetName], { defval: '' });
    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ message: 'Uploaded file contains zero data rows.' });
    }

    // Stage & Validate Rows
    let validCount = 0;
    let errorCount = 0;
    let warningCount = 0;
    let duplicateCount = 0;

    const validatedRows: any[] = [];
    const errorRows: any[] = [];
    const seenKeys = new Set<string>();

    const existingProducts = await prisma.medicineProduct.findMany({
      select: { id: true, internalCode: true, brandName: true, genericName: true, strength: true, dosageForm: true },
    });

    const productMap = new Map<string, any>();
    for (const ep of existingProducts) {
      const key = `${ep.brandName.toLowerCase()}_${ep.genericName.toLowerCase()}_${ep.strength.toLowerCase()}_${ep.dosageForm.toLowerCase()}`;
      productMap.set(key, ep);
      productMap.set(ep.internalCode.toLowerCase(), ep);
    }

    let estimatedStockUnits = 0;

    rawRows.forEach((row, index) => {
      const rowIndex = index + 2; // Accounting for 1-based header
      const errors: string[] = [];
      const warnings: string[] = [];

      if (importType === 'CATALOGUE') {
        const brandName = (row['Brand Name'] || row['brandName'] || row['brand_name'] || '').toString().trim();
        const genericName = (row['Generic Name'] || row['genericName'] || row['generic_name'] || '').toString().trim();
        const strength = (row['Strength'] || row['strength'] || '').toString().trim();
        const dosageForm = (row['Dosage Form'] || row['dosageForm'] || row['form'] || 'Tablet').toString().trim();
        const manufacturer = (row['Manufacturer'] || row['manufacturer'] || '').toString().trim();
        const packSize = (row['Pack Size'] || row['packSize'] || '10 Tablets').toString().trim();
        const rawHsn = (row['HSN Code'] || row['hsnCode'] || '').toString().trim();
        const hsnCode = rawHsn ? rawHsn : null;
        const gstRate = parseFloat(row['GST Rate'] || row['gstRate'] || '12');
        const mrp = parseFloat(row['MRP'] || row['mrp'] || '0');
        const defaultPurchaseRate = parseFloat(row['Default Purchase Rate'] || row['purchaseRate'] || row['defaultPurchaseRate'] || '');
        const defaultSellingRate = parseFloat(row['Default Selling Rate'] || row['sellingRate'] || row['defaultSellingRate'] || '');
        const reorderLevel = parseInt(row['Reorder Level'] || row['reorderLevel'] || '10');
        const barcode = (row['Barcode'] || row['barcode'] || '').toString().trim();
        const prescriptionType = (row['Prescription Type'] || row['prescriptionType'] || 'Schedule H').toString().trim();

        if (!brandName) errors.push('Brand Name is required');
        if (!genericName) errors.push('Generic Name is required');
        if (!strength) errors.push('Strength is required');
        if (isNaN(mrp) || mrp <= 0) errors.push('Valid positive MRP is required');
        if (isNaN(gstRate) || gstRate < 0) errors.push('Valid GST Rate is required');

        const dedupKey = `${brandName.toLowerCase()}_${genericName.toLowerCase()}_${strength.toLowerCase()}_${dosageForm.toLowerCase()}`;
        if (seenKeys.has(dedupKey)) {
          duplicateCount++;
          errors.push('Duplicate row within uploaded file');
        } else {
          seenKeys.add(dedupKey);
        }

        if (productMap.has(dedupKey)) {
          warnings.push('Medicine already exists in catalogue (will be updated or skipped)');
          warningCount++;
        }

        const processed = {
          rowIndex,
          brandName,
          genericName,
          strength,
          dosageForm,
          manufacturer: manufacturer || 'Standard Pharma',
          packSize,
          hsnCode,
          gstRate: isNaN(gstRate) ? 12 : gstRate,
          mrp: isNaN(mrp) ? 0 : mrp,
          defaultPurchaseRate: isNaN(defaultPurchaseRate) ? null : defaultPurchaseRate,
          defaultSellingRate: isNaN(defaultSellingRate) ? null : defaultSellingRate,
          reorderLevel: isNaN(reorderLevel) ? 10 : reorderLevel,
          barcode: barcode || null,
          prescriptionType,
          status: errors.length > 0 ? 'ERROR' : 'READY',
          errors,
          warnings,
        };

        if (errors.length > 0) {
          errorCount++;
          errorRows.push(processed);
        } else {
          validCount++;
        }
        validatedRows.push(processed);
      } else {
        // STOCK_RECEIPT IMPORT
        const internalCode = (row['Internal Code'] || row['internalCode'] || row['code'] || '').toString().trim();
        const brandName = (row['Brand Name'] || row['brandName'] || '').toString().trim();
        const batchNumber = (row['Batch Number'] || row['batchNumber'] || row['batch'] || '').toString().trim();
        const expiryDateStr = (row['Expiry Date'] || row['expiryDate'] || row['expiry'] || '').toString().trim();
        const quantity = parseInt(row['Quantity'] || row['quantity'] || row['qty'] || '0');
        const purchaseRate = parseFloat(row['Purchase Rate'] || row['purchaseRate'] || row['rate'] || '0');
        const mrp = parseFloat(row['MRP'] || row['mrp'] || '0');

        if (!internalCode && !brandName) errors.push('Either Internal Code or Brand Name is required');
        if (!batchNumber) errors.push('Batch Number is required');
        if (!expiryDateStr) errors.push('Expiry Date is required');
        if (isNaN(quantity) || quantity <= 0) errors.push('Quantity must be greater than zero');
        if (isNaN(purchaseRate) || purchaseRate < 0) errors.push('Valid purchase rate is required');
        if (isNaN(mrp) || mrp < purchaseRate) errors.push('MRP must be greater than or equal to purchase rate');

        // Date validation
        const parsedDate = new Date(expiryDateStr);
        if (isNaN(parsedDate.getTime())) {
          errors.push('Invalid Expiry Date. Use YYYY-MM-DD or DD/MM/YYYY');
        } else if (parsedDate <= new Date()) {
          errors.push('Batch is already expired. Expired stock cannot be imported as live inventory.');
        }

        let matchedProduct = null;
        if (internalCode && productMap.has(internalCode.toLowerCase())) {
          matchedProduct = productMap.get(internalCode.toLowerCase());
        } else if (brandName) {
          matchedProduct = existingProducts.find((p) => p.brandName.toLowerCase() === brandName.toLowerCase());
        }

        if (!matchedProduct) {
          errors.push(`Medicine '${brandName || internalCode}' not found in catalogue. Please import into catalogue first.`);
        }

        const dedupKey = `${(matchedProduct?.id || brandName)}_${batchNumber.toLowerCase()}`;
        if (seenKeys.has(dedupKey)) {
          duplicateCount++;
          errors.push('Duplicate batch record within uploaded file');
        } else {
          seenKeys.add(dedupKey);
        }

        const processed = {
          rowIndex,
          medicineId: matchedProduct?.id,
          brandName: matchedProduct?.brandName || brandName,
          internalCode: matchedProduct?.internalCode || internalCode,
          batchNumber,
          expiryDate: parsedDate.toISOString ? parsedDate.toISOString() : expiryDateStr,
          quantity: isNaN(quantity) ? 0 : quantity,
          purchaseRate: isNaN(purchaseRate) ? 0 : purchaseRate,
          mrp: isNaN(mrp) ? 0 : mrp,
          status: errors.length > 0 ? 'ERROR' : 'READY',
          errors,
          warnings,
        };

        if (errors.length > 0) {
          errorCount++;
          errorRows.push(processed);
        } else {
          validCount++;
          estimatedStockUnits += processed.quantity;
        }
        validatedRows.push(processed);
      }
    });

    // Save Staging record in ImportJob table
    const importJob = await prisma.importJob.create({
      data: {
        branchId: targetBranchId,
        importType,
        fileName: req.file.originalname,
        status: 'STAGED',
        totalRows: rawRows.length,
        validRows: validCount,
        errorRows: errorCount,
        warningRows: warningCount,
        duplicateRows: duplicateCount,
        stagingData: JSON.stringify(validatedRows),
        errorDetails: JSON.stringify(errorRows),
        createdByUserId: req.user.id,
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: targetBranchId,
      action: 'BULK_IMPORT_STAGED',
      targetEntity: 'IMPORT_JOB',
      entityId: importJob.id,
      details: {
        fileName: req.file.originalname,
        totalRows: rawRows.length,
        validRows: validCount,
        errorRows: errorCount,
      },
      req,
    });

    return res.status(201).json({
      importId: importJob.id,
      fileName: req.file.originalname,
      importType,
      branchId: targetBranchId,
      summary: {
        totalRows: rawRows.length,
        validRows: validCount,
        errorRows: errorCount,
        warningRows: warningCount,
        duplicateRows: duplicateCount,
        estimatedStockUnits: importType === 'STOCK_RECEIPT' ? estimatedStockUnits : undefined,
      },
      previewRows: validatedRows.slice(0, 50), // Send first 50 rows for fast UI table preview
      hasMore: validatedRows.length > 50,
    });
  } catch (error: any) {
    console.error('Import preview error:', error);
    return res.status(500).json({ message: error.message || 'Failed to process import file' });
  }
};

export const getImportJob = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const job = await prisma.importJob.findUnique({
      where: { id },
      include: { branch: { select: { id: true, code: true, name: true } } },
    });

    if (!job) return res.status(404).json({ message: 'Import job not found' });

    let rows = [];
    if (job.stagingData) {
      try {
        rows = JSON.parse(job.stagingData);
      } catch (e) {}
    }

    return res.json({
      ...job,
      stagingData: undefined, // Don't send huge raw string
      rows: rows.slice(0, 100),
      totalRowsCount: rows.length,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch import job' });
  }
};

export const commitImportJob = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot confirm bulk imports' });
    }

    const id = req.params.id as string;
    const job = await prisma.importJob.findUnique({ where: { id } });

    if (!job) return res.status(404).json({ message: 'Import job not found' });

    if (job.status === 'COMMITTED') {
      return res.status(400).json({ message: 'This import job has already been committed.' });
    }

    if (!job.stagingData) {
      return res.status(400).json({ message: 'No staged data found to commit.' });
    }

    const stagedRows: any[] = JSON.parse(job.stagingData);
    const validRows = stagedRows.filter((r) => r.status === 'READY');

    if (validRows.length === 0) {
      return res.status(400).json({ message: 'There are no valid rows to commit.' });
    }

    let insertedCount = 0;

    await prisma.$transaction(async (tx) => {
      if (job.importType === 'CATALOGUE') {
        let codeCounter = await tx.medicineProduct.count();

        for (const row of validRows) {
          codeCounter++;
          const generatedCode = `MED-${String(codeCounter).padStart(4, '0')}`;

          await tx.medicineProduct.create({
            data: {
              internalCode: generatedCode,
              brandName: row.brandName,
              genericName: row.genericName,
              strength: row.strength,
              dosageForm: row.dosageForm,
              manufacturer: row.manufacturer,
              packSize: row.packSize,
              baseUnit: 'Strip',
              hsnCode: row.hsnCode || null,
              gstRate: row.gstRate,
              mrp: row.mrp,
              defaultPurchaseRate: row.defaultPurchaseRate || null,
              defaultSellingRate: row.defaultSellingRate || null,
              reorderLevel: row.reorderLevel || 10,
              barcode: row.barcode,
              prescriptionType: row.prescriptionType,
            },
          });
          insertedCount++;
        }
      } else {
        // STOCK_RECEIPT COMMIT
        for (const row of validRows) {
          // Check if batch exists
          let batch = await tx.stockBatch.findFirst({
            where: {
              branchId: job.branchId,
              medicineId: row.medicineId,
              batchNumber: row.batchNumber,
            },
          });

          if (batch) {
            batch = await tx.stockBatch.update({
              where: { id: batch.id },
              data: {
                quantityReceived: batch.quantityReceived + row.quantity,
                availableQuantity: batch.availableQuantity + row.quantity,
                purchaseRate: row.purchaseRate,
                mrp: row.mrp,
                sellingPrice: row.mrp,
                status: 'ACTIVE',
              },
            });
          } else {
            batch = await tx.stockBatch.create({
              data: {
                branchId: job.branchId,
                medicineId: row.medicineId,
                batchNumber: row.batchNumber,
                expiryDate: new Date(row.expiryDate),
                quantityReceived: row.quantity,
                availableQuantity: row.quantity,
                purchaseRate: row.purchaseRate,
                mrp: row.mrp,
                sellingPrice: row.mrp,
                purchaseInvoiceRef: `IMPORT-${job.id.substring(0, 8)}`,
                status: 'ACTIVE',
              },
            });
          }

          // Record stock movement
          await tx.stockMovement.create({
            data: {
              branchId: job.branchId,
              medicineId: row.medicineId,
              batchId: batch.id,
              movementType: 'PURCHASE_RECEIPT',
              quantityDelta: row.quantity,
              unitPrice: row.purchaseRate,
              referenceDocType: 'BULK_IMPORT',
              referenceDocId: job.id,
              reason: `Bulk stock receipt import: ${job.fileName}`,
              performedByUserId: req.user!.id,
            },
          });

          insertedCount++;
        }
      }

      // Mark job as committed
      await tx.importJob.update({
        where: { id: job.id },
        data: {
          status: 'COMMITTED',
          completedAt: new Date(),
        },
      });
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: job.branchId,
      action: 'BULK_IMPORT_COMMITTED',
      targetEntity: 'IMPORT_JOB',
      entityId: job.id,
      details: { committedRows: insertedCount, importType: job.importType },
      req,
    });

    return res.json({
      message: `Successfully committed ${insertedCount} ${job.importType === 'CATALOGUE' ? 'catalogue medicines' : 'stock batches'} to the database!`,
      committedRows: insertedCount,
    });
  } catch (error: any) {
    console.error('Commit error:', error);
    return res.status(500).json({ message: error.message || 'Failed to commit import' });
  }
};

export const downloadErrorRows = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const job = await prisma.importJob.findUnique({ where: { id } });

    if (!job || !job.errorDetails) {
      return res.status(404).json({ message: 'No error records found for this import job' });
    }

    const errors = JSON.parse(job.errorDetails);
    const flattenErrors = errors.map((r: any) => ({
      Row: r.rowIndex,
      Item: r.brandName || r.internalCode || '',
      Batch: r.batchNumber || '',
      Errors: r.errors ? r.errors.join('; ') : '',
    }));

    const worksheet = xlsx.utils.json_to_sheet(flattenErrors);
    const csvOutput = xlsx.utils.sheet_to_csv(worksheet);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="import_errors_${id}.csv"`);
    return res.send(csvOutput);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to download error file' });
  }
};

export const downloadTemplate = async (req: Request, res: Response) => {
  const { type } = req.params;

  let templateData: any[] = [];
  let fileName = 'template.csv';

  if (type === 'catalogue') {
    fileName = 'confidos_catalogue_template.csv';
    templateData = [
      {
        'Brand Name': 'Telma 20',
        'Generic Name': 'Telmisartan',
        'Strength': '20 mg',
        'Dosage Form': 'Tablet',
        'Manufacturer': 'Glenmark',
        'Pack Size': '15 Tablets',
        'HSN Code': '30049099',
        'GST Rate': 12,
        'MRP': 98.00,
        'Barcode': '8901117009999',
        'Prescription Type': 'Schedule H',
      },
    ];
  } else {
    fileName = 'confidos_stock_receipt_template.csv';
    templateData = [
      {
        'Internal Code': 'MED-001',
        'Brand Name': 'Dolo 650',
        'Batch Number': 'DL-2026-X1',
        'Expiry Date': '2027-12-31',
        'Quantity': 50,
        'Purchase Rate': 23.50,
        'MRP': 33.50,
      },
    ];
  }

  const worksheet = xlsx.utils.json_to_sheet(templateData);
  const csv = xlsx.utils.sheet_to_csv(worksheet);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.send(csv);
};
