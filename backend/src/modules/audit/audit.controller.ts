import { Request, Response } from 'express';
import prisma from '../../database/prisma';

export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Forbidden: Billing users cannot view audit logs' });
    }

    const { branchId, action, targetEntity, page = '1', limit = '50' } = req.query;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    const whereClause: any = {};
    if (targetBranchId) whereClause.branchId = targetBranchId;
    if (action) whereClause.action = action as string;
    if (targetEntity) whereClause.targetEntity = targetEntity as string;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [total, events] = await Promise.all([
      prisma.auditEvent.count({ where: whereClause }),
      prisma.auditEvent.findMany({
        where: whereClause,
        include: {
          branch: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return res.json({
      total,
      page: parseInt(page as string),
      limit: take,
      totalPages: Math.ceil(total / take),
      events,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
};
