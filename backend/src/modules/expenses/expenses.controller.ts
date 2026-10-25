import { Request, Response } from 'express';
import Decimal from 'decimal.js';
import prisma from '../../database/prisma';
import { logAuditEvent } from '../../utils/audit';

const VALID_CATEGORIES = [
  'RENT',
  'SALARIES',
  'ELECTRICITY',
  'INTERNET',
  'TRANSPORT',
  'PACKAGING',
  'MAINTENANCE',
  'MARKETING',
  'OTHER',
];

export const getExpenses = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const { branchId, category, startDate, endDate, page = '1', limit = '50' } = req.query;
    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId as string) : req.user.branchId;

    const whereClause: any = {};
    if (targetBranchId) whereClause.branchId = targetBranchId;
    if (category) whereClause.category = (category as string).toUpperCase();

    if (startDate || endDate) {
      whereClause.expenseDate = {};
      if (startDate) whereClause.expenseDate.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        whereClause.expenseDate.lte = end;
      }
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [total, expenses] = await Promise.all([
      prisma.expense.count({ where: whereClause }),
      prisma.expense.findMany({
        where: whereClause,
        include: {
          branch: { select: { id: true, code: true, name: true } },
        },
        orderBy: { expenseDate: 'desc' },
        skip,
        take,
      }),
    ]);

    // Calculate total amount for the filtered expenses
    const totalAmountAgg = await prisma.expense.aggregate({
      where: whereClause,
      _sum: { amount: true },
    });

    return res.json({
      total,
      page: parseInt(page as string),
      limit: take,
      totalPages: Math.ceil(total / take),
      totalExpenseAmount: totalAmountAgg._sum.amount || 0,
      expenses,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch expenses' });
  }
};

export const createExpense = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot record operating expenses' });
    }

    const {
      branchId,
      expenseDate,
      category,
      description,
      amount,
      paymentMode = 'CASH',
      referenceNo,
      notes,
    } = req.body;

    const targetBranchId = req.user.role === 'SUPER_ADMIN' ? (branchId || req.user.branchId) : req.user.branchId;

    if (!targetBranchId || !category || !description || amount === undefined) {
      return res.status(400).json({ message: 'Branch ID, category, description, and amount are required' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Expense amount must be a positive number' });
    }

    const formattedCategory = category.toUpperCase().trim();

    const expense = await prisma.expense.create({
      data: {
        branchId: targetBranchId,
        expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
        category: formattedCategory,
        description: description.trim(),
        amount: parsedAmount,
        paymentMode: paymentMode.toUpperCase(),
        referenceNo: referenceNo ? referenceNo.trim() : null,
        notes: notes ? notes.trim() : null,
        createdById: req.user.id,
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: targetBranchId,
      action: 'EXPENSE_CREATE',
      targetEntity: 'EXPENSE',
      entityId: expense.id,
      details: { category: expense.category, amount: expense.amount, description: expense.description },
      req,
    });

    return res.status(201).json(expense);
  } catch (error: any) {
    console.error('Create expense error:', error);
    return res.status(500).json({ message: error.message || 'Failed to create expense' });
  }
};

export const updateExpense = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot edit operating expenses' });
    }

    const id = req.params.id as string;
    const {
      expenseDate,
      category,
      description,
      amount,
      paymentMode,
      referenceNo,
      notes,
    } = req.body;

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Expense record not found' });

    if (req.user.role !== 'SUPER_ADMIN' && existing.branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied: Expense belongs to another branch' });
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        ...(expenseDate && { expenseDate: new Date(expenseDate) }),
        ...(category && { category: category.toUpperCase().trim() }),
        ...(description && { description: description.trim() }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(paymentMode && { paymentMode: paymentMode.toUpperCase() }),
        ...(referenceNo !== undefined && { referenceNo: referenceNo ? referenceNo.trim() : null }),
        ...(notes !== undefined && { notes: notes ? notes.trim() : null }),
      },
      include: {
        branch: { select: { id: true, code: true, name: true } },
      },
    });

    await logAuditEvent({
      userId: req.user.id,
      branchId: updated.branchId,
      action: 'EXPENSE_UPDATE',
      targetEntity: 'EXPENSE',
      entityId: updated.id,
      details: { category: updated.category, amount: updated.amount },
      req,
    });

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to update expense' });
  }
};

export const deleteExpense = async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    if (req.user.role === 'BILLING_USER') {
      return res.status(403).json({ message: 'Billing users cannot delete operating expenses' });
    }

    const id = req.params.id as string;
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: 'Expense record not found' });

    if (req.user.role !== 'SUPER_ADMIN' && existing.branchId !== req.user.branchId) {
      return res.status(403).json({ message: 'Access denied: Expense belongs to another branch' });
    }

    await prisma.expense.delete({ where: { id } });

    await logAuditEvent({
      userId: req.user.id,
      branchId: existing.branchId,
      action: 'EXPENSE_DELETE',
      targetEntity: 'EXPENSE',
      entityId: existing.id,
      details: { category: existing.category, amount: existing.amount },
      req,
    });

    return res.json({ message: 'Expense record deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Failed to delete expense' });
  }
};
