import { Request, Response, NextFunction } from 'express';

export const enforceBranchScope = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  // Super Admin has global company-wide access
  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  // For Branch Admin and Billing User, ensure they have an assigned branch
  if (!req.user.branchId) {
    return res.status(403).json({ message: 'Access denied: User is not assigned to any branch.' });
  }

  // Check if target branch is specified in params, query, or body
  const targetBranchId = req.params.branchId || req.query.branchId || req.body.branchId;

  if (targetBranchId && targetBranchId !== req.user.branchId) {
    return res.status(403).json({
      message: 'Access denied: You are not authorized to view or modify records belonging to another branch.',
    });
  }

  // Always force the user's allowed branchId on requests
  if (req.body && typeof req.body === 'object') {
    req.body.branchId = req.user.branchId;
  }
  if (req.query) {
    req.query.branchId = req.user.branchId;
  }

  next();
};

export const resolveAllowedBranchId = (req: Request): string | undefined => {
  if (!req.user) return undefined;
  if (req.user.role === 'SUPER_ADMIN') {
    return (req.query.branchId as string) || (req.body.branchId as string) || undefined;
  }
  return req.user.branchId || undefined;
};
