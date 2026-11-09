import { Request, Response } from 'express';
import * as xlsx from 'xlsx';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';
import {
  buildHeaderMapping,
  extractMappedRow,
  parseExpiryDate,
  parseCleanNumber,
  parseCleanInt,
  calculatePharmaRowUnitsAndPrices,
} from './imports.mapper';
import { extractOrPreserveStrength } from '../../utils/productMatcher';

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

    const branch = await prisma.branch.findUnique({
      where: { id: targetBranchId },
      select: { id: true, code: true, name: true },
    });
    if (!branch) {
      return res.status(400).json({ message: `Target branch with ID '${targetBranchId}' was not found.` });
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

    // Build header mapping & validate headers
    const rawHeaders = Object.keys(rawRows[0] || {});
    const { headerMap, duplicateHeaders, conflictingColumns } = buildHeaderMapping(rawHeaders, importType);

    if (duplicateHeaders.length > 0) {
      return res.status(400).json({
        message: `Duplicate column headers detected: ${duplicateHeaders.join('; ')}. Please ensure all column headers are unique.`,
      });
    }

    if (conflictingColumns.length > 0) {
      return res.status(400).json({
        message: `Conflicting column mappings detected: ${conflictingColumns.join('; ')}`,
      });
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
      const bName = (ep.brandName || '').toLowerCase();
      const gName = (ep.genericName || '').toLowerCase();
      const str = (ep.strength || '').toLowerCase();
      const dForm = (ep.dosageForm || '').toLowerCase();
      const key = `${bName}_${gName}_${str}_${dForm}`;
      productMap.set(key, ep);
      if (ep.internalCode) {
        productMap.set(ep.internalCode.toLowerCase(), ep);
      }
    }

    let estimatedStockUnits = 0;

    rawRows.forEach((row, index) => {
      const rowIndex = index + 2; // Accounting for 1-based header
      const mapped = extractMappedRow(row, headerMap);
      const pharma = calculatePharmaRowUnitsAndPrices(mapped);

      // Skip completely empty or trailing blank/formula rows
      if (!pharma.medicineName && !pharma.batchNumber) {
        return;
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      if (!pharma.medicineName) errors.push('Medicine Name is required');
      if (!pharma.batchNumber) errors.push('Batch Number is required');

      // Safe Date validation (no uncaught RangeError on invalid dates)
      const { date: parsedDate, isoString: parsedDateIso, error: dateError } = parseExpiryDate(pharma.expiryDate);
      if (dateError) {
        errors.push(dateError);
      } else if (parsedDate && parsedDate <= new Date()) {
        errors.push('Batch is already expired. Expired stock cannot be imported as live inventory.');
      }

      if (pharma.stripQuantityInBox <= 0) errors.push('Strip quantity in box must be greater than zero');
      if (pharma.stripUnitQuantity <= 0) errors.push('Strip unit quantity (tablets per strip) must be greater than zero');
      if (pharma.stripPurchasePrice < 0 || pharma.purchaseUnitPrice < 0) errors.push('Purchase price cannot be negative');
      if (pharma.stripMrpPrice < 0 || pharma.unitSellingPrice < 0) errors.push('MRP price cannot be negative');
      if (pharma.stripMrpPrice > 0 && pharma.stripPurchasePrice > pharma.stripMrpPrice) {
        warnings.push('Strip purchase price is higher than strip MRP price');
      }

      const rawStrength = (mapped.strength || 'Standard').toString().trim();
      const { genericName, strength } = extractOrPreserveStrength(pharma.medicineName, rawStrength);

      const dedupKey = `${pharma.medicineName.toLowerCase()}_${pharma.batchNumber.toLowerCase()}`;
      if (seenKeys.has(dedupKey)) {
        duplicateCount++;
        errors.push('Duplicate batch record within uploaded file');
      } else {
        seenKeys.add(dedupKey);
      }

      let matchedProduct = null;
      if (mapped.internalCode && productMap.has(String(mapped.internalCode).toLowerCase())) {
        matchedProduct = productMap.get(String(mapped.internalCode).toLowerCase());
      } else if (productMap.has(pharma.medicineName.toLowerCase())) {
        matchedProduct = productMap.get(pharma.medicineName.toLowerCase());
      } else {
        matchedProduct = existingProducts.find(
          (p) => (p.brandName || '').toLowerCase() === pharma.medicineName.toLowerCase()
        );
      }

      if (matchedProduct) {
        warnings.push('Medicine already exists in catalogue (batch stock will be added)');
        warningCount++;
      } else if (importType === 'STOCK_RECEIPT') {
        warnings.push('New medicine: will be registered into catalogue during stock import');
      }

      const processed = {
        rowIndex,
        medicineId: matchedProduct?.id,
        medicineName: pharma.medicineName,
        brandName: pharma.medicineName,
        genericName: genericName || pharma.medicineName,
        strength: strength || 'Standard',
        dosageForm: 'Tablet',
        manufacturer: pharma.manufacturer || 'Standard Pharma',
        packSize: `${pharma.stripQuantityInBox} Strips x ${pharma.stripUnitQuantity} Tablets`,
        hsnCode: pharma.hsnCode,
        batchNumber: pharma.batchNumber,
        expiryDate: parsedDateIso || pharma.expiryDate,
        stripQuantityInBox: pharma.stripQuantityInBox,
        stripUnitQuantity: pharma.stripUnitQuantity,
        totalUnits: pharma.totalUnits,
        pharmacyPhysicalUnits: pharma.pharmacyPhysicalUnits,
        stripPurchasePrice: pharma.stripPurchasePrice,
        stripMrpPrice: pharma.stripMrpPrice,
        purchaseUnitPrice: pharma.purchaseUnitPrice,
        unitSellingPrice: pharma.unitSellingPrice,
        quantity: pharma.pharmacyPhysicalUnits,
        purchaseRate: pharma.purchaseUnitPrice,
        mrp: pharma.stripMrpPrice,
        gstRate: parseCleanNumber(mapped.gstRate, 5),
        status: errors.length > 0 ? 'ERROR' : 'READY',
        errors,
        warnings,
      };

      if (errors.length > 0) {
        errorCount++;
        errorRows.push(processed);
      } else {
        validCount++;
        estimatedStockUnits += pharma.pharmacyPhysicalUnits;
      }
      validatedRows.push(processed);
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
      let codeCounter = await tx.medicineProduct.count();

      for (const row of validRows) {
        const stripUnitQty = row.stripUnitQuantity && row.stripUnitQuantity > 0 ? row.stripUnitQuantity : 10;
        const stripQtyInBox = row.stripQuantityInBox && row.stripQuantityInBox > 0 ? row.stripQuantityInBox : 1;
        const totalUnits = row.totalUnits || (stripQtyInBox * stripUnitQty);
        const physicalUnits = row.pharmacyPhysicalUnits !== undefined && row.pharmacyPhysicalUnits !== null ? row.pharmacyPhysicalUnits : totalUnits;
        const stripPPrice = row.stripPurchasePrice !== undefined && row.stripPurchasePrice !== null ? row.stripPurchasePrice : (row.purchaseRate || 0);
        const stripMPrice = row.stripMrpPrice !== undefined && row.stripMrpPrice !== null ? row.stripMrpPrice : (row.mrp || 0);
        const pUnitPrice = row.purchaseUnitPrice !== undefined && row.purchaseUnitPrice !== null ? row.purchaseUnitPrice : (stripUnitQty > 0 ? stripPPrice / stripUnitQty : stripPPrice);
        const uSellingPrice = row.unitSellingPrice !== undefined && row.unitSellingPrice !== null ? row.unitSellingPrice : (stripUnitQty > 0 ? stripMPrice / stripUnitQty : stripMPrice);

        const unitConfig = JSON.stringify({
          stripQuantityInBox: stripQtyInBox,
          stripUnitQuantity: stripUnitQty,
          totalUnits,
          pharmacyPhysicalUnits: physicalUnits,
          stripPurchasePrice: stripPPrice,
          stripMrpPrice: stripMPrice,
          purchaseUnitPrice: pUnitPrice,
          unitSellingPrice: uSellingPrice,
          supportedUnits: [
            { unit: 'Tablet', multiplierToBase: 1, isBaseUnit: true },
            { unit: 'Strip', multiplierToBase: stripUnitQty },
          ],
        });

        const effectiveMedicineName = row.medicineName || row.brandName || row.productName;

        let existingMed = await tx.medicineProduct.findFirst({
          where: {
            OR: [
              { brandName: { equals: effectiveMedicineName, mode: 'insensitive' } },
              ...(row.internalCode ? [{ internalCode: row.internalCode }] : []),
            ],
          },
        });

        if (existingMed) {
          existingMed = await tx.medicineProduct.update({
            where: { id: existingMed.id },
            data: {
              manufacturer: row.manufacturer || existingMed.manufacturer,
              packSize: `${stripQtyInBox} Strips x ${stripUnitQty} Tablets`,
              hsnCode: row.hsnCode || existingMed.hsnCode,
              gstRate: row.gstRate ?? existingMed.gstRate,
              mrp: stripMPrice,
              defaultPurchaseRate: stripPPrice,
              defaultSellingRate: stripMPrice,
              conversionFactor: stripUnitQty,
              packageUnit: 'Strip',
              baseUnit: 'Tablet',
              unitConfig,
            },
          });
        } else {
          let generatedCode = '';
          do {
            codeCounter++;
            generatedCode = `MED-${String(codeCounter).padStart(4, '0')}`;
          } while (await tx.medicineProduct.findUnique({ where: { internalCode: generatedCode } }));

          existingMed = await tx.medicineProduct.create({
            data: {
              internalCode: generatedCode,
              brandName: effectiveMedicineName,
              genericName: row.genericName || effectiveMedicineName,
              strength: row.strength || 'Standard',
              dosageForm: 'Tablet',
              manufacturer: row.manufacturer || 'Standard Pharma',
              packSize: `${stripQtyInBox} Strips x ${stripUnitQty} Tablets`,
              baseUnit: 'Tablet',
              packageUnit: 'Strip',
              conversionFactor: stripUnitQty,
              hsnCode: row.hsnCode || null,
              gstRate: row.gstRate || 5,
              mrp: stripMPrice,
              defaultPurchaseRate: stripPPrice,
              defaultSellingRate: stripMPrice,
              reorderLevel: row.reorderLevel || 10,
              barcode: row.barcode || null,
              prescriptionType: row.prescriptionType || 'OTC',
              unitConfig,
            },
          });
        }

        // If batch number is provided and physical stock > 0, create or update stock batch
        if (row.batchNumber && physicalUnits > 0) {
          let batch = await tx.stockBatch.findFirst({
            where: {
              branchId: job.branchId,
              medicineId: existingMed.id,
              batchNumber: row.batchNumber,
            },
          });

          if (batch) {
            batch = await tx.stockBatch.update({
              where: { id: batch.id },
              data: {
                quantityReceived: batch.quantityReceived + physicalUnits,
                availableQuantity: batch.availableQuantity + physicalUnits,
                purchaseRate: pUnitPrice,
                mrp: uSellingPrice,
                sellingPrice: uSellingPrice,
                status: 'ACTIVE',
              },
            });
          } else {
            batch = await tx.stockBatch.create({
              data: {
                branchId: job.branchId,
                medicineId: existingMed.id,
                batchNumber: row.batchNumber,
                expiryDate: new Date(row.expiryDate),
                quantityReceived: physicalUnits,
                availableQuantity: physicalUnits,
                purchaseRate: pUnitPrice,
                mrp: uSellingPrice,
                sellingPrice: uSellingPrice,
                purchaseInvoiceRef: `IMPORT-${job.id.substring(0, 8)}`,
                status: 'ACTIVE',
              },
            });
          }

          // Record stock movement
          await tx.stockMovement.create({
            data: {
              branchId: job.branchId,
              medicineId: existingMed.id,
              batchId: batch.id,
              movementType: 'PURCHASE_RECEIPT',
              quantityDelta: physicalUnits,
              unitPrice: pUnitPrice,
              referenceDocType: 'BULK_IMPORT',
              referenceDocId: job.id,
              reason: `Bulk ${job.importType} import: ${job.fileName}`,
              performedByUserId: req.user!.id,
            },
          });
        }

        insertedCount++;
      }

      // Mark job as committed
      await tx.importJob.update({
        where: { id: job.id },
        data: {
          status: 'COMMITTED',
          completedAt: new Date(),
        },
      });
    }, {
      maxWait: 10000,
      timeout: 30000,
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
  let fileName = type === 'catalogue' ? 'confidos_catalogue_template.csv' : 'confidos_stock_receipt_template.csv';

  templateData = [
    {
      'Medicine Name': 'Dolo 650',
      'Batch No': 'DL-2028-01',
      'Expiry Date': '2028-12-31',
      'HSN No': '30049099',
      'Manufacturer': 'Micro Labs Ltd',
      'STRIP QUANTITY IN THE BOX': 10,
      'STRIP UNIT QUANTITY': 10,
      'Total Units': 100,
      'pharmacy Physical Units': 100,
      'Strip Purchase Price': 10.00,
      'Strip MRP Price': 20.00,
      'Purchase Unit Price': 1.00,
      'unit Selling Price': 2.00,
    },
    {
      'Medicine Name': 'Augmentin 625 Duo',
      'Batch No': 'AUG-2028-B2',
      'Expiry Date': '2028-06-30',
      'HSN No': '30041010',
      'Manufacturer': 'GSK Pharma',
      'STRIP QUANTITY IN THE BOX': 20,
      'STRIP UNIT QUANTITY': 20,
      'Total Units': 400,
      'pharmacy Physical Units': 400,
      'Strip Purchase Price': 20.00,
      'Strip MRP Price': 40.00,
      'Purchase Unit Price': 1.00,
      'unit Selling Price': 2.00,
    },
  ];

  const worksheet = xlsx.utils.json_to_sheet(templateData);
  const csv = xlsx.utils.sheet_to_csv(worksheet);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.send(csv);
};
