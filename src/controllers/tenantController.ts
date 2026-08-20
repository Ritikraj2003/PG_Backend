import { Request, Response } from 'express';
import { TenantService } from '../services/tenantService';
import { sendSuccess, sendError } from '../utils/response';

export class TenantController {
  public static async getDashboard(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const dashboard = await TenantService.getTenantDashboard(userId);
      return sendSuccess(res, dashboard, 'Tenant dashboard retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async createBooking(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const booking = await TenantService.createBooking(userId, req.body);
      return sendSuccess(res, booking, 'Booking request submitted successfully', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getBookings(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const bookings = await TenantService.getTenantBookings(userId);
      return sendSuccess(res, bookings, 'Tenant bookings list');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async createComplaint(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const complaint = await TenantService.createComplaint(userId, req.body);
      return sendSuccess(res, complaint, 'Complaint submitted successfully', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getComplaints(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const complaints = await TenantService.getTenantComplaints(userId);
      return sendSuccess(res, complaints, 'Tenant complaints list');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async getInvoices(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const invoices = await TenantService.getTenantInvoices(userId);
      return sendSuccess(res, invoices, 'Tenant rent invoices');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async getPayments(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const payments = await TenantService.getTenantPayments(userId);
      return sendSuccess(res, payments, 'Tenant payment history');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }
}
