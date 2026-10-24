import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';

export const getUsers = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const whereClause: any = {};

    if (req.user.role === 'BRANCH_ADMIN') {
      whereClause.branchId = req.user.branchId;
    } else if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Forbidden: Billing users cannot view user lists' });
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        branchId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(users);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch users' });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { username, email, fullName, password, role, branchId } = req.body;

    if (!username || !email || !fullName || !password || !role) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // Role permission enforcement
    if (req.user.role === 'BRANCH_ADMIN') {
      if (role !== 'BILLING_USER') {
        return res.status(403).json({ message: 'Branch Admins can only create Billing Users.' });
      }
      if (branchId && branchId !== req.user.branchId) {
        return res.status(403).json({ message: 'Cannot assign user to another branch.' });
      }
    } else if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Enforce branch assignment for non-superadmin
    const targetBranchId = role === 'SUPER_ADMIN' ? null : (req.user.role === 'BRANCH_ADMIN' ? req.user.branchId : branchId);

    if (role !== 'SUPER_ADMIN' && !targetBranchId) {
      return res.status(400).json({ message: 'Branch selection is required for Branch Admin and Billing Users.' });
    }

    // Check unique username & email
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existing) {
      return res.status(409).json({ message: 'Username or email already in use.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        username: username.toLowerCase().trim(),
        email: email.toLowerCase().trim(),
        fullName: fullName.trim(),
        passwordHash,
        role,
        branchId: targetBranchId,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        branchId: true,
        isActive: true,
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: targetBranchId,
      action: 'USER_CREATE',
      targetEntity: 'USER',
      entityId: newUser.id,
      details: { username: newUser.username, role: newUser.role, branchId: targetBranchId },
      req,
    });

    return res.status(201).json(newUser);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to create user' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const id = req.params.id as string;
    const { fullName, email, isActive, branchId, password } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) return res.status(404).json({ message: 'User not found' });

    if (req.user.role === 'BRANCH_ADMIN') {
      if (existingUser.branchId !== req.user.branchId || existingUser.role !== 'BILLING_USER') {
        return res.status(403).json({ message: 'Access denied: You can only edit billing users in your branch.' });
      }
    } else if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const dataToUpdate: any = {};
    if (fullName) dataToUpdate.fullName = fullName.trim();
    if (email) dataToUpdate.email = email.toLowerCase().trim();
    if (isActive !== undefined) dataToUpdate.isActive = isActive;
    if (password) dataToUpdate.passwordHash = await bcrypt.hash(password, 10);
    if (req.user.role === 'SUPER_ADMIN' && branchId !== undefined) {
      dataToUpdate.branchId = branchId || null;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        branchId: true,
        isActive: true,
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: updated.branchId,
      action: 'USER_UPDATE',
      targetEntity: 'USER',
      entityId: updated.id,
      details: { changes: Object.keys(dataToUpdate) },
      req,
    });

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to update user' });
  }
};
