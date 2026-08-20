import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { sendError } from '../utils/response';
import pool from '../db/database';
import { AuthenticatedUser } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'Authorization token missing or invalid format', 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAccessToken(token);

    // Fetch user details & roles from DB
    const userRes = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active,
              ARRAY_AGG(r.name) as roles
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE u.id = $1 AND u.is_active = TRUE
       GROUP BY u.id`,
      [decoded.userId]
    );

    if (userRes.rows.length === 0) {
      return sendError(res, 'User account not found or inactive', 401);
    }

    const row = userRes.rows[0];

    // Find optional property_owner id
    let ownerId: string | undefined;
    const ownerRes = await pool.query('SELECT id FROM property_owners WHERE user_id = $1', [row.id]);
    if (ownerRes.rows.length > 0) {
      ownerId = ownerRes.rows[0].id;
    }

    // Find optional tenant id & branch id
    let tenantId: string | undefined;
    let branchId: string | undefined;
    const tenantRes = await pool.query('SELECT id, branch_id FROM tenants WHERE user_id = $1', [row.id]);
    if (tenantRes.rows.length > 0) {
      tenantId = tenantRes.rows[0].id;
      branchId = tenantRes.rows[0].branch_id;
    }

    req.user = {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      mobileNumber: row.mobile_number,
      roles: row.roles,
      ownerId,
      tenantId,
      branchId,
    };

    next();
  } catch (error: any) {
    return sendError(res, 'Invalid or expired access token', 401, error);
  }
};
