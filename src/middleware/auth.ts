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
      `SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active, u.owner_id,
              ARRAY_AGG(DISTINCT r.name) as roles
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
    const isOwner = row.roles.includes('COMPANY_ADMIN');
    const isSuperAdmin = row.roles.includes('SUPER_ADMIN');

    // Ensure staff accounts (linked to an owner or with custom role) include STAFF role
    const roles: string[] = [...(row.roles || [])];
    if (row.owner_id && !roles.includes('STAFF')) {
      roles.push('STAFF');
    }

    // Find optional tenant id & branch id
    let tenantId: string | undefined;
    let branchId: string | undefined;
    const tenantRes = await pool.query('SELECT id, branch_id FROM tenants WHERE user_id = $1', [row.id]);
    if (tenantRes.rows.length > 0) {
      tenantId = tenantRes.rows[0].id;
      branchId = tenantRes.rows[0].branch_id;
    } else {
      const ubRes = await pool.query('SELECT branch_id FROM user_branches WHERE user_id = $1 LIMIT 1', [row.id]);
      if (ubRes.rows.length > 0) {
        branchId = ubRes.rows[0].branch_id;
      } else {
        const roleBranchRes = await pool.query(
          `SELECT r.branch_id 
           FROM roles r 
           JOIN user_roles ur ON ur.role_id = r.id 
           WHERE ur.user_id = $1 AND r.branch_id IS NOT NULL 
           LIMIT 1`,
          [row.id]
        );
        if (roleBranchRes.rows.length > 0) {
          branchId = roleBranchRes.rows[0].branch_id;
        }
      }
    }

    // Resolve permissions
    let permissions: string[] = [];
    if (isSuperAdmin || isOwner) {
      const allPerms = await pool.query('SELECT permission_code FROM permissions ORDER BY id ASC');
      permissions = allPerms.rows.map((p: any) => p.permission_code);
    } else {
      const staffPerms = await pool.query(
        `SELECT DISTINCT p.permission_code
         FROM role_permission_mapping rpm
         JOIN permissions p ON p.id = rpm.permission_id
         JOIN user_roles ur ON ur.role_id = rpm.role_id
         WHERE ur.user_id = $1`,
        [row.id]
      );
      permissions = staffPerms.rows.map((p: any) => p.permission_code);
    }

    req.user = {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      mobileNumber: row.mobile_number,
      roles,
      ownerId: isOwner ? row.id : (row.owner_id || undefined),
      tenantId,
      branchId,
      permissions,
      isOwner,
    };

    next();
  } catch (error: any) {
    return sendError(res, 'Invalid or expired access token', 401, error);
  }
};
