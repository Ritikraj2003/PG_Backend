import { Request, Response, NextFunction } from 'express';
import pool from '../db/database';
import { sendError } from '../utils/response';

export const verifyBranchOwnership = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return sendError(res, 'Unauthenticated', 401);
    }

    // Super admin has global access
    if (req.user.roles.includes('SUPER_ADMIN')) {
      return next();
    }

    const branchId = req.params.branchId || req.body.branch_id || req.query.branch_id;

    if (!branchId) {
      return sendError(res, 'Branch ID parameter is required', 400);
    }

    // Staff member assigned to specific branch cannot access other branches
    if (req.user.branchId && req.user.branchId !== branchId) {
      return sendError(res, 'Forbidden: You only have access to your assigned branch', 403);
    }

    // 1. Get user ID from JWT (req.user.id)
    // 2. Find Owner
    if (!req.user.ownerId) {
      return sendError(res, 'Access denied: User is not a property owner', 403);
    }

    // 3. Find Property & 4. Verify Branch belongs to Property
    const result = await pool.query(
      `SELECT b.id as branch_id, b.name as branch_name, p.id as property_id, p.owner_id
       FROM branches b
       JOIN properties p ON b.property_id = p.id
       WHERE b.id = $1 AND p.owner_id = $2`,
      [branchId, req.user.ownerId]
    );

    if (result.rows.length === 0) {
      return sendError(res, 'Forbidden: You do not have permission to access this branch data', 403);
    }

    // Attach validated branchId to req object
    (req as any).validatedBranchId = branchId;
    next();
  } catch (error: any) {
    return sendError(res, 'Branch authorization failed', 500, error);
  }
};
