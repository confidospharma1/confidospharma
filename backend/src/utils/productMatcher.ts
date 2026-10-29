/**
 * Product Matcher Engine for Confidos Pharma (Phase 6 Specification)
 * 
 * Priority Rules:
 * 1. Internal Product Code (exact match)
 * 2. Exact match on normalized Brand Name + Strength + Dosage Form
 * 3. Strong match on Brand Name + Strength + Dosage Form + Manufacturer
 * 4. Distinct product safety: Incompatible strengths (e.g. "Dolo 650" vs "Dolo 500")
 *    or dosage forms (e.g. "Tablet" vs "Syrup") must NEVER be merged!
 * 5. Suggest candidate matches for user confirmation when similarity is high but not identical.
 */

export interface CandidateProduct {
  id: string;
  internalCode?: string;
  productCode?: string;
  brandName: string;
  genericName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  manufacturer?: string | null;
  mrp?: number;
  hsnCode?: string | null;
  gstRate?: number;
  baseUnit?: string;
  packageUnit?: string | null;
  conversionFactor?: number | null;
}

export interface MatchResult {
  isMatch: boolean;
  matchedProduct: CandidateProduct | null;
  matchType: 'EXACT_CODE' | 'EXACT_IDENTITY' | 'STRONG_ATTRIBUTES' | 'POTENTIAL_SUGGESTION' | 'NONE';
  confidence: number; // 0 to 1
  isNewProduct: boolean;
  notes?: string;
  potentialCandidates?: CandidateProduct[];
  candidates: CandidateProduct[];
}

export function normalizeMedicineName(name?: string | null): string {
  return normalizeString(name);
}

export function areStrengthsCompatible(s1?: string | null, s2?: string | null): boolean {
  if (!s1 || !s2) return false;
  const clean1 = s1.replace(/\s+/g, '').toLowerCase();
  const clean2 = s2.replace(/\s+/g, '').toLowerCase();
  return clean1 === clean2;
}

/**
 * Safely extracts or preserves strength from a combined Generic / Active Ingredient input
 * while ensuring full user-entered generic formulation is preserved and the database
 * strength column is non-empty.
 */
export function extractOrPreserveStrength(
  genericName?: string | null,
  explicitStrength?: string | null
): { genericName: string; strength: string } {
  const cleanGeneric = genericName ? genericName.trim() : '';

  // 1. If an explicit strength was supplied (e.g. from legacy payload, CSV column, or test), prioritize it
  if (explicitStrength && explicitStrength.trim()) {
    return { genericName: cleanGeneric, strength: explicitStrength.trim() };
  }

  // 2. Look for standard pharmaceutical potency patterns at the end of the generic string
  // Matches e.g. "650 mg", "650mg", "500 mcg", "10 ml", "5 %", "200 IU", "500mg/5ml", "1g", "0.5mg"
  const potencyRegex = /(?:[\s,/(-]+)(\d+(?:\.\d+)?\s*(?:mg|g|mcg|µg|ml|l|iu|ui|%|w\/v|w\/w|v\/v)(?:\s*(?:\/|\+)\s*\d+(?:\.\d+)?\s*(?:mg|g|mcg|µg|ml|l|iu|ui|%|w\/v|w\/w|v\/v)*)*\)?)$/i;
  const match = cleanGeneric.match(potencyRegex);

  if (match && match[1]) {
    const extracted = match[1].replace(/[()]/g, '').trim();
    if (extracted) {
      return {
        genericName: cleanGeneric,
        strength: extracted,
      };
    }
  }

  // 3. Fallback: If no distinct strength pattern could be isolated, use 'Standard'
  return {
    genericName: cleanGeneric,
    strength: 'Standard',
  };
}

export function normalizeString(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s\+\-\/\%]/g, '') // remove non-standard punctuation but retain +, -, %, /
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate Levenshtein similarity between two normalized strings (0.0 to 1.0)
 */
export function calculateSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1.0;

  const d: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = d[len1][len2];
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Match a line item against the catalogue of existing products
 */
