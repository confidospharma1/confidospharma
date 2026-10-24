import { Request, Response } from 'express';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';

export const getSuppliers = async (req: Request, res: Response) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return res.json(suppliers);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch suppliers' });
  }
};

export const createSupplier = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot create suppliers' });
    }

    const { name, contactPerson, phone, email, gstin, address, dlNumber } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ message: 'Supplier name and phone are required' });
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: name.trim(),
        contactPerson: contactPerson ? contactPerson.trim() : null,
        phone: phone.trim(),
        email: email ? email.trim() : null,
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
      details: { name: supplier.name },
      req,
    });

    return res.status(201).json(supplier);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to create supplier' });
  }
};
