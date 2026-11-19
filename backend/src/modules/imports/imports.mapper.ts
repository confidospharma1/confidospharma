/**
 * Header Normalization, Alias Resolution, and Safe Parsing Layer for Confidos Pharma Bulk Import
 */

export interface HeaderMappingResult {
  headerMap: Map<string, string>; // normalizedKey -> internalField
  duplicateHeaders: string[];
  conflictingColumns: string[];
}

export function cleanHeaderString(header: string): string {
  if (!header) return '';
  return header
    .replace(/^\uFEFF/, '') // Strip UTF-8 BOM
    .trim();
}

export function normalizeHeaderKey(header: string): string {
  return cleanHeaderString(header)
    .toLowerCase()
    .replace(/[\-_]+/g, ' ') // convert underscores and hyphens to spaces
    .replace(/\s+/g, ' ')   // collapse multiple spaces
    .trim();
}

// Catalogue canonical fields and aliases
export const CATALOGUE_FIELD_ALIASES: Record<string, string[]> = {
  medicineName: [
    'medicine name',
    'medicinename',
    'medicine',
    'brand name',
    'brandname',
    'brand',
    'product name',
    'productname',
    'product',
    'item name',
    'itemname',
    'item',
  ],
  brandName: [
    'brand name',
    'brandname',
    'brand',
    'medicine name',
    'medicinename',
  ],
  productName: [
    'product name',
    'productname',
    'product',
    'item name',
    'itemname',
    'item',
  ],
  genericName: [
    'generic name',
    'genericname',
    'generic',
    'salt',
    'composition',
    'active ingredient',
    'generic composition',
  ],
  strength: ['strength', 'potency', 'dosage', 'dose', 'power'],
  dosageForm: ['dosage form', 'dosageform', 'form', 'formulation', 'type'],
  manufacturer: ['manufacturer', 'mfg', 'company', 'brand owner', 'make', 'producer'],
  packSize: ['pack size', 'packsize', 'pack', 'packaging', 'packing'],
  hsnCode: ['hsn number', 'hsn no', 'hsnno', 'hsn code', 'hsncode', 'hsn', 'hsn/sac', 'hsn sac'],
  gstRate: ['gst rate', 'gstrate', 'gst', 'gst %', 'tax rate', 'tax', 'tax %'],
  mrp: ['mrp', 'maximum retail price', 'retail price', 'retail price (mrp)', 'price', 'unit mrp'],
  defaultPurchaseRate: [
    'default purchase rate',
    'default purchaserate',
    'purchase rate',
    'purchaserate',
    'cost price',
    'cost rate',
    'purchase price',
    'unit rate',
    'purchase_rate',
    'rate',
  ],
  defaultSellingRate: [
    'default selling rate',
    'default sellingrate',
    'selling rate',
    'sellingrate',
    'sales rate',
    'sale rate',
  ],
  reorderLevel: ['reorder level', 'reorderlevel', 'min stock', 'minimum stock', 'reorder qty'],
  barcode: ['barcode', 'upc', 'ean', 'gtin', 'code128'],
  prescriptionType: [
    'prescription type',
    'prescriptiontype',
    'schedule',
    'rx type',
    'rx',
    'drug schedule',
    'category',
  ],
  quantity: ['quantity', 'qty', 'units', 'stock', 'opening stock', 'initial quantity', 'initial stock'],
  freeQuantity: ['free quantity', 'freequantity', 'free qty', 'freeqty', 'free discount quantity', 'bonus qty', 'free'],
  batchNumber: ['batch number', 'batchnumber', 'batch', 'batch no', 'batchno', 'batch no.', 'lot', 'lot no', 'lot number'],
  expiryDate: ['expiry date', 'expirydate', 'expiry', 'exp date', 'expdate', 'exp dt', 'exp', 'batch expiry date'],

  // New Confidos Pharma Strip & Tablet Standard Format
  stripQuantityInBox: [
    'strip quantity in the box',
    'strip quantity in box',
    'strip qty in the box',
    'strip qty in box',
    'strip quantity',
    'strip qty',
    'strips per box',
    'strips in box',
    'strips in the box',
    'box strip quantity',
    'box quantity',
    'box qty',
  ],
  stripUnitQuantity: [
    'strip unit quantity',
    'strip unit qty',
    'strip unit',
    'tablets per strip',
    'units per strip',
    'strip size',
    'strip tablet quantity',
    'strip units',
    'strip packing',
    'strip pack',
  ],
  totalUnits: [
    'total units',
    'total unit',
    'total units (tablets)',
    'total tablets',
    'total quantity',
    'total qty',
    'total units in box',
    'units total',
  ],
  pharmacyPhysicalUnits: [
    'pharmacy physical units',
    'pharmacy physical unit',
    'physical units',
    'physical unit',
    'pharmacy units',
    'pharmacy physical stock',
    'physical stock',
    'physical quantity',
  ],
  stripPurchasePrice: [
    'strip purchase price',
    'strip purchase rate',
    'purchase strip price',
    'strip p rate',
    'strip p.rate',
    'strip cost price',
    'strip cost',
    'purchase rate per strip',
    'purchase rate (strip)',
  ],
  stripMrpPrice: [
    'strip mrp price',
    'strip mrp rate',
    'strip mrp',
    'mrp strip price',
    'mrp strip',
    'mrp per strip',
    'strip retail price',
    'mrp (strip)',
  ],
  purchaseUnitPrice: [
    'purchase unit price',
    'purchase unit rate',
    'unit purchase price',
    'unit purchase rate',
    'purchase rate per tablet',
    'purchase rate per unit',
    'cost per tablet',
    'p unit price',
    'p unit rate',
    'purchase unit cost',
  ],
  unitSellingPrice: [
    'unit selling price',
    'unit selling rate',
    'selling unit price',
    'selling unit rate',
    'selling price per tablet',
    'selling price per unit',
    'unit mrp price',
    'unit mrp',
    'mrp per tablet',
    'mrp per unit',
    'selling rate per tablet',
    'selling rate per unit',
  ],
};

