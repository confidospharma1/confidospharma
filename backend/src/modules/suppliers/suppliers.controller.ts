import { Request, Response } from 'express';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';

// Strict email format validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const getSuppliers = async (req: Request, res: Response) => {
  try {
    const { search, includeInactive } = req.query;

    const whereClause: any = {};
    if (includeInactive !== 'true') {
      whereClause.isActive = true;
    }

    if (search) {
      const q = (search as string).trim();
      whereClause.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { contactPerson: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { gstin: { contains: q, mode: 'insensitive' } },
      ];
    }

    const suppliers = await prisma.supplier.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            batches: true,
            purchases: true,
          },
        },
      },
    });
    return res.json(suppliers);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch suppliers' });
  }
};

export const getSupplierById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            batches: true,
            purchases: true,
            purchaseReturns: true,
          },
        },
      },
    });

    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    return res.json(supplier);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch supplier details' });
  }
};

export const createSupplier = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot create suppliers' });
    }

    const { name, contactPerson, phone, email, gstin, address, dlNumber } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({ message: 'Supplier phone number is required' });
    }

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email ? email.trim() : null;

    // Validate email format if provided
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({ message: 'Invalid supplier email address format. Please enter a valid email (e.g., supplier@pharma.com).' });
    }

    // Duplicate check: check if supplier with same name or phone already exists
    const existing = await prisma.supplier.findFirst({
      where: {
        OR: [
          { name: trimmedName },
          { phone: trimmedPhone },
        ],
      },
    });

    if (existing) {
      return res.status(409).json({
        message: `Supplier with name '${trimmedName}' or phone '${trimmedPhone}' already exists (ID: ${existing.id}).`,
        existingSupplier: existing,
      });
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: trimmedName,
        contactPerson: contactPerson ? contactPerson.trim() : null,
        phone: trimmedPhone,
        email: trimmedEmail,
        gstin: gstin ? gstin.toUpperCase().trim() : null,
        address: address ? address.trim() : null,
        dlNumber: dlNumber ? dlNumber.trim() : null,
        isActive: true,
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      action: 'SUPPLIER_CREATE',
      targetEntity: 'SUPPLIER',
      entityId: supplier.id,
      details: { name: supplier.name, email: supplier.email, phone: supplier.phone },
      req,
    });

    return res.status(201).json(supplier);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to create supplier' });
  }
};

export const updateSupplier = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'You do not have permission to modify this record. Please contact the Super Admin for assistance.' });
    }

    const id = req.params.id as string;
    const { name, contactPerson, phone, email, gstin, address, dlNumber, isActive } = req.body;

    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    const trimmedEmail = email !== undefined ? (email ? email.trim() : null) : undefined;
    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      return res.status(400).json({ message: 'Invalid supplier email address format. Please enter a valid email.' });
    }

    // Check duplicate name or phone if changing
    if (name || phone) {
      const duplicate = await prisma.supplier.findFirst({
        where: {
          id: { not: id },
          OR: [
            ...(name ? [{ name: name.trim() }] : []),
            ...(phone ? [{ phone: phone.trim() }] : []),
          ],
        },
      });
      if (duplicate) {
        return res.status(409).json({
          message: `Another supplier already exists with the name '${name}' or phone '${phone}'.`,
        });
      }
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(contactPerson !== undefined && { contactPerson: contactPerson ? contactPerson.trim() : null }),
        ...(phone && { phone: phone.trim() }),
        ...(trimmedEmail !== undefined && { email: trimmedEmail }),
        ...(gstin !== undefined && { gstin: gstin ? gstin.toUpperCase().trim() : null }),
        ...(address !== undefined && { address: address ? address.trim() : null }),
        ...(dlNumber !== undefined && { dlNumber: dlNumber ? dlNumber.trim() : null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      action: 'SUPPLIER_UPDATE',
      targetEntity: 'SUPPLIER',
      entityId: updated.id,
      details: { name: updated.name, email: updated.email, isActive: updated.isActive },
      req,
    });

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to update supplier' });
  }
};

