import Decimal from 'decimal.js';

/**
 * Confidos Pharma Unit Conversion Engine (Phase 7 Specification)
 * 
 * Packaging Hierarchy:
 * - Box
 * - Strip
 * - Tablet / Capsule
 * - Sachet
 * - Packet
 * - Bottle
 */

export interface UnitDefinition {
  unit: string;
  multiplierToBase: number; // e.g. Box -> 100, Strip -> 10, Tablet -> 1
  isBaseUnit?: boolean;
  allowFractional?: boolean;
}

export interface ProductUnitConfig {
  baseUnit: string;        // e.g. "Tablet"
  packageUnit?: string;    // e.g. "Box"
  conversionFactor?: number; // e.g. 10 tablets per strip or 100 per box
  supportedUnits: UnitDefinition[];
}

/**
 * Standard unit configuration builder based on product dosage form and configuration
 */
export function buildProductUnitConfig(
  baseUnitInput?: string | null,
  packageUnitInput?: string | null,
  conversionFactorInput?: number | null,
  dosageForm?: string | null,
  customConfigJson?: string | null
): ProductUnitConfig {
  if (customConfigJson) {
    try {
      const parsed = JSON.parse(customConfigJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const base = parsed.find((u: any) => u.isBaseUnit) || parsed[parsed.length - 1];
        return {
          baseUnit: base.unit,
          packageUnit: parsed[0]?.unit || 'Box',
          conversionFactor: parsed[0]?.multiplierToBase || 10,
          supportedUnits: parsed,
        };
      }
    } catch {
      // Fallback to standard derivation
    }
  }

  const form = (dosageForm || '').toLowerCase();
  let baseUnit = baseUnitInput?.trim() || 'Tablet';
  const factor = conversionFactorInput && conversionFactorInput > 0 ? conversionFactorInput : 10;
  const pkgUnit = packageUnitInput?.trim() || 'Box';

  if (form.includes('syrup') || form.includes('suspension') || form.includes('liquid') || form.includes('drop')) {
    baseUnit = 'Bottle';
    return {
      baseUnit: 'Bottle',
      packageUnit: 'Box',
      conversionFactor: factor > 1 ? factor : 1,
      supportedUnits: [
        { unit: 'Box', multiplierToBase: factor > 1 ? factor : 1 },
        { unit: 'Bottle', multiplierToBase: 1, isBaseUnit: true },
      ],
    };
  }

  if (form.includes('sachet') || form.includes('powder')) {
    baseUnit = 'Sachet';
    return {
      baseUnit: 'Sachet',
      packageUnit: 'Box',
      conversionFactor: factor > 1 ? factor : 10,
      supportedUnits: [
        { unit: 'Box', multiplierToBase: factor > 1 ? factor : 10 },
        { unit: 'Sachet', multiplierToBase: 1, isBaseUnit: true },
      ],
    };
  }

  if (form.includes('capsule')) {
    baseUnit = 'Capsule';
    return {
      baseUnit: 'Capsule',
      packageUnit: pkgUnit,
      conversionFactor: factor,
      supportedUnits: [
        { unit: 'Box', multiplierToBase: factor * 10 },
        { unit: 'Strip', multiplierToBase: factor },
        { unit: 'Capsule', multiplierToBase: 1, isBaseUnit: true },
      ],
    };
  }

  // Default: Tablet / Strip / Box
  baseUnit = baseUnitInput?.toLowerCase() === 'strip' ? 'Tablet' : (baseUnitInput || 'Tablet');
  return {
    baseUnit,
    packageUnit: 'Box',
    conversionFactor: factor,
    supportedUnits: [
      { unit: 'Box', multiplierToBase: factor * 10 },
      { unit: 'Strip', multiplierToBase: factor },
      { unit: baseUnit, multiplierToBase: 1, isBaseUnit: true },
    ],
  };
}

/**
 * Convert quantity from a given unit to normalized base units
 */
