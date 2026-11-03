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
 * Standard unit configuration builder based on product dosage form, packaging, and configuration
 */
export function buildProductUnitConfig(
  baseUnitInput?: string | null,
  packageUnitInput?: string | null,
  conversionFactorInput?: number | null,
  dosageForm?: string | null,
  customConfigJson?: string | null,
  packSizeInput?: string | null
): ProductUnitConfig {
  if (customConfigJson) {
    try {
      const parsed = JSON.parse(customConfigJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const base = parsed.find((u: any) => u.isBaseUnit) || parsed[0];
        return {
          baseUnit: base.unit,
          packageUnit: parsed[parsed.length - 1]?.unit || 'Box',
          conversionFactor: parsed[parsed.length - 1]?.multiplierToBase || 10,
          supportedUnits: parsed,
        };
      }
    } catch {
      // Fallback to standard derivation
    }
  }

  const form = (dosageForm || '').toLowerCase();
  const pkgUnit = (packageUnitInput || 'Box').trim();
  const factor = conversionFactorInput && conversionFactorInput > 0 ? conversionFactorInput : 10;
  const rawBase = (baseUnitInput || '').trim();
  const packSizeStr = (packSizeInput || '').toLowerCase();

  // 1. Syrups, Suspensions, Liquids, Drops, Solutions
  if (
    form.includes('syrup') ||
    form.includes('suspension') ||
    form.includes('liquid') ||
    form.includes('drop') ||
    form.includes('solution') ||
    form.includes('elixir') ||
    form.includes('lotion') ||
    form.includes('oil')
  ) {
    if (rawBase.toLowerCase() === 'ml' || packSizeStr.includes('ml')) {
      let bottleMultiplier = factor > 1 ? factor : 100;
      const mlMatch = packSizeStr.match(/(\d+)\s*ml/i);
      if (mlMatch) {
        const parsed = parseInt(mlMatch[1], 10);
        if (parsed > 0) bottleMultiplier = parsed;
      }

      const units: UnitDefinition[] = [
        { unit: 'ml', multiplierToBase: 1, isBaseUnit: true },
        { unit: 'Bottle', multiplierToBase: bottleMultiplier },
      ];
      if (pkgUnit.toLowerCase() === 'box' && factor > 1) {
        units.push({ unit: 'Box', multiplierToBase: factor * bottleMultiplier });
      }
      return {
        baseUnit: 'ml',
        packageUnit: pkgUnit,
        conversionFactor: bottleMultiplier,
        supportedUnits: units,
      };
    }

    // Default liquid: Bottle is base unit
    const units: UnitDefinition[] = [
      { unit: 'Bottle', multiplierToBase: 1, isBaseUnit: true },
    ];
    if (pkgUnit.toLowerCase() === 'box' && factor > 1) {
      units.push({ unit: 'Box', multiplierToBase: factor });
    }
    return {
      baseUnit: 'Bottle',
      packageUnit: pkgUnit,
      conversionFactor: factor > 1 ? factor : 1,
      supportedUnits: units,
    };
  }

  // 2. Sachets / Powders
  if (form.includes('sachet') || form.includes('powder')) {
    const units: UnitDefinition[] = [
      { unit: 'Sachet', multiplierToBase: 1, isBaseUnit: true },
    ];
    if (pkgUnit.toLowerCase() === 'box' || factor > 1) {
      units.push({ unit: 'Box', multiplierToBase: factor > 1 ? factor : 10 });
    }
    return {
      baseUnit: 'Sachet',
      packageUnit: pkgUnit,
      conversionFactor: factor > 1 ? factor : 10,
      supportedUnits: units,
    };
  }

  // 3. Injections / Infusions
  if (form.includes('injection') || form.includes('infusion')) {
    const singleUnit = rawBase.toLowerCase() === 'ampoule' ? 'Ampoule' : 'Vial';
    const units: UnitDefinition[] = [
      { unit: singleUnit, multiplierToBase: 1, isBaseUnit: true },
    ];
    if (pkgUnit.toLowerCase() === 'box' || factor > 1) {
      units.push({ unit: 'Box', multiplierToBase: factor > 1 ? factor : 10 });
    }
    return {
      baseUnit: singleUnit,
      packageUnit: pkgUnit,
      conversionFactor: factor > 1 ? factor : 10,
      supportedUnits: units,
    };
  }

  // 4. Creams, Ointments, Gels
  if (form.includes('cream') || form.includes('ointment') || form.includes('gel')) {
    const units: UnitDefinition[] = [
      { unit: 'Tube', multiplierToBase: 1, isBaseUnit: true },
    ];
    if (pkgUnit.toLowerCase() === 'box' || factor > 1) {
      units.push({ unit: 'Box', multiplierToBase: factor > 1 ? factor : 10 });
    }
    return {
      baseUnit: 'Tube',
      packageUnit: pkgUnit,
      conversionFactor: factor > 1 ? factor : 10,
      supportedUnits: units,
    };
  }

  // 5. Tablets, Capsules, and general solid oral dosage forms
  const isCapsule = form.includes('capsule') || rawBase.toLowerCase() === 'capsule';
  const singleUnit = isCapsule ? 'Capsule' : 'Tablet';

  // Check if Bottle packaging is supported for this medicine
  const isBottlePackage = pkgUnit.toLowerCase() === 'bottle';
  const isBottleBase = rawBase.toLowerCase() === 'bottle';
  const hasBottleInPack = packSizeStr.includes('bottle');
  const supportsBottle = isBottlePackage || isBottleBase || hasBottleInPack;

  let bottleMultiplier = 0;
  if (supportsBottle) {
    if (isBottlePackage && factor > 0) {
      bottleMultiplier = factor;
    } else {
      const bottleMatch = packSizeStr.match(/(\d+)\s*(tablets?|capsules?|tabs?|caps?|units?)?/i);
      if (bottleMatch) {
        const parsed = parseInt(bottleMatch[1], 10);
        if (parsed > 0) bottleMultiplier = parsed;
      }
      if (bottleMultiplier <= 0 && factor > 0) {
        bottleMultiplier = factor;
      }
    }
  }

  // Check if Strip packaging is supported
  const hasStripInPack = packSizeStr.includes('strip');
  const isStripBase = rawBase.toLowerCase() === 'strip';
  const isStripPackage = pkgUnit.toLowerCase() === 'strip';
  const supportsStrip =
    hasStripInPack ||
    isStripBase ||
    isStripPackage ||
    (!supportsBottle && pkgUnit.toLowerCase() !== 'bottle');

  let stripMultiplier = 0;
  if (supportsStrip) {
    const tabMatch = packSizeStr.match(/(\d+)\s*(tablets?|capsules?|tabs?|caps?)/i);
    if (tabMatch && !hasStripInPack) {
      const parsed = parseInt(tabMatch[1], 10);
      if (parsed > 1) stripMultiplier = parsed;
    }
    if (stripMultiplier <= 0) {
      if (pkgUnit.toLowerCase() === 'box' && factor >= 10) {
        stripMultiplier = factor % 10 === 0 ? 10 : factor;
      } else {
        stripMultiplier = factor > 1 ? factor : 10;
      }
    }
  }

  // Check if Box packaging is supported
  const isBox =
    pkgUnit.toLowerCase() === 'box' ||
    pkgUnit.toLowerCase() === 'pack' ||
    pkgUnit.toLowerCase() === 'carton' ||
    packSizeStr.includes('box');

  let boxMultiplier = 0;
  if (isBox) {
    if (stripMultiplier > 1) {
      boxMultiplier = factor >= stripMultiplier ? factor : factor * stripMultiplier;
    } else if (bottleMultiplier > 0) {
      boxMultiplier = factor > bottleMultiplier ? factor : factor * bottleMultiplier;
    } else {
      boxMultiplier = factor > 1 ? factor : 100;
    }
  }

  const supportedUnits: UnitDefinition[] = [
    { unit: singleUnit, multiplierToBase: 1, isBaseUnit: true },
  ];

  if (supportsStrip && stripMultiplier > 1) {
    supportedUnits.push({ unit: 'Strip', multiplierToBase: stripMultiplier });
  }

  if (supportsBottle && bottleMultiplier > 0) {
    supportedUnits.push({ unit: 'Bottle', multiplierToBase: bottleMultiplier });
  }

  if (isBox && boxMultiplier > 1 && boxMultiplier !== stripMultiplier && boxMultiplier !== bottleMultiplier) {
    supportedUnits.push({ unit: 'Box', multiplierToBase: boxMultiplier });
  }

  return {
    baseUnit: singleUnit,
    packageUnit: pkgUnit,
    conversionFactor: factor,
    supportedUnits,
  };
}

