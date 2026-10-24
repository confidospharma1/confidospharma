import prisma from '../database/prisma';
import { Request } from 'express';

export interface AuditParams {
  userId: string;
  branchId?: string | null;
  action: string;
  targetEntity: string;
  entityId?: string | null;
  details?: any;
  req?: Request;
}

export const logAuditEvent = async ({
  userId,
  branchId,
  action,
  targetEntity,
  entityId,
  details,
  req,
}: AuditParams) => {
  try {
    const ipAddress = req?.headers['x-forwarded-for']?.toString() || req?.socket?.remoteAddress || '127.0.0.1';
    const userAgent = req?.headers['user-agent'] || 'API';

    await prisma.auditEvent.create({
      data: {
        userId,
        branchId: branchId || null,
        action,
        targetEntity,
        entityId: entityId || null,
        details: details ? JSON.stringify(details) : null,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error('Failed to write audit event:', error);
  }
};
