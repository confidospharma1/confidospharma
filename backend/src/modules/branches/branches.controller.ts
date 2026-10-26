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

    if (!code || !name || !address || !phone || !gstin) {
      return res.status(400).json({ message: 'Code, Name, Address, Phone, and GSTIN are required' });
    }

    const existingCode = await prisma.branch.findUnique({ where: { code } });
    if (existingCode) {
      return res.status(409).json({ message: `Branch code '${code}' already exists` });
    }

    // Get primary company
    const company = await prisma.company.findFirst();
    if (!company) {
      return res.status(500).json({ message: 'Default company record not found' });
    }

    const newBranch = await prisma.branch.create({
      data: {
        companyId: company.id,
        code: code.toUpperCase().trim(),
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
        email: email ? email.trim() : null,
        gstin: gstin.toUpperCase().trim(),
        drugLicenseNo: drugLicenseNo ? drugLicenseNo.trim() : null,
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
      return res.status(403).json({ message: 'Only Super Admin can update branches' });
    }

    const id = req.params.id as string;
    const { name, address, phone, email, gstin, drugLicenseNo, isActive } = req.body;

    const updated = await prisma.branch.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(address && { address: address.trim() }),
        ...(phone && { phone: phone.trim() }),
        ...(email !== undefined && { email: email ? email.trim() : null }),
        ...(gstin && { gstin: gstin.toUpperCase().trim() }),
        ...(drugLicenseNo !== undefined && { drugLicenseNo: drugLicenseNo ? drugLicenseNo.trim() : null }),
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
      return res.status(403).json({ message: 'Only Super Admin can delete or archive branches' });
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