// Stock Receipt canonical fields and aliases
const STOCK_RECEIPT_FIELD_ALIASES: Record<string, string[]> = {
  internalCode: [
    'internal code',
    'internalcode',
    'product code',
    'productcode',
    'medicine code',
    'medicinecode',
    'item code',
    'itemcode',
    'code',
    'sku',
  ],
  productName: [
    'product name',
    'productname',
    'product',
    'item name',
    'itemname',
    'item',
  ],
  brandName: [
    'brand name',
    'brandname',
    'brand',
    'medicine name',
    'medicinename',
    'medicine',
  ],
  batchNumber: [
    'batch number',
    'batchnumber',
    'batch',
    'batch no',
    'batchno',
    'batch no.',
    'lot',
    'lot number',
    'lotnumber',
    'lot no',
  ],
  expiryDate: [
    'expiry date',
    'expirydate',
    'expiry',
    'exp date',
    'expdate',
    'exp dt',
    'exp',
  ],
  quantity: [
    'quantity',
    'qty',
    'units',
    'stock',
    'received qty',
    'received quantity',
    'received_qty',
    'pack quantity',
  ],
  purchaseRate: [
    'purchase rate',
    'purchaserate',
    'cost price',
    'cost rate',
    'purchase price',
    'unit cost',
    'unit rate',
    'rate',
    'purchase_rate',
  ],
  mrp: [
    'mrp',
    'maximum retail price',
    'retail price',
    'selling price',
    'price',
    'unit mrp',
  ],
  manufacturer: ['manufacturer', 'mfg', 'company', 'brand owner', 'make', 'producer'],
  hsnCode: ['hsn number', 'hsn no', 'hsnno', 'hsn code', 'hsncode', 'hsn', 'hsn/sac', 'hsn sac'],
  stripQuantityInBox: [
    'strip quantity in the box',
    'strip quantity in box',
    'strip qty in the box',
    'strip qty in box',
    'strip quantity',
    'strip qty',
    'strips per box',
    'strips in box',
    'strips in the box',
    'box strip quantity',
    'box quantity',
    'box qty',
  ],
  stripUnitQuantity: [
    'strip unit quantity',
    'strip unit qty',
    'strip unit',
    'tablets per strip',
    'units per strip',
    'strip size',
    'strip tablet quantity',
    'strip units',
    'strip packing',
    'strip pack',
  ],
  totalUnits: [
    'total units',
    'total unit',
    'total units (tablets)',
    'total tablets',
    'total quantity',
    'total qty',
    'total units in box',
    'units total',
  ],
  pharmacyPhysicalUnits: [
    'pharmacy physical units',
    'pharmacy physical unit',
    'physical units',
    'physical unit',
    'pharmacy units',
    'pharmacy physical stock',
    'physical stock',
    'physical quantity',
  ],
  stripPurchasePrice: [
    'strip purchase price',
    'strip purchase rate',
    'purchase strip price',
    'strip p rate',
    'strip p.rate',
    'strip cost price',
    'strip cost',
    'purchase rate per strip',
    'purchase rate (strip)',
  ],
  stripMrpPrice: [
    'strip mrp price',
    'strip mrp rate',
    'strip mrp',
    'mrp strip price',
    'mrp strip',
    'mrp per strip',
    'strip retail price',
    'mrp (strip)',
  ],
  purchaseUnitPrice: [
    'purchase unit price',
    'purchase unit rate',
    'unit purchase price',
    'unit purchase rate',
    'purchase rate per tablet',
    'purchase rate per unit',
    'cost per tablet',
    'p unit price',
    'p unit rate',
    'purchase unit cost',
  ],
  unitSellingPrice: [
    'unit selling price',
    'unit selling rate',
    'selling unit price',
    'selling unit rate',
    'selling price per tablet',
    'selling price per unit',
    'unit mrp price',
    'unit mrp',
    'mrp per tablet',
    'mrp per unit',
    'selling rate per tablet',
    'selling rate per unit',
  ],
};