export function convertToBaseQuantity(
  quantity: number,
  unitName: string,
  config: ProductUnitConfig
): { baseQuantity: number; factor: number } {
  if (quantity < 0) {
    throw new Error('Quantity cannot be negative');
  }

  const normUnit = unitName.trim().toLowerCase();
  const matched = config.supportedUnits.find(
    (u) => u.unit.toLowerCase() === normUnit
  );

  const factor = matched ? matched.multiplierToBase : 1;
  const baseQty = new Decimal(quantity).times(factor).toNumber();

  return { baseQuantity: Math.round(baseQty), factor };
}

/**
 * Convert a price entered for a given unit into an equivalent price per base unit
 */
export function convertPriceToBase(
  price: number,
  unitName: string,
  config: ProductUnitConfig
): number {
  if (price < 0) throw new Error('Price cannot be negative');

  const normUnit = unitName.trim().toLowerCase();
  const matched = config.supportedUnits.find(
    (u) => u.unit.toLowerCase() === normUnit
  );

  const factor = matched ? matched.multiplierToBase : 1;
  return new Decimal(price).dividedBy(factor).toDecimalPlaces(4).toNumber();
}

/**
 * Format quantity in human-readable packaging breakdown (e.g. "477 Tablets (47 Strips, 7 Tablets)")
 */
export function formatPackagingBreakdown(
  baseQuantity: number,
  config: ProductUnitConfig
): string {
  if (config.supportedUnits.length <= 1) {
    return `${baseQuantity} ${config.baseUnit}`;
  }

  // Find strip or intermediate unit if exists
  const stripUnit = config.supportedUnits.find((u) => u.unit.toLowerCase() === 'strip');
  if (stripUnit && stripUnit.multiplierToBase > 1) {
    const strips = Math.floor(baseQuantity / stripUnit.multiplierToBase);
    const remainingTablets = baseQuantity % stripUnit.multiplierToBase;
    if (strips > 0 && remainingTablets > 0) {
      return `${baseQuantity} ${config.baseUnit} (${strips} Strips, ${remainingTablets} ${config.baseUnit})`;
    } else if (strips > 0) {
      return `${baseQuantity} ${config.baseUnit} (${strips} Strips)`;
    }
  }

  return `${baseQuantity} ${config.baseUnit}`;
}

/**
 * Direct normalization helper for quantity * conversionFactor
 */
export function normalizeToBaseUnits(quantity: number, conversionFactor: number = 1): number {
  if (quantity < 0) throw new Error('Quantity cannot be negative');
  validateConversionHierarchy(conversionFactor);
  return new Decimal(quantity).times(conversionFactor).toNumber();
}

/**
 * Direct price normalization helper
 */
export function calculateEquivalentUnitPrice(price: number, unitsInPack: number = 1): number {
  if (price < 0) throw new Error('Price cannot be negative');
  validateConversionHierarchy(unitsInPack);
  return new Decimal(price).dividedBy(unitsInPack).toDecimalPlaces(4).toNumber();
}

/**
 * Validate that conversion factor is positive and non-zero
 */
export function validateConversionHierarchy(factor: number): boolean {
  if (typeof factor !== 'number' || isNaN(factor) || factor <= 0) {
    throw new Error('Conversion factor must be a valid number greater than 0');
  }
  return true;
}

/**
 * Decrement base stock safely, preventing negative stock unless explicitly allowed
 */
export function decrementBaseStock(
  currentBaseStock: number,
  deductQuantity: number,
  allowNegative: boolean = false
): number {
  if (deductQuantity < 0) throw new Error('Deduct quantity cannot be negative');
  const remaining = currentBaseStock - deductQuantity;
  if (!allowNegative && remaining < 0) {
    throw new Error(`Insufficient stock: Requested deduction of ${deductQuantity} exceeds available stock of ${currentBaseStock}.`);
  }
  return remaining;
}

