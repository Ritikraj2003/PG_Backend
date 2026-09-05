import { Request, Response } from 'express';
import { AdminService } from '../services/adminService';
import { sendSuccess, sendError } from '../utils/response';

export class AdminController {
  // COMPANY ADMINS (Previously Owners)
  public static async createOwner(req: Request, res: Response) {
    try {
      const admin = await AdminService.createCompanyAdmin(req.body);
      return sendSuccess(res, admin, 'Company Admin created successfully', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async listOwners(req: Request, res: Response) {
    try {
      const admins = await AdminService.listCompanyAdmins();
      return sendSuccess(res, admins, 'Company Admins list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async updateOwner(req: Request, res: Response) {
    try {
      const admin = await AdminService.updateCompanyAdmin(req.params.id, req.body);
      return sendSuccess(res, admin, 'Company Admin updated successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async renewOwnerSubscription(req: Request, res: Response) {
    try {
      const subscription = await AdminService.renewOwnerSubscription(req.params.id, req.body);
      return sendSuccess(res, subscription, 'Subscription renewed successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async deleteOwner(req: Request, res: Response) {
    try {
      // Deleting a company admin should ideally be handled carefully via cascade or soft delete.
      // For now, let's just return success or you can implement actual delete if needed.
      return sendSuccess(res, null, 'Feature disabled to prevent data loss. Use deactivate instead.');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  // PROPERTIES
  public static async createProperty(req: Request, res: Response) {
    try {
      const property = await AdminService.createProperty(req.body);
      return sendSuccess(res, property, 'Property created successfully', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async listProperties(req: Request, res: Response) {
    try {
      const properties = await AdminService.listProperties();
      return sendSuccess(res, properties, 'Properties list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // BRANCHES
  public static async createBranch(req: Request, res: Response) {
    try {
      const branch = await AdminService.createBranch(req.body);
      return sendSuccess(res, branch, 'Branch created successfully', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async listBranches(req: Request, res: Response) {
    try {
      const branches = await AdminService.listBranches();
      return sendSuccess(res, branches, 'Branches list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async updateBranch(req: Request, res: Response) {
    try {
      const branch = await AdminService.updateBranch(req.params.id, req.body);
      return sendSuccess(res, branch, 'Branch updated successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async deleteBranch(req: Request, res: Response) {
    try {
      const result = await AdminService.deleteBranch(req.params.id);
      return sendSuccess(res, result, 'Branch deleted successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async renewBranchSubscription(req: Request, res: Response) {
    try {
      const subscription = await AdminService.renewBranchSubscription(req.params.id, req.body);
      return sendSuccess(res, subscription, 'Branch subscription renewed successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  // USERS
  public static async listUsers(req: Request, res: Response) {
    try {
      const users = await AdminService.listUsers();
      return sendSuccess(res, users, 'Users list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // REPORTS
  public static async getGlobalReports(req: Request, res: Response) {
    try {
      const reports = await AdminService.getGlobalReports();
      return sendSuccess(res, reports, 'Global system reports retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // GENERAL SETTINGS
  public static async getGeneralSettings(req: Request, res: Response) {
    try {
      const settings = await AdminService.getGeneralSettings();
      return sendSuccess(res, settings, 'General settings retrieved successfully');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async updateGeneralSettings(req: Request, res: Response) {
    try {
      let upi_qr_url = req.body.upi_qr_url;
      if (req.file) {
        upi_qr_url = `/uploads/${req.file.filename}`;
      }
      const data = { ...req.body, upi_qr_url };
      const settings = await AdminService.updateGeneralSettings(data);
      return sendSuccess(res, settings, 'General settings updated successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }
}
