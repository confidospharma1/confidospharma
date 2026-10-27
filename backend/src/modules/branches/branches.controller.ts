import { Request, Response } from 'express';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';

export const getBranches = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'SUPER_ADMIN') {
      const branches = await prisma.branch.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: {
              users: true,
              batches: true,
              salesInvoices: true,
            },
          },
        },
      });
      return res.json(branches);
    }

    // Branch Admin or Billing User gets only their branch
    const branch = await prisma.branch.findUnique({
      where: { id: req.user.branchId || '' },
      include: {
        _count: {
          select: {
            users: true,
            batches: true,
            salesInvoices: true,
          },
        },
      },
    });

    return res.json(branch ? [branch] : []);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch branches' });
  }
};

export const getBranchById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    // Isolation check
    if (req.user.role !== 'SUPER_ADMIN' && req.user.branchId !== id) {
      return res.status(403).json({ message: 'Access denied to this branch' });
    }

    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        company: true,
        _count: {
          select: {
            users: true,
            batches: true,
            salesInvoices: true,
            purchaseInvoices: true,
          },
        },
      },
    });

    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    return res.json(branch);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch branch details' });
  }
};

export const createBranch = async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Only Super Admin can create branches' });
    }

    const { code, name, address, phone, email, gstin, drugLicenseNo } = req.body;

    if (!code || !name || !address || !phone) {
      return res.status(400).json({ message: 'Code, Name, Address, and Phone are required.' });
    }

    const trimmedEmail = email && typeof email === 'string' && email.trim() ? email.trim() : null;
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ message: 'Please provide a valid email address format (e.g. branch@domain.com).' });
      }
    }

    const trimmedGstin = gstin && typeof gstin === 'string' && gstin.trim() ? gstin.trim().toUpperCase() : null;
    if (trimmedGstin) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(trimmedGstin)) {
        return res.status(400).json({ message: 'Please provide a valid 15-character GSTIN (e.g. 37AAAAA1234A1Z8).' });
      }
    }

    const existingCode = await prisma.branch.findUnique({ where: { code: code.toUpperCase().trim() } });
    if (existingCode) {
      return res.status(409).json({ message: `Branch code '${code}' already exists.` });
    }

    // Get or create primary company
    let company = await prisma.company.findFirst();
    if (!company) {
      company = await prisma.company.create({
        data: {
          name: 'Confidos Pharma Ltd.',
          legalName: 'Confidos Healthcare & Pharmaceuticals Private Limited',
          gstin: trimmedGstin,
          address: address.trim(),
          phone: phone.trim(),
          email: trimmedEmail,
        },
      });
    }

    const newBranch = await prisma.branch.create({
      data: {
        companyId: company.id,
        code: code.toUpperCase().trim(),
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
        email: trimmedEmail,
        gstin: trimmedGstin,
        drugLicenseNo: drugLicenseNo && typeof drugLicenseNo === 'string' && drugLicenseNo.trim() ? drugLicenseNo.trim() : null,
        isActive: true,
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      action: 'BRANCH_CREATE',
      targetEntity: 'BRANCH',
      entityId: newBranch.id,
      details: { code: newBranch.code, name: newBranch.name },
      req,
    });

    return res.status(201).json(newBranch);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to create branch' });
  }
};

export const updateBranch = async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'You do not have permission to modify this record. Please contact the Super Admin for assistance.' });
    }

    const id = req.params.id as string;
    const { name, address, phone, email, gstin, drugLicenseNo, isActive } = req.body;

    const trimmedEmail = email !== undefined ? (email && typeof email === 'string' && email.trim() ? email.trim() : null) : undefined;
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        return res.status(400).json({ message: 'Please provide a valid email address format.' });
      }
    }

    const trimmedGstin = gstin !== undefined ? (gstin && typeof gstin === 'string' && gstin.trim() ? gstin.trim().toUpperCase() : null) : undefined;
    if (trimmedGstin) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(trimmedGstin)) {
        return res.status(400).json({ message: 'Please provide a valid 15-character GSTIN.' });
      }
    }

    const updated = await prisma.branch.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(address && { address: address.trim() }),
        ...(phone && { phone: phone.trim() }),
        ...(trimmedEmail !== undefined && { email: trimmedEmail }),
        ...(trimmedGstin !== undefined && { gstin: trimmedGstin }),
        ...(drugLicenseNo !== undefined && { drugLicenseNo: drugLicenseNo && drugLicenseNo.trim() ? drugLicenseNo.trim() : null }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      action: 'BRANCH_UPDATE',
      targetEntity: 'BRANCH',
      entityId: updated.id,
      details: { name: updated.name, isActive: updated.isActive },
      req,
    });

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to update branch' });
  }
};

export const deleteBranch = async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'You do not have permission to modify this record. Please contact the Super Admin for assistance.' });
    }

    const id = req.params.id as string;
    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            batches: true,
            salesInvoices: true,
            purchaseInvoices: true,
          },
        },
      },
    });

    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' });
    }

    const hasDependencies = branch._count.users > 0 ||
      branch._count.batches > 0 ||
      branch._count.salesInvoices > 0 ||
      branch._count.purchaseInvoices > 0;

    if (hasDependencies) {
      const archived = await prisma.branch.update({
        where: { id },
        data: { isActive: false },
      });

      await logAuditEvent({
        userId: req.user.id,
        action: 'BRANCH_ARCHIVE',
        targetEntity: 'BRANCH',
        entityId: archived.id,
        details: { code: archived.code, name: archived.name, reason: 'Archived due to associated staff or historical transactions' },
        req,
      });

      return res.json({
        message: `Branch '${branch.name}' (${branch.code}) has been archived/deactivated to preserve historical transaction audit trails.`,
        branch: archived,
        archived: true,
      });
    }

    await prisma.branch.delete({ where: { id } });

    await logAuditEvent({
      userId: req.user.id,
      action: 'BRANCH_DELETE',
      targetEntity: 'BRANCH',
      entityId: id,
      details: { code: branch.code, name: branch.name },
      req,
    });

    return res.json({
      message: `Branch '${branch.name}' (${branch.code}) deleted permanently.`,
      deleted: true,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to delete branch' });
  }
};