// Purchase Invoice canonical fields and aliases (Phase 4 Specification)
const PURCHASE_INVOICE_FIELD_ALIASES: Record<string, string[]> = {
  productName: [
    'product name', 'productname', 'product',
    'medicine name', 'medicinename', 'medicine',
    'item name', 'itemname', 'item',
  ],
  brandName: [
    'brand name', 'brandname', 'brand',
    'medicine name', 'medicinename', 'medicine',
  ],
  genericName: [
    'generic name', 'genericname', 'generic',
    'salt', 'composition', 'active ingredient',
  ],
  strength: ['strength', 'potency', 'dose', 'power'],
  dosageForm: ['dosage form', 'dosageform', 'form', 'formulation', 'type'],
  manufacturer: ['manufacturer', 'mfg', 'company', 'make', 'producer', 'brand owner'],
  hsnCode: ['hsn number', 'hsn no', 'hsnno', 'hsn code', 'hsncode', 'hsn', 'hsn/sac', 'hsn sac'],
  batchNumber: [
    'batch number', 'batchnumber', 'batch', 'batch no', 'batchno', 'batch no.',
    'lot', 'lot number', 'lot no',
  ],
  expiryDate: [
    'expiry date', 'expirydate', 'expiry', 'exp date', 'expdate', 'exp dt', 'exp',
  ],
  purchaseUnit: ['purchase unit', 'purchaseunit', 'unit', 'pack unit', 'packaging unit', 'p unit'],
  quantity: [
    'quantity', 'qty', 'units', 'purchase quantity', 'purchased qty', 'received qty', 'box qty', 'strip qty',
  ],
  freeQuantity: [
    'free quantity', 'freequantity', 'free qty', 'freeqty', 'scheme qty', 'scheme', 'free', 'bonus qty',
  ],
  unitsPerPack: [
    'units per pack', 'unitsperpack', 'pack size', 'packsize', 'conversion factor', 'conversion', 'pack',
  ],
  purchaseRate: [
    'purchase rate', 'purchaserate', 'cost price', 'cost rate', 'purchase price', 'p rate', 'p.rate', 'unit cost', 'rate', 'purchase_rate',
  ],
  sellingRate: [
    'selling rate', 'sellingrate', 'selling price', 'sale rate', 'sales rate', 's rate',
  ],
  mrp: ['mrp', 'maximum retail price', 'retail price', 'retail price (mrp)', 'price', 'unit mrp'],
  gstRate: ['gst rate', 'gstrate', 'gst', 'gst %', 'tax rate', 'tax', 'tax %'],
  discountPercent: ['discount', 'discount %', 'disc %', 'discount percent', 'disc percent', 'disc', 'scheme discount'],
  sellingUnit: ['selling unit', 'sellingunit', 'base unit', 'sale unit'],
  barcode: ['barcode', 'upc', 'ean', 'gtin', 'code128'],
  prescriptionType: ['category', 'prescription type', 'prescriptiontype', 'schedule', 'rx type', 'drug schedule'],

  // New Confidos Pharma Strip & Tablet Standard Format
  stripQuantityInBox: [
    'strip quantity in the box',
    'strip quantity in box',
    'strip qty in the box',
    'strip qty in box',
    'strip quantity',
    'strip qty',
    'strips per box',
    'strips in box',
    'strips in the box',
    'box strip quantity',
    'box quantity',
    'box qty',
  ],
  stripUnitQuantity: [
    'strip unit quantity',
    'strip unit qty',
    'strip unit',
    'tablets per strip',
    'units per strip',
    'strip size',
    'strip tablet quantity',
    'strip units',
    'strip packing',
    'strip pack',
  ],
  totalUnits: [
    'total units',
    'total unit',
    'total units (tablets)',
    'total tablets',
    'total quantity',
    'total qty',
    'total units in box',
    'units total',
  ],
  pharmacyPhysicalUnits: [
    'pharmacy physical units',
    'pharmacy physical unit',
    'physical units',
    'physical unit',
    'pharmacy units',
    'pharmacy physical stock',
    'physical stock',
    'physical quantity',
  ],
  stripPurchasePrice: [
    'strip purchase price',
    'strip purchase rate',
    'purchase strip price',
    'strip p rate',
    'strip p.rate',
    'strip cost price',
    'strip cost',
    'purchase rate per strip',
    'purchase rate (strip)',
  ],
  stripMrpPrice: [
    'strip mrp price',
    'strip mrp rate',
    'strip mrp',
    'mrp strip price',
    'mrp strip',
    'mrp per strip',
    'strip retail price',
    'mrp (strip)',
  ],
  purchaseUnitPrice: [
    'purchase unit price',
    'purchase unit rate',
    'unit purchase price',
    'unit purchase rate',
    'purchase rate per tablet',
    'purchase rate per unit',
    'cost per tablet',
    'p unit price',
    'p unit rate',
    'purchase unit cost',
  ],
  unitSellingPrice: [
    'unit selling price',
    'unit selling rate',
    'selling unit price',
    'selling unit rate',
    'selling price per tablet',
    'selling price per unit',
    'unit mrp price',
    'unit mrp',
    'mrp per tablet',
    'mrp per unit',
    'selling rate per tablet',
    'selling rate per unit',
  ],
};

