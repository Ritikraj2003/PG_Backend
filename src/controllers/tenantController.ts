import { Request, Response } from 'express';
import { TenantService } from '../services/tenantService';
import { sendSuccess, sendError } from '../utils/response';

export class TenantController {
  public static async getDashboard(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const data = await TenantService.getDashboardData(userId);
      return sendSuccess(res, data, 'Tenant dashboard retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async createBooking(req: Request, res: Response) {
    try {
      const data = { ...req.body, user_id: req.user!.id };
      const booking = await TenantService.createBooking(data);
      return sendSuccess(res, booking, 'Booking created successfully', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getBookings(req: Request, res: Response) {
    try {
      const bookings = await TenantService.getBookings(req.user!.id);
      return sendSuccess(res, bookings, 'Bookings retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async submitManualPayment(req: Request, res: Response) {
    try {
      let screenshot_url = req.body.screenshot_url;
      if (req.file) {
        screenshot_url = `/uploads/${req.file.filename}`;
      }
      if (!screenshot_url) {
        return sendError(res, 'Payment screenshot is required', 400);
      }

      const data = { ...req.body, user_id: req.user!.id, screenshot_url };
      const payment = await TenantService.submitManualPayment(data);
      return sendSuccess(res, payment, 'Manual payment submitted for verification', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getBranchSettings(req: Request, res: Response) {
    try {
      const { branch_id } = req.query;
      const settings = await TenantService.getBranchSettings(branch_id as string);
      return sendSuccess(res, settings, 'Branch settings retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async createComplaint(req: Request, res: Response) {
    try {
      const data = { ...req.body, user_id: req.user!.id };
      const complaint = await TenantService.createComplaint(data);
      return sendSuccess(res, complaint, 'Complaint raised', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getComplaints(req: Request, res: Response) {
    try {
      const complaints = await TenantService.getComplaints(req.user!.id);
      return sendSuccess(res, complaints, 'Complaints retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async getInvoices(req: Request, res: Response) {
    try {
      const invoices = await TenantService.getInvoices(req.user!.id);
      return sendSuccess(res, invoices, 'Invoices retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async getPayments(req: Request, res: Response) {
    try {
      const payments = await TenantService.getPayments(req.user!.id);
      return sendSuccess(res, payments, 'Payments retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }
}