export function matchProduct(
  query: {
    internalCode?: string | null;
    productCode?: string | null;
    brandName: string;
    productName?: string | null;
    genericName?: string | null;
    strength?: string | null;
    dosageForm?: string | null;
    manufacturer?: string | null;
  },
  catalogue: CandidateProduct[]
): MatchResult {
  const normCode = normalizeString(query.productCode || query.internalCode);
  const normBrand = normalizeString(query.brandName);
  const normProduct = normalizeString(query.productName);
  const normGen = normalizeString(query.genericName);
  const normStrength = normalizeString(query.strength);
  const normForm = normalizeString(query.dosageForm || 'Tablet');
  const normMfg = normalizeString(query.manufacturer);

  // 1. Match by Internal Code (Highest Priority)
  if (normCode) {
    const codeMatch = catalogue.find(
      (p) => normalizeString(p.productCode || p.internalCode) === normCode
    );
    if (codeMatch) {
      return {
        isMatch: true,
        matchedProduct: codeMatch,
        matchType: 'EXACT_CODE',
        confidence: 1.0,
        isNewProduct: false,
        notes: `Matched exactly by internal code ${codeMatch.productCode || codeMatch.internalCode}`,
        candidates: [],
        potentialCandidates: [],
      };
    }
  }

  // 2. Exact match on Brand Name / Product Name + Strength + Dosage Form
  for (const prod of catalogue) {
    const pBrand = normalizeString(prod.brandName);
    const pStrength = normalizeString(prod.strength);
    const pForm = normalizeString(prod.dosageForm);

    const matchesName = (pBrand === normBrand) || (normProduct !== '' && pBrand === normProduct);
    if (matchesName) {
      // Check if strengths or forms are materially incompatible
      if (normStrength && pStrength && !areStrengthsCompatible(normStrength, pStrength)) {
        // "Dolo 650" vs "Dolo 500" - INCOMPATIBLE DIFFERENCE!
        continue;
      }
      if (normForm && pForm && normForm !== pForm) {
        // "Tablet" vs "Syrup" - INCOMPATIBLE DIFFERENCE!
        continue;
      }

      // If strength and form match (or query didn't specify strength and catalogue has matching name)
      if ((!normStrength || areStrengthsCompatible(normStrength, pStrength)) && (!normForm || normForm === pForm)) {
        return {
          isMatch: true,
          matchedProduct: prod,
          matchType: 'EXACT_IDENTITY',
          confidence: 1.0,
          isNewProduct: false,
          notes: `Existing catalogue product: ${prod.brandName} (${prod.strength} ${prod.dosageForm})`,
          candidates: [],
          potentialCandidates: [],
        };
      }
    }
  }

  // 3. Strong match on Generic + Strength + Dosage Form + Brand similarity
  for (const prod of catalogue) {
    const pBrand = normalizeString(prod.brandName);
    const pStrength = normalizeString(prod.strength);
    const pForm = normalizeString(prod.dosageForm);

    const brandSim = Math.max(
      calculateSimilarity(normBrand, pBrand),
      normProduct ? calculateSimilarity(normProduct, pBrand) : 0
    );
    const sameStrength = !normStrength || !pStrength || normStrength === pStrength;
    const sameForm = !normForm || !pForm || normForm === pForm;

    if (brandSim >= 0.90 && sameStrength && sameForm) {
      return {
        isMatch: true,
        matchedProduct: prod,
        matchType: 'STRONG_ATTRIBUTES',
        confidence: 0.95,
        isNewProduct: false,
        notes: `Matched catalogue product: ${prod.brandName} (${prod.strength})`,
        candidates: [],
        potentialCandidates: [],
      };
    }
  }

  // 4. Candidate suggestions (Fuzzy match > 0.75 on brand, or same generic & strength)
  const suggestions: CandidateProduct[] = [];
  for (const prod of catalogue) {
    const pBrand = normalizeString(prod.brandName);
    const pStrength = normalizeString(prod.strength);
    const pForm = normalizeString(prod.dosageForm);

    const brandSim = Math.max(
      calculateSimilarity(normBrand, pBrand),
      normProduct ? calculateSimilarity(normProduct, pBrand) : 0
    );
    const sameForm = !normForm || !pForm || normForm === pForm;

    if (brandSim >= 0.75 && sameForm) {
      suggestions.push(prod);
    }
  }

  if (suggestions.length > 0) {
    return {
      isMatch: false,
      matchedProduct: null,
      matchType: 'POTENTIAL_SUGGESTION',
      confidence: 0.5,
      isNewProduct: true,
      notes: `Uncertain match: ${suggestions.length} candidate(s) found. Registering as new product unless verified.`,
      candidates: suggestions.slice(0, 3),
      potentialCandidates: suggestions.slice(0, 3),
    };
  }

  return {
    isMatch: false,
    matchedProduct: null,
    matchType: 'NONE',
    confidence: 0,
    isNewProduct: true,
    notes: 'New medicine product (will be registered in catalogue upon purchase confirmation)',
    candidates: [],
    potentialCandidates: [],
  };
}
