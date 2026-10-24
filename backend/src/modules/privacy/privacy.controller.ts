import { Request, Response } from 'express';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';

export const submitPrivacyRequest = async (req: Request, res: Response) => {
  try {
    const { requesterName, requesterEmail, requesterPhone, requestType, details } = req.body;

    if (!requesterName || !requesterEmail || !requestType || !details) {
      return res.status(400).json({ message: 'Name, email, request type, and details are required' });
    }

    const count = await prisma.privacyRequest.count();
    const ticketNumber = `DSR-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const request = await prisma.privacyRequest.create({
      data: {
        ticketNumber,
        requesterName: requesterName.trim(),
        requesterEmail: requesterEmail.toLowerCase().trim(),
        requesterPhone: requesterPhone ? requesterPhone.trim() : null,
        requestType,
        details: details.trim(),
        status: 'PENDING',
      },
    });

    return res.status(201).json({
      message: 'Privacy request recorded successfully. Our Grievance & Privacy Officer will review your request within the statutory timeframe.',
      ticketNumber: request.ticketNumber,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to submit privacy request' });
  }
};

export const getPrivacyRequests = async (req: Request, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Only Super Admin can manage privacy compliance requests' });
    }

    const requests = await prisma.privacyRequest.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return res.json(requests);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch privacy requests' });
  }
};

export const updatePrivacyRequest = async (req: Request, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const id = req.params.id as string;
    const { status, resolutionNotes } = req.body;

    const updated = await prisma.privacyRequest.update({
      where: { id },
      data: {
        status,
        resolutionNotes: resolutionNotes ? resolutionNotes.trim() : null,
        resolvedByUserId: req.user.id,
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      action: 'PRIVACY_REQUEST_RESOLVED',
      targetEntity: 'PRIVACY_REQUEST',
      entityId: updated.id,
      details: { ticketNumber: updated.ticketNumber, status: updated.status },
      req,
    });

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update privacy request' });
  }
};
