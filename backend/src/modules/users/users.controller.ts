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
    const { fullName, email, isActive, branchId, password, role } = req.body;

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
    if (req.user.role === 'SUPER_ADMIN') {
      if (branchId !== undefined) dataToUpdate.branchId = branchId || null;
      if (role && ['SUPER_ADMIN', 'BRANCH_ADMIN', 'BILLING_USER'].includes(role)) {
        dataToUpdate.role = role;
      }
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

export const deleteUser = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const id = req.params.id as string;
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) return res.status(404).json({ message: 'User not found' });

    // Prevent self-deactivation
    if (req.user.id === id) {
      return res.status(400).json({ message: 'Cannot deactivate your own user account' });
    }

    // Role-based authorization & Branch isolation
    if (req.user.role === 'BRANCH_ADMIN') {
      if (existingUser.branchId !== req.user.branchId || existingUser.role !== 'BILLING_USER') {
        return res.status(403).json({ message: 'Access denied: Branch Admins can only deactivate billing staff within their assigned branch.' });
      }
    } else if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Forbidden: Insufficient privileges to deactivate user accounts.' });
    }

    // Mandatory safeguard: cannot deactivate the last remaining active Super Admin
    if (existingUser.role === 'SUPER_ADMIN') {
      const activeSuperAdminCount = await prisma.user.count({
        where: { role: 'SUPER_ADMIN', isActive: true },
      });
      if (activeSuperAdminCount <= 1) {
        return res.status(400).json({ message: 'Mandatory administrative safeguard: Cannot deactivate the last remaining active Super Administrator.' });
      }
    }

    // Soft-deactivate to preserve historical billing, movements, and audit compliance
    const deactivated = await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: existingUser.branchId,
      action: 'USER_DEACTIVATE',
      targetEntity: 'USER',
      entityId: deactivated.id,
      details: { username: deactivated.username, role: deactivated.role },
      req,
    });

    return res.json({
      message: `User account '${deactivated.username}' has been deactivated.`,
      user: deactivated,
      archived: true,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to deactivate user' });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        branchId: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        branch: { select: { id: true, code: true, name: true, phone: true } },
      },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(user);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to fetch profile' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { fullName, email, password } = req.body;
    const dataToUpdate: any = {};

    if (fullName && fullName.trim()) dataToUpdate.fullName = fullName.trim();
    if (email && email.trim()) {
      const trimmedEmail = email.toLowerCase().trim();
      const existing = await prisma.user.findFirst({
        where: { email: trimmedEmail, id: { not: req.user.id } },
      });
      if (existing) {
        return res.status(409).json({ message: 'Email address is already in use by another account' });
      }
      dataToUpdate.email = trimmedEmail;
    }
    if (password && password.length >= 6) {
      dataToUpdate.passwordHash = await bcrypt.hash(password, 10);
    }

    // Role and branchId cannot be modified via self-service profile update!
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: dataToUpdate,
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        branchId: true,
        isActive: true,
        branch: { select: { id: true, code: true, name: true } },
      },
    });

    return res.json({
      message: 'Profile updated successfully',
      user: updated,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to update profile' });
  }
};

export const bulkDeleteUsers = async (req: Request, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Forbidden: Super Admin only' });
    }

    const rawIds = req.body.ids || req.body.userIds;
    if (!rawIds || !Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ message: 'No user IDs provided' });
    }

    const uniqueIds = Array.from(
      new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    );

    if (uniqueIds.length === 0) {
      return res.status(400).json({ message: 'No valid user IDs provided' });
    }

    const results = {
      deactivated: [] as string[],
      failed: [] as { id: string; reason: string }[],
    };

    let activeSuperAdminCount = await prisma.user.count({
      where: { role: 'SUPER_ADMIN', isActive: true },
    });

    for (const id of uniqueIds) {
      if (id === req.user.id) {
        results.failed.push({ id, reason: 'Cannot deactivate your own logged-in account' });
        continue;
      }

      const targetUser = await prisma.user.findUnique({ where: { id } });
      if (!targetUser) {
        results.failed.push({ id, reason: 'User not found' });
        continue;
      }

      if (targetUser.role === 'SUPER_ADMIN') {
        if (activeSuperAdminCount <= 1) {
          results.failed.push({ id, reason: `Cannot deactivate ${targetUser.username}: Last remaining active Super Administrator` });
          continue;
        }
        activeSuperAdminCount--;
      }

      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });
      results.deactivated.push(targetUser.username);
    }

    await logAuditEvent({
      userId: req.user.id,
      action: 'USER_BULK_DEACTIVATE',
      targetEntity: 'USER',
      details: {
        totalRequested: uniqueIds.length,
        deactivatedCount: results.deactivated.length,
        failedCount: results.failed.length,
      },
      req,
    });

    return res.json({
      message: `Deactivated ${results.deactivated.length} user accounts`,
      deactivated: results.deactivated,
      failed: results.failed,
      totalProcessed: results.deactivated.length,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Bulk user deactivation failed' });
  }
};


