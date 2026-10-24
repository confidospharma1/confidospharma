import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../database/prisma';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../../config/jwt';
import { logAuditEvent } from '../../utils/audit';

export const login = async (req: Request, res: Response) => {
  try {
    const { usernameOrEmail, password } = req.body;

    if (!usernameOrEmail || !password) {
      return res.status(400).json({ message: 'Username/Email and password are required.' });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
      },
      include: {
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
            gstin: true,
            phone: true,
            address: true,
            drugLicenseNo: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials. Please verify your details.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'This account has been deactivated. Please contact Super Admin.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await logAuditEvent({
        userId: user.id,
        branchId: user.branchId,
        action: 'LOGIN_FAILED',
        targetEntity: 'USER',
        entityId: user.id,
        details: { reason: 'Incorrect password attempt' },
        req,
      });
      return res.status(401).json({ message: 'Invalid credentials. Please verify your details.' });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        branchId: user.branchId,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await logAuditEvent({
      userId: user.id,
      branchId: user.branchId,
      action: 'LOGIN_SUCCESS',
      targetEntity: 'USER',
      entityId: user.id,
      details: { role: user.role, branch: user.branch?.name || 'Company Wide' },
      req,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        branchId: user.branchId,
        branch: user.branch,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'An internal error occurred during login.' });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        branch: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { passwordHash, ...userWithoutPassword } = user;
    return res.json({ user: userWithoutPassword });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to retrieve profile' });
  }
};

export const logout = async (req: Request, res: Response) => {
  if (req.user) {
    await logAuditEvent({
      userId: req.user.id,
      branchId: req.user.branchId,
      action: 'LOGOUT',
      targetEntity: 'USER',
      entityId: req.user.id,
      req,
    });
  }
  return res.json({ message: 'Logged out successfully' });
};