/**
 * Build mapping from raw spreadsheet column headers to canonical internal fields
 */
export function buildHeaderMapping(
  rawHeaders: string[],
  importType: 'CATALOGUE' | 'STOCK_RECEIPT' | 'PURCHASE_INVOICE'
): HeaderMappingResult {
  let aliasDefinitions = CATALOGUE_FIELD_ALIASES;
  if (importType === 'STOCK_RECEIPT') {
    aliasDefinitions = STOCK_RECEIPT_FIELD_ALIASES;
  } else if (importType === 'PURCHASE_INVOICE') {
    aliasDefinitions = PURCHASE_INVOICE_FIELD_ALIASES;
  }

  const headerMap = new Map<string, string>(); // rawKey -> internalField
  const seenNormalized = new Map<string, string>(); // normKey -> rawHeader
  const duplicateHeaders: string[] = [];
  const fieldToRawHeaders = new Map<string, string[]>(); // internalField -> [rawHeader1, rawHeader2]

  // Step 1: Detect raw / normalized header duplicates & skip reference/formula columns
  for (const rawCol of rawHeaders) {
    const cleaned = cleanHeaderString(rawCol);
    if (!cleaned) continue;

    const norm = normalizeHeaderKey(cleaned);

    // Skip formula descriptions, reference notes, and extra calculation headers
    if (
      norm.startsWith('formula') ||
      norm.includes('formula of') ||
      norm.includes('strip purchase price /') ||
      norm.includes('strip mrp price /') ||
      norm.includes('reference only') ||
      norm.includes('reference for')
    ) {
      continue;
    }

    if (seenNormalized.has(norm)) {
      duplicateHeaders.push(`"${rawCol}" conflicts with "${seenNormalized.get(norm)}"`);
    } else {
      seenNormalized.set(norm, rawCol);
    }
  }

  // Step 2: Special disambiguation for Catalogue if file contains BOTH 'medicine_name' and 'brand'
  // When both 'medicine_name' and 'brand' are provided, 'medicine_name' is the trade medicine name
  // and 'brand' is the marketing company/manufacturer (e.g., 'Paracetamol 500 mg Tablet' by 'Demo Pharma').
  const normKeysInFile = Array.from(seenNormalized.keys());
  const hasMedicineName = normKeysInFile.includes('medicine name');
  const hasBrand = normKeysInFile.includes('brand');
  const hasManufacturer = normKeysInFile.some((k) =>
    ['manufacturer', 'mfg', 'company'].includes(k)
  );

  // Step 3: Match each column to internal fields
  for (const [normKey, rawCol] of seenNormalized.entries()) {
    // If Catalogue and file has both 'medicine name' and 'brand':
    if (importType === 'CATALOGUE' && hasMedicineName && hasBrand) {
      if (normKey === 'medicine name') {
        headerMap.set(rawCol, 'brandName');
        const list = fieldToRawHeaders.get('brandName') || [];
        list.push(rawCol);
        fieldToRawHeaders.set('brandName', list);
        continue;
      }
      if (normKey === 'brand' && !hasManufacturer) {
        headerMap.set(rawCol, 'manufacturer');
        const list = fieldToRawHeaders.get('manufacturer') || [];
        list.push(rawCol);
        fieldToRawHeaders.set('manufacturer', list);
        continue;
      }
    }

    // Default alias matching
    let matchedField: string | null = null;
    for (const [field, aliases] of Object.entries(aliasDefinitions)) {
      if (aliases.includes(normKey)) {
        matchedField = field;
        break;
      }
    }

    if (matchedField) {
      headerMap.set(rawCol, matchedField);
      const list = fieldToRawHeaders.get(matchedField) || [];
      list.push(rawCol);
      fieldToRawHeaders.set(matchedField, list);
    }
  }

  // Step 4: Detect ambiguous column mappings (where two different headers map to the same field)
  const conflictingColumns: string[] = [];
  for (const [field, rawCols] of fieldToRawHeaders.entries()) {
    if (rawCols.length > 1) {
      conflictingColumns.push(
        `Columns ${rawCols.map((c) => `"${c}"`).join(' and ')} both map to '${field}'. Please provide only one.`
      );
    }
  }

  return { headerMap, duplicateHeaders, conflictingColumns };
}

/**
 * Extract canonical fields from a raw row object using the headerMap
 */
