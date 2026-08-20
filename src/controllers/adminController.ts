import { Request, Response } from 'express';
import { AdminService } from '../services/adminService';
import { sendSuccess, sendError } from '../utils/response';

export class AdminController {
  public static async createOwner(req: Request, res: Response) {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const ownerData = { ...req.body };

      if (files?.['logo']?.[0]) {
        ownerData.logo = `/uploads/${files['logo'][0].filename}`;
      }
      if (files?.['kyc_doc']?.[0]) {
        ownerData.kyc_doc_url = `/uploads/${files['kyc_doc'][0].filename}`;
      }

      const owner = await AdminService.createOwner(ownerData);
      return sendSuccess(res, owner, 'Property Owner created successfully', 201);
    } catch (err: any) {
      console.error('Error in createOwner:', err);
      return sendError(res, err.message, 400);
    }
  }

  public static async listOwners(req: Request, res: Response) {
    try {
      const owners = await AdminService.listOwners();
      return sendSuccess(res, owners, 'Owners list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

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

  public static async listUsers(req: Request, res: Response) {
    try {
      const users = await AdminService.listUsers();
      return sendSuccess(res, users, 'Users list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async getGlobalReports(req: Request, res: Response) {
    try {
      const reports = await AdminService.getGlobalReports();
      return sendSuccess(res, reports, 'Global system reports retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async updateOwner(req: Request, res: Response) {
    try {
      const owner = await AdminService.updateOwner(req.params.id, req.body);
      return sendSuccess(res, owner, 'Property Owner updated successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async deleteOwner(req: Request, res: Response) {
    try {
      const result = await AdminService.deleteOwner(req.params.id);
      return sendSuccess(res, result, 'Property Owner deleted successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
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
}


