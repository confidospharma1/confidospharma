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

export const getSetupStatus = async (req: Request, res: Response) => {
  try {
    const userCount = await prisma.user.count();
    return res.json({
      needsSetup: userCount === 0,
      totalUsers: userCount,
    });
  } catch (error: any) {
    console.error('Setup status check error:', error);
    return res.status(500).json({ message: 'Failed to verify system setup status' });
  }
};

export const setupInitialAdmin = async (req: Request, res: Response) => {
  try {
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      return res.status(403).json({
        message: 'System initialization already completed. Super Administrator account already exists.',
      });
    }

    const {
      fullName,
      username,
      email,
      password,
      companyName = 'Confidos Pharma Ltd.',
      branchName,
      branchCode,
      branchAddress,
      branchPhone,
      branchGstin,
    } = req.body;

    if (!fullName || !username || !email || !password) {
      return res.status(400).json({ message: 'Full Name, Username, Email, and Password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create or get Company
      let company = await tx.company.findFirst();
      if (!company) {
        company = await tx.company.create({
          data: {
            name: companyName.trim(),
            legalName: `${companyName.trim()} Healthcare & Pharmaceuticals Private Limited`,
            gstin: branchGstin ? branchGstin.toUpperCase().trim() : '37AAAAA0000A1Z5',
            address: branchAddress ? branchAddress.trim() : 'Corporate Headquarters',
            phone: branchPhone ? branchPhone.trim() : '+91 866 0000000',
            email: email.trim().toLowerCase(),
          },
        });
      }

      // 2. Optionally create initial primary branch if specified
      let primaryBranch = null;
      if (branchName && branchCode) {
        primaryBranch = await tx.branch.create({
          data: {
            companyId: company.id,
            code: branchCode.trim().toUpperCase(),
            name: branchName.trim(),
            address: branchAddress ? branchAddress.trim() : 'Main Branch Office',
            phone: branchPhone ? branchPhone.trim() : '+91 866 0000000',
            email: email.trim().toLowerCase(),
            gstin: branchGstin ? branchGstin.toUpperCase().trim() : '37AAAAA0000A1Z5',
            isActive: true,
          },
        });
      }

      // 3. Create Super Admin User
      const adminUser = await tx.user.create({
        data: {
          username: username.trim().toLowerCase(),
          email: email.trim().toLowerCase(),
          fullName: fullName.trim(),
          passwordHash,
          role: 'SUPER_ADMIN',
          branchId: primaryBranch ? primaryBranch.id : null,
          isActive: true,
        },
        include: {
          branch: true,
        },
      });

      return { company, branch: primaryBranch, adminUser };
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: result.adminUser.id,
        username: result.adminUser.username,
        role: result.adminUser.role,
        branchId: result.adminUser.branchId,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    await logAuditEvent({
      userId: result.adminUser.id,
      branchId: result.adminUser.branchId,
      action: 'LOGIN_SUCCESS',
      targetEntity: 'USER',
      entityId: result.adminUser.id,
      details: { role: 'SUPER_ADMIN', username: result.adminUser.username, onboarding: true },
      req,
    });

    return res.status(201).json({
      message: 'Super Administrator initialized successfully.',
      token,
      user: {
        id: result.adminUser.id,
        username: result.adminUser.username,
        email: result.adminUser.email,
        fullName: result.adminUser.fullName,
        role: result.adminUser.role,
        branchId: result.adminUser.branchId,
        branch: result.adminUser.branch,
      },
    });
  } catch (error: any) {
    console.error('Setup error:', error);
    return res.status(500).json({ message: error.message || 'Failed to complete initial administrator setup.' });
  }
};