export function extractMappedRow(
  rawRow: Record<string, any>,
  headerMap: Map<string, string>
): Record<string, any> {
  const extracted: Record<string, any> = {};

  for (const [rawCol, internalField] of headerMap.entries()) {
    if (rawRow.hasOwnProperty(rawCol)) {
      const val = rawRow[rawCol];
      // Clean string values
      if (typeof val === 'string') {
        extracted[internalField] = val.trim();
      } else {
        extracted[internalField] = val;
      }
    }
  }

  return extracted;
}

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Robust, exception-free Date Parser
 * Handles:
 * - Separators: '.', '/', '-' (e.g. 30-12-2026, 30.12.2026, 30/12/2026, 30.02.2028)
 * - Forgiving calendar day clamping for pharma invoices (e.g. 30.02.2028 or 31.04.2028 clamps to month end)
 * - Indian / UK format: DD-MM-YYYY, DD.MM.YYYY, DD/MM/YYYY
 * - ISO Strings: YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD
 * - Short year: DD-MM-YY, DD.MM.YY, DD/MM/YY
 * - Named months: 30-FEB-2028, FEB-2028, Feb 2028, February 2028
 * - Month/Year: MM/YYYY, MM.YYYY, MM-YYYY (set to end of month)
 * - Year/Month: YYYY-MM, YYYY.MM, YYYY/MM (set to end of month)
 * - Month/Short Year: MM/YY, MM.YY, MM-YY (set to end of month)
 * - Excel serial dates (numeric or 5-digit string, e.g. 45657)
 * - JS Date objects
 */