export const deleteSupplier = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'You do not have permission to modify this record. Please contact the Super Admin for assistance.' });
    }

    const id = req.params.id as string;
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            batches: true,
            purchases: true,
            purchaseReturns: true,
          },
        },
      },
    });

    if (!supplier) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    const hasDependencies = (supplier._count.batches > 0) ||
      (supplier._count.purchases > 0) ||
      (supplier._count.purchaseReturns > 0);

    if (hasDependencies) {
      // Soft-delete (archive) to preserve relational integrity and financial audit history
      const archived = await prisma.supplier.update({
        where: { id },
        data: { isActive: false },
      });

      await logAuditEvent({
        userId: req.user.id,
        action: 'SUPPLIER_ARCHIVE',
        targetEntity: 'SUPPLIER',
        entityId: archived.id,
        details: {
          name: archived.name,
          reason: 'Archived due to existing purchase or batch history',
          batchesCount: supplier._count.batches,
          purchasesCount: supplier._count.purchases,
        },
        req,
      });

      return res.json({
        message: `Supplier '${supplier.name}' has been archived (deactivated) to preserve historical purchase invoices and inventory records.`,
        supplier: archived,
        archived: true,
      });
    }

    // Hard-delete if safe and no historical transactions exist
    await prisma.supplier.delete({ where: { id } });

    await logAuditEvent({
      userId: req.user.id,
      action: 'SUPPLIER_DELETE',
      targetEntity: 'SUPPLIER',
      entityId: id,
      details: { name: supplier.name },
      req,
    });

    return res.json({
      message: `Supplier '${supplier.name}' deleted permanently.`,
      deleted: true,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to delete supplier' });
  }
};

export const bulkDeleteSuppliers = async (req: Request, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Forbidden: Super Admin only' });
    }

    const rawIds = req.body.ids || req.body.supplierIds;
    if (!rawIds || !Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ message: 'No supplier IDs provided' });
    }

    const uniqueIds = Array.from(
      new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    );

    if (uniqueIds.length === 0) {
      return res.status(400).json({ message: 'No valid supplier IDs provided' });
    }

    const outcome = await prisma.$transaction(async (tx) => {
      const results = {
        deleted: [] as string[],
        archived: [] as string[],
        failed: [] as { id: string; reason: string }[],
      };

      for (const id of uniqueIds) {
        const supplier = await tx.supplier.findUnique({
          where: { id },
          include: {
            _count: {
              select: {
                purchases: true,
                batches: true,
                purchaseReturns: true,
                purchaseIndents: true,
              },
            },
          },
        });

        if (!supplier) {
          results.failed.push({ id, reason: 'Supplier not found' });
          continue;
        }

        const totalReferences =
          supplier._count.purchases +
          supplier._count.batches +
          supplier._count.purchaseReturns +
          supplier._count.purchaseIndents;

        if (totalReferences > 0) {
          // Safe archive to preserve ledger and audit trails
          await tx.supplier.update({
            where: { id },
            data: { isActive: false },
          });
          results.archived.push(supplier.name);
        } else {
          // Permanent delete when completely unreferenced
          await tx.supplier.delete({ where: { id } });
          results.deleted.push(supplier.name);
        }
      }

      return results;
    });

    await logAuditEvent({
      userId: req.user.id,
      action: 'SUPPLIER_BULK_DELETE',
      targetEntity: 'SUPPLIER',
      details: {
        totalRequested: uniqueIds.length,
        deletedCount: outcome.deleted.length,
        archivedCount: outcome.archived.length,
        failedCount: outcome.failed.length,
      },
      req,
    });

    const totalSuccess = outcome.deleted.length + outcome.archived.length;
    return res.json({
      message: `Processed ${totalSuccess} suppliers (${outcome.deleted.length} deleted, ${outcome.archived.length} safely archived)`,
      deleted: outcome.deleted,
      archived: outcome.archived,
      failed: outcome.failed,
      totalProcessed: totalSuccess,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Bulk delete failed' });
  }
};

