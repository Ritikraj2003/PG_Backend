import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

export const checkPermission = (requiredPermission: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 'Authentication required', 401);
    }

    // Super Admin and Company Owner always have full access
    if (req.user.roles.includes('SUPER_ADMIN') || req.user.roles.includes('COMPANY_ADMIN')) {
      return next();
    }

    const perms = req.user.permissions || [];
    const required = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];

    const hasPerm = required.some((p) => perms.includes(p));
    if (!hasPerm) {
      return sendError(res, `Forbidden: You do not have permission (${required.join(', ')}) to perform this action`, 403);
    }

    next();
  };
};