export function parseExpiryDate(raw: any): {
  date: Date | null;
  isoString: string | null;
  error: string | null;
} {
  if (raw === undefined || raw === null || raw === '') {
    return { date: null, isoString: null, error: 'Expiry Date is required' };
  }

  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) {
      return {
        date: null,
        isoString: null,
        error: 'Invalid Expiry Date. Use DD-MM-YYYY, DD.MM.YYYY, DD/MM/YYYY, or YYYY-MM-DD',
      };
    }
    return { date: raw, isoString: raw.toISOString(), error: null };
  }

  // Handle numeric Excel serial date (e.g. 45657)
  if (typeof raw === 'number' && !isNaN(raw)) {
    if (raw >= 25569 && raw <= 100000) {
      const utcDays = raw - 25569;
      const utcMs = Math.round(utcDays * 86400 * 1000);
      const date = new Date(utcMs);
      if (!isNaN(date.getTime())) {
        return { date, isoString: date.toISOString(), error: null };
      }
    }
  }

  let str = String(raw).trim();
  if (!str) {
    return { date: null, isoString: null, error: 'Expiry Date is required' };
  }

  // Strip common label prefixes like "EXP:", "Exp Date:"
  str = str.replace(/^(exp|expiry|exp\s*date|expiry\s*date)[:\s]*/i, '').trim();

  // Strip trailing time e.g. " 00:00:00" or "T00:00:00.000Z"
  const timeMatch = str.match(/^(.*?)[T\s]+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (timeMatch && timeMatch[1]) {
    str = timeMatch[1].trim();
  }

  // Normalize whitespace around separators: e.g. "30 / 12 / 2026" -> "30/12/2026"
  str = str.replace(/\s*([\/\.\-])\s*/g, '$1');

  // 1. Check if numeric Excel serial date in string form (e.g. 40000 to 70000)
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const serial = parseFloat(str);
    if (serial >= 25569 && serial <= 100000) {
      const utcDays = serial - 25569;
      const utcMs = Math.round(utcDays * 86400 * 1000);
      const date = new Date(utcMs);
      if (!isNaN(date.getTime())) {
        return { date, isoString: date.toISOString(), error: null };
      }
    }
  }

  // 2. Check DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY (e.g. 30.02.2028, 30-12-2026, 30.12.2026, 30/12/2026)
  const dmyMatch = str.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    let day = p1;
    let month = p2;
    if (p1 > 12 && p2 <= 12) {
      day = p1;
      month = p2;
    } else if (p1 <= 12 && p2 > 12) {
      day = p2;
      month = p1;
    }

    if (month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      // Forgiving day clamping: in pharma, e.g. 30.02.2028 means end of February 2028!
      const maxDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const validDay = Math.min(Math.max(1, day), maxDays);
      const date = new Date(Date.UTC(year, month - 1, validDay));
      return { date, isoString: date.toISOString(), error: null };
    }
    return { date: null, isoString: null, error: 'Invalid calendar date values for DD/MM/YYYY' };
  }

  // 3. Check YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD (e.g. 2026-12-30, 2028.02.30, 2026/12/30)
  const ymdMatch = str.match(/^(\d{4})[\/\.\-](\d{1,2})[\/\.\-](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    if (month >= 1 && month <= 12 && year >= 1900 && year <= 2100) {
      const maxDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const validDay = Math.min(Math.max(1, day), maxDays);
      const date = new Date(Date.UTC(year, month - 1, validDay));
      return { date, isoString: date.toISOString(), error: null };
    }
    return { date: null, isoString: null, error: 'Invalid calendar date values for YYYY-MM-DD' };
  }

  // 4. Check DD/MM/YY, DD.MM.YY, DD-MM-YY (e.g. 30.02.28, 30.12.26, 30/12/26, 30-12-26)
  const dmy2Match = str.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2})$/);
  if (dmy2Match) {
    const p1 = parseInt(dmy2Match[1], 10);
    const p2 = parseInt(dmy2Match[2], 10);
    const year = 2000 + parseInt(dmy2Match[3], 10);
    let day = p1;
    let month = p2;
    if (p1 > 12 && p2 <= 12) {
      day = p1;
      month = p2;
    } else if (p1 <= 12 && p2 > 12) {
      day = p2;
      month = p1;
    }

    if (month >= 1 && month <= 12) {
      const maxDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const validDay = Math.min(Math.max(1, day), maxDays);
      const date = new Date(Date.UTC(year, month - 1, validDay));
      return { date, isoString: date.toISOString(), error: null };
    }
    return { date: null, isoString: null, error: 'Invalid calendar date values for DD/MM/YY' };
  }

  // 5. Named month with day: e.g. "30-FEB-2028", "30.FEB.2028", "28 Feb 2028", "30-Feb-28"
  const namedDmyMatch = str.match(/^(\d{1,2})[\/\.\-\s]+([a-zA-Z]{3,9})[\/\.\-\s]+(\d{2,4})$/);
  if (namedDmyMatch) {
    const day = parseInt(namedDmyMatch[1], 10);
    const mStr = namedDmyMatch[2].toLowerCase();
    const month = MONTH_NAME_MAP[mStr] || MONTH_NAME_MAP[mStr.slice(0, 3)];
    let year = parseInt(namedDmyMatch[3], 10);
    if (namedDmyMatch[3].length === 2) year += 2000;
    if (month && year >= 1900 && year <= 2100) {
      const maxDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const validDay = Math.min(Math.max(1, day), maxDays);
      const date = new Date(Date.UTC(year, month - 1, validDay));
      return { date, isoString: date.toISOString(), error: null };
    }
  }

  // 6. Named month without day: e.g. "FEB-2028", "FEB.2028", "FEB/2028", "FEB 2028", "FEB-28", "FEBRUARY 2028"
  const namedMyMatch = str.match(/^([a-zA-Z]{3,9})[\/\.\-\s]+(\d{2,4})$/);
  if (namedMyMatch) {
    const mStr = namedMyMatch[1].toLowerCase();
    const month = MONTH_NAME_MAP[mStr] || MONTH_NAME_MAP[mStr.slice(0, 3)];
    let year = parseInt(namedMyMatch[2], 10);
    if (namedMyMatch[2].length === 2) year += 2000;
    if (month && year >= 1900 && year <= 2100) {
      const date = new Date(Date.UTC(year, month, 0, 23, 59, 59));
      return { date, isoString: date.toISOString(), error: null };
    }
  }

  // 7. Check MM/YYYY, MM.YYYY, MM-YYYY (e.g. 12/2026, 12.2026, 12-2026, 02.2028)
  const myMatch = str.match(/^(\d{1,2})[\/\.\-](\d{4})$/);
  if (myMatch) {
    const month = parseInt(myMatch[1], 10);
    const year = parseInt(myMatch[2], 10);
    if (month >= 1 && month <= 12) {
      // Set to last day of the expiry month in UTC
      const date = new Date(Date.UTC(year, month, 0, 23, 59, 59));
      return { date, isoString: date.toISOString(), error: null };
    }
  }

  // 8. Check YYYY-MM, YYYY.MM, YYYY/MM (e.g. 2026-12, 2026.12, 2026/12)
  const ymMatch = str.match(/^(\d{4})[\/\.\-](\d{1,2})$/);
  if (ymMatch) {
    const year = parseInt(ymMatch[1], 10);
    const month = parseInt(ymMatch[2], 10);
    if (month >= 1 && month <= 12) {
      const date = new Date(Date.UTC(year, month, 0, 23, 59, 59));
      return { date, isoString: date.toISOString(), error: null };
    }
  }

  // 9. Check MM/YY, MM.YY, MM-YY (e.g. 12/26, 12.26, 12-26, 02/28)
  const my2Match = str.match(/^(\d{1,2})[\/\.\-](\d{2})$/);
  if (my2Match) {
    const month = parseInt(my2Match[1], 10);
    const year = 2000 + parseInt(my2Match[2], 10);
    if (month >= 1 && month <= 12) {
      const date = new Date(Date.UTC(year, month, 0, 23, 59, 59));
      return { date, isoString: date.toISOString(), error: null };
    }
  }

  // 10. Standard ISO or standard Date parsing
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return { date: parsed, isoString: parsed.toISOString(), error: null };
  }

  return {
    date: null,
    isoString: null,
    error: 'Invalid Expiry Date. Use DD-MM-YYYY, DD.MM.YYYY, DD/MM/YYYY, or YYYY-MM-DD',
  };
}

