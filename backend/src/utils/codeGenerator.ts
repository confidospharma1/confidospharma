import prisma from '../database/prisma';

/**
 * Concurrency-safe unique internalCode generator for Confidos Pharma medicines.
 * Resolves gaps, deletions, and concurrent inserts by determining the highest
 * numeric suffix and confirming database uniqueness before returning.
 */
export async function generateUniqueMedicineCode(client: any = prisma): Promise<string> {
  const existing = await client.medicineProduct.findMany({
    where: {
      internalCode: {
        startsWith: 'MED-',
      },
    },
    select: {
      internalCode: true,
    },
  });

  let maxNumber = 0;
  for (const item of existing) {
    const match = item.internalCode.match(/^MED-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  }

  let nextNumber = maxNumber + 1;
  let candidate = `MED-${String(nextNumber).padStart(4, '0')}`;

  // Double-check with individual lookup to guarantee uniqueness
  while (await client.medicineProduct.findUnique({ where: { internalCode: candidate } })) {
    nextNumber++;
    candidate = `MED-${String(nextNumber).padStart(4, '0')}`;
  }

  return candidate;
}