/**
 * Predictable default-unit selection function respecting product dosage form and supported units
 */
export function determineDefaultSellingUnit(
  supportedUnits: UnitDefinition[],
  product: {
    dosageForm?: string | null;
    baseUnit?: string | null;
    packageUnit?: string | null;
    packSize?: string | null;
  }
): string {
  if (!supportedUnits || supportedUnits.length === 0) return 'Unit';

  const form = (product.dosageForm || '').toLowerCase();
  const base = (product.baseUnit || '').toLowerCase();

  // 1. Tablet medicines -> default to Tablet
  if (form.includes('tablet') || base === 'tablet') {
    const tabletUnit = supportedUnits.find((u) => u.unit.toLowerCase() === 'tablet');
    if (tabletUnit) return tabletUnit.unit;
  }

  // 2. Capsule medicines -> default to Capsule
  if (form.includes('capsule') || base === 'capsule') {
    const capsuleUnit = supportedUnits.find((u) => u.unit.toLowerCase() === 'capsule');
    if (capsuleUnit) return capsuleUnit.unit;
  }

  // 3. Liquid / Syrup medicines -> default to ml if ml base, otherwise Bottle
  if (
    form.includes('syrup') ||
    form.includes('suspension') ||
    form.includes('liquid') ||
    form.includes('drop') ||
    form.includes('solution') ||
    form.includes('elixir') ||
    form.includes('lotion') ||
    form.includes('oil')
  ) {
    if (base === 'ml') {
      const mlUnit = supportedUnits.find((u) => u.unit.toLowerCase() === 'ml');
      if (mlUnit) return mlUnit.unit;
    }
    const bottleUnit = supportedUnits.find((u) => u.unit.toLowerCase() === 'bottle');
    if (bottleUnit) return bottleUnit.unit;
  }

  // 4. Match explicitly configured baseUnit if present in supportedUnits
  if (product.baseUnit) {
    const matchedBase = supportedUnits.find(
      (u) => u.unit.toLowerCase() === product.baseUnit!.trim().toLowerCase()
    );
    if (matchedBase) return matchedBase.unit;
  }

  // 5. Look for unit flagged as base unit (multiplier === 1)
  const baseUnitDef = supportedUnits.find((u) => u.isBaseUnit || u.multiplierToBase === 1);
  if (baseUnitDef) return baseUnitDef.unit;

  // 6. Fallback to first supported unit
  return supportedUnits[0].unit;
}

/**
 * Calculate the selling price or MRP for a specific target unit given base unit price
 */
export function calculatePriceForUnit(
  basePrice: number,
  unitName: string,
  config: ProductUnitConfig
): number {
  if (basePrice < 0) throw new Error('Base price cannot be negative');
  const normUnit = unitName.trim().toLowerCase();
  const matched = config.supportedUnits.find(
    (u) => u.unit.toLowerCase() === normUnit
  );
  const factor = matched ? matched.multiplierToBase : 1;
  return new Decimal(basePrice).times(factor).toDecimalPlaces(2).toNumber();
}

/**
 * Calculate effective base purchase cost before tax
 */
export function calculateEffectiveBaseCost(
  grossPaidAmount: number,
  discountAmount: number,
  totalBaseUnitsReceived: number
): number {
  if (totalBaseUnitsReceived <= 0) throw new Error('Total base units must be greater than zero');
  const netPaid = new Decimal(grossPaidAmount).minus(discountAmount || 0);
  return netPaid.dividedBy(totalBaseUnitsReceived).toDecimalPlaces(4).toNumber();
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
  return `${baseQuantity} ${config.baseUnit || 'Tablets'}`;
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