/**
 * Safely parse numeric fields, stripping currency symbols, commas, and whitespace
 */
export function parseCleanNumber(raw: any, fallback = NaN): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'number') return isNaN(raw) ? fallback : raw;

  const cleaned = String(raw)
    .replace(/[₹$,\s]/g, '')
    .trim();

  if (!cleaned) return fallback;
  const num = parseFloat(cleaned);
  return isNaN(num) ? fallback : num;
}

/**
 * Safely parse integer fields
 */
export function parseCleanInt(raw: any, fallback = NaN): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'number') return isNaN(raw) ? fallback : Math.floor(raw);

  const cleaned = String(raw)
    .replace(/[,\s]/g, '')
    .trim();

  if (!cleaned) return fallback;
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? fallback : num;
}

/**
 * Check if Product Name and Brand Name in the same row are compatible or conflicting
 */
export function areProductAndBrandCompatible(
  productName?: string | null,
  brandName?: string | null
): boolean {
  const p = (productName || '').trim();
  const b = (brandName || '').trim();
  if (!p || !b) return true; // If one is empty, no conflict

  const pNorm = p.toLowerCase().replace(/[\W_]+/g, ' ').trim();
  const bNorm = b.toLowerCase().replace(/[\W_]+/g, ' ').trim();
  if (pNorm === bNorm) return true;

  // Substring / containment check (e.g. "Dolo 650 Tablet" contains "Dolo 650", "Dolo" in "Dolo 650")
  if (pNorm.includes(bNorm) || bNorm.includes(pNorm)) return true;

  // Token overlap check (e.g. "Benadryl Cough Syrup" and "Benadryl Cough Formula")
  const pTokens = pNorm.split(/\s+/).filter((t) => t.length > 2);
  const bTokens = bNorm.split(/\s+/).filter((t) => t.length > 2);
  const common = pTokens.filter((t) => bTokens.includes(t));
  if (common.length > 0) return true;

  // Fallback: character n-gram / similarity check (minimum 45% similarity)
  const getBigrams = (str: string) => {
    const s = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) s.add(str.substring(i, i + 2));
    return s;
  };
  const b1 = getBigrams(pNorm);
  const b2 = getBigrams(bNorm);
  let intersection = 0;
  for (const bg of b1) if (b2.has(bg)) intersection++;
  const dice = (2 * intersection) / (b1.size + b2.size || 1);
  return dice >= 0.45;
}

/**
 * Explicit canonical resolution of Product Name and Brand Name
 */
export function resolveProductAndBrandNames(
  rawProductName?: string | null,
  rawBrandName?: string | null
): {
  effectiveBrandName: string;
  effectiveProductName: string;
  isCompatible: boolean;
  warning?: string;
  error?: string;
} {
  const p = (rawProductName || '').toString().trim();
  const b = (rawBrandName || '').toString().trim();

  if (!p && !b) {
    return {
      effectiveBrandName: '',
      effectiveProductName: '',
      isCompatible: false,
      error: 'Product / Brand Name is required',
    };
  }

  // Only one present
  if (!p && b) {
    return {
      effectiveBrandName: b,
      effectiveProductName: b,
      isCompatible: true,
    };
  }

  if (p && !b) {
    return {
      effectiveBrandName: p,
      effectiveProductName: p,
      isCompatible: true,
    };
  }

  // Both present
  const isCompatible = areProductAndBrandCompatible(p, b);
  if (!isCompatible) {
    return {
      effectiveBrandName: b,
      effectiveProductName: p,
      isCompatible: false,
      error: `Conflicting product identity: Product Name '${p}' and Brand Name '${b}' represent different medicines.`,
    };
  }

  let warning: string | undefined;
  if (p.toLowerCase() !== b.toLowerCase()) {
    warning = `Note: Product Name '${p}' and Brand Name '${b}' differ slightly. Both are preserved.`;
  }

  const effectiveBrandName = b || p;
  const effectiveProductName = p || b;

  return {
    effectiveBrandName,
    effectiveProductName,
    isCompatible: true,
    warning,
  };
}

export interface PharmaProcessedRow {
  medicineName: string;
  brandName: string;
  batchNumber: string;
  expiryDate: string;
  hsnCode: string | null;
  manufacturer: string;
  stripQuantityInBox: number;
  stripUnitQuantity: number;
  totalUnits: number;
  pharmacyPhysicalUnits: number;
  stripPurchasePrice: number;
  stripMrpPrice: number;
  purchaseUnitPrice: number;
  unitSellingPrice: number;
}

/**
 * Standard calculation of units, prices, and physical inventory for Confidos Pharma Excel Format
 */
