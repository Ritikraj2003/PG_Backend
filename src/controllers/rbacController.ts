import { Request, Response } from 'express';
import { RbacService } from '../services/rbacService';
import { sendSuccess, sendError } from '../utils/response';

export class RbacController {
  public static async getPermissions(req: Request, res: Response) {
    try {
      const permissions = await RbacService.getPermissions();
      return sendSuccess(res, permissions, 'Permissions retrieved successfully');
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to retrieve permissions', 500);
    }
  }

  public static async getRoles(req: Request, res: Response) {
    try {
      const ownerId = req.user?.ownerId;
      if (!ownerId) {
        return sendError(res, 'Owner ID not found in session', 400);
      }
      const branchId = req.query.branch_id as string | undefined;
      const roles = await RbacService.getRoles(ownerId, branchId);
      return sendSuccess(res, roles, 'Roles retrieved successfully');
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to retrieve roles', 500);
    }
  }

  public static async createRole(req: Request, res: Response) {
    try {
      const ownerId = req.user?.ownerId;
      const userId = req.user?.id;
      if (!ownerId || !userId) {
        return sendError(res, 'Unauthorized', 401);
      }

      const { name, description, permission_ids, is_active, branch_id } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return sendError(res, 'Role name is required', 400);
      }

      const role = await RbacService.createRole(ownerId, userId, {
        name,
        description,
        permission_ids: Array.isArray(permission_ids) ? permission_ids.map(Number) : [],
        is_active: is_active !== undefined ? Boolean(is_active) : true,
        branch_id: branch_id || null,
      });
      return sendSuccess(res, role, 'Role created successfully', 201);
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to create role', 400);
    }
  }

  public static async updateRole(req: Request, res: Response) {
    try {
      const ownerId = req.user?.ownerId;
      const userId = req.user?.id;
      if (!ownerId || !userId) {
        return sendError(res, 'Unauthorized', 401);
      }

      const roleId = parseInt(req.params.id, 10);
      if (isNaN(roleId)) {
        return sendError(res, 'Invalid role ID', 400);
      }

      const { name, description, permission_ids, is_active, branch_id } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return sendError(res, 'Role name is required', 400);
      }

      const role = await RbacService.updateRole(ownerId, userId, roleId, {
        name,
        description,
        permission_ids: Array.isArray(permission_ids) ? permission_ids.map(Number) : [],
        is_active: is_active !== undefined ? Boolean(is_active) : true,
        branch_id: branch_id !== undefined ? (branch_id || null) : undefined,
      });
      return sendSuccess(res, role, 'Role updated successfully');
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to update role', 400);
    }
  }

  public static async deleteRole(req: Request, res: Response) {
    try {
      const ownerId = req.user?.ownerId;
      if (!ownerId) {
        return sendError(res, 'Unauthorized', 401);
      }

      const roleId = parseInt(req.params.id, 10);
      if (isNaN(roleId)) {
        return sendError(res, 'Invalid role ID', 400);
      }

      const result = await RbacService.deleteRole(ownerId, roleId);
      return sendSuccess(res, result, result.message);
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to delete role', 400);
    }
  }

  public static async getStaff(req: Request, res: Response) {
    try {
      const ownerId = req.user?.ownerId;
      if (!ownerId) {
        return sendError(res, 'Owner ID not found in session', 400);
      }
      const staff = await RbacService.getStaff(ownerId);
      return sendSuccess(res, staff, 'Staff members retrieved successfully');
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to retrieve staff members', 500);
    }
  }

  public static async createStaff(req: Request, res: Response) {
    try {
      const ownerId = req.user?.ownerId;
      if (!ownerId) {
        return sendError(res, 'Unauthorized', 401);
      }

      const { full_name, email, mobile_number, password, role_id, branch_id } = req.body;
      if (!full_name || !email || !mobile_number || !password || !role_id) {
        return sendError(res, 'Full name, email, mobile number, password, and role are required', 400);
      }

      const staff = await RbacService.createStaff(ownerId, {
        full_name,
        email,
        mobile_number,
        password,
        role_id: Number(role_id),
        branch_id: branch_id || undefined,
      });
      return sendSuccess(res, staff, 'Staff member created successfully', 201);
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to create staff member', 400);
    }
  }

  public static async updateStaff(req: Request, res: Response) {
    try {
      const ownerId = req.user?.ownerId;
      if (!ownerId) {
        return sendError(res, 'Unauthorized', 401);
      }

      const staffId = req.params.id;
      if (!staffId) {
        return sendError(res, 'Staff ID is required', 400);
      }

      const { full_name, mobile_number, is_active, role_id, branch_id, password } = req.body;
      const staff = await RbacService.updateStaff(ownerId, staffId, {
        full_name,
        mobile_number,
        is_active,
        role_id: role_id ? Number(role_id) : undefined,
        branch_id,
        password,
      });
      return sendSuccess(res, staff, 'Staff member updated successfully');
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to update staff member', 400);
    }
  }

  public static async deleteStaff(req: Request, res: Response) {
    try {
      const ownerId = req.user?.ownerId;
      if (!ownerId) {
        return sendError(res, 'Unauthorized', 401);
      }

      const staffId = req.params.id;
      if (!staffId) {
        return sendError(res, 'Staff ID is required', 400);
      }

      const result = await RbacService.deleteStaff(ownerId, staffId);
      return sendSuccess(res, result, result.message);
    } catch (error: any) {
      return sendError(res, error.message || 'Failed to delete staff member', 400);
    }
  }
}
