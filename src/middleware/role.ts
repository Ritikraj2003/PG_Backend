import { Request, Response, NextFunction } from 'express';
import { RoleType } from '../types';
import { sendError } from '../utils/response';

export const authorizeRoles = (...allowedRoles: RoleType[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 'Unauthenticated', 401);
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role as RoleType));
    if (!hasRole) {
      return sendError(res, `Forbidden: Requires one of [${allowedRoles.join(', ')}] roles`, 403);
    }

    next();
  };
};