export function calculatePharmaRowUnitsAndPrices(mapped: Record<string, any>): PharmaProcessedRow {
  const medicineName = (
    mapped.medicineName ||
    mapped.brandName ||
    mapped.productName ||
    ''
  ).toString().trim();

  const batchNumber = (mapped.batchNumber || '').toString().trim();
  const expiryDate = mapped.expiryDate !== undefined && mapped.expiryDate !== null
    ? (mapped.expiryDate instanceof Date ? mapped.expiryDate.toISOString() : String(mapped.expiryDate).trim())
    : '';
  const hsnCode = (mapped.hsnCode || mapped.hsnNumber || '').toString().trim() || null;
  const manufacturer = (mapped.manufacturer || '').toString().trim() || 'Standard Pharma';

  // Strip quantities
  const stripQtyInBoxRaw = parseCleanInt(mapped.stripQuantityInBox, NaN);
  const stripUnitQtyRaw = parseCleanInt(mapped.stripUnitQuantity, NaN);

  // If one of them is provided or fallbacks:
  let stripQuantityInBox = !isNaN(stripQtyInBoxRaw) && stripQtyInBoxRaw > 0 ? stripQtyInBoxRaw : 1;
  let stripUnitQuantity = !isNaN(stripUnitQtyRaw) && stripUnitQtyRaw > 0 ? stripUnitQtyRaw : 10;

  // Total Units (Column H: Strip Quantity in Box * Strip Unit Quantity)
  let totalUnits = parseCleanInt(mapped.totalUnits, NaN);
  if (isNaN(totalUnits) || totalUnits <= 0) {
    totalUnits = stripQuantityInBox * stripUnitQuantity;
  }

  // Pharmacy Physical Units (Column I): initially same as Total Units
  let pharmacyPhysicalUnits = parseCleanInt(mapped.pharmacyPhysicalUnits, NaN);
  if (isNaN(pharmacyPhysicalUnits) || pharmacyPhysicalUnits <= 0) {
    pharmacyPhysicalUnits = totalUnits;
  }

  // Prices
  let stripPurchasePrice = parseCleanNumber(mapped.stripPurchasePrice, NaN);
  let stripMrpPrice = parseCleanNumber(mapped.stripMrpPrice, NaN);
  let purchaseUnitPrice = parseCleanNumber(mapped.purchaseUnitPrice, NaN);
  let unitSellingPrice = parseCleanNumber(mapped.unitSellingPrice, NaN);

  // Strip Purchase Price & Purchase Unit Price
  if (!isNaN(stripPurchasePrice) && stripPurchasePrice >= 0) {
    if (isNaN(purchaseUnitPrice) || purchaseUnitPrice <= 0) {
      purchaseUnitPrice = stripUnitQuantity > 0 ? Number((stripPurchasePrice / stripUnitQuantity).toFixed(4)) : stripPurchasePrice;
    }
  } else if (!isNaN(purchaseUnitPrice) && purchaseUnitPrice >= 0) {
    stripPurchasePrice = Number((purchaseUnitPrice * stripUnitQuantity).toFixed(2));
  } else {
    // If fallback purchase rate is mapped:
    const fallbackP = parseCleanNumber(mapped.purchaseRate, NaN);
    if (!isNaN(fallbackP) && fallbackP >= 0) {
      stripPurchasePrice = fallbackP;
      purchaseUnitPrice = stripUnitQuantity > 0 ? Number((fallbackP / stripUnitQuantity).toFixed(4)) : fallbackP;
    } else {
      stripPurchasePrice = 0;
      purchaseUnitPrice = 0;
    }
  }

  // Strip MRP Price & Unit Selling Price
  if (!isNaN(stripMrpPrice) && stripMrpPrice >= 0) {
    if (isNaN(unitSellingPrice) || unitSellingPrice <= 0) {
      unitSellingPrice = stripUnitQuantity > 0 ? Number((stripMrpPrice / stripUnitQuantity).toFixed(4)) : stripMrpPrice;
    }
  } else if (!isNaN(unitSellingPrice) && unitSellingPrice >= 0) {
    stripMrpPrice = Number((unitSellingPrice * stripUnitQuantity).toFixed(2));
  } else {
    // If fallback mrp is mapped:
    const fallbackM = parseCleanNumber(mapped.mrp, NaN);
    if (!isNaN(fallbackM) && fallbackM >= 0) {
      stripMrpPrice = fallbackM;
      unitSellingPrice = stripUnitQuantity > 0 ? Number((fallbackM / stripUnitQuantity).toFixed(4)) : fallbackM;
    } else {
      stripMrpPrice = 0;
      unitSellingPrice = 0;
    }
  }

  return {
    medicineName,
    brandName: medicineName,
    batchNumber,
    expiryDate,
    hsnCode,
    manufacturer,
    stripQuantityInBox,
    stripUnitQuantity,
    totalUnits,
    pharmacyPhysicalUnits,
    stripPurchasePrice,
    stripMrpPrice,
    purchaseUnitPrice,
    unitSellingPrice,
  };
}

