import { Request, Response } from 'express';
import { OwnerService } from '../services/ownerService';
import { PaymentService } from '../services/paymentService';
import { StorageService } from '../services/storageService';
import { sendSuccess, sendError } from '../utils/response';

export class OwnerController {
  // PLATFORM PAYMENT INFO (SuperAdmin Credentials)
  public static async getPlatformPaymentInfo(req: Request, res: Response) {
    try {
      const info = await OwnerService.getPlatformPaymentInfo();
      return sendSuccess(res, info, 'Platform payment info retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // CREATE RAZORPAY SUBSCRIPTION ORDER (Routes to SuperAdmin account)
  public static async createSubscriptionOrder(req: Request, res: Response) {
    try {
      const { amount, plan_id, branch_id } = req.body;
      if (!amount || parseFloat(amount) <= 0) {
        return sendError(res, 'Valid amount is required', 400);
      }

      // Crucial: No branchId passed to getRazorpayClient, so PaymentService picks SuperAdmin keys (branch_id IS NULL)!
      const order = await PaymentService.createRazorpayOrder(
        parseFloat(amount),
        'INR',
        `sub_${Date.now().toString().slice(-8)}`
      );
      return sendSuccess(res, order, 'Subscription payment order created');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // VERIFY RAZORPAY SUBSCRIPTION PAYMENT & RENEW
  public static async verifySubscriptionPayment(req: Request, res: Response) {
    try {
      const ownerId = req.user!.ownerId || req.user!.id;
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        branch_id,
        plan_id,
        duration_months,
      } = req.body;

      if (!branch_id || !plan_id) {
        return sendError(res, 'branch_id and plan_id are required', 400);
      }

      // Verify signature against SuperAdmin Razorpay Secret (branchId undefined)
      const isValid = await PaymentService.verifySignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );
      if (!isValid) {
        return sendError(res, 'Invalid Razorpay payment signature', 400);
      }

      const subscription = await OwnerService.renewSubscription(ownerId, {
        branch_id,
        plan_id,
        duration_months,
        payment_method: 'RAZORPAY',
        transaction_id: razorpay_payment_id,
        payment_status: 'PAID',
      });

      return sendSuccess(res, subscription, 'Subscription payment verified and branch renewed successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  // DASHBOARD
  public static async getDashboard(req: Request, res: Response) {
    try {
      const ownerId = req.user!.ownerId || req.user!.id;
      const branchId = (req.query.branch_id as string | undefined) || req.user?.branchId;
      const dashboard = await OwnerService.getDashboardData(ownerId, branchId, req.user?.branchId);
      return sendSuccess(res, dashboard, 'Owner dashboard retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async renewSubscription(req: Request, res: Response) {
    try {
      const ownerId = req.user!.ownerId || req.user!.id;
      const data = {
        ...req.body,
        branch_id: req.params.id || req.body.branch_id,
      };
      const subscription = await OwnerService.renewSubscription(ownerId, data);
      return sendSuccess(res, subscription, 'Subscription renewed successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getBranches(req: Request, res: Response) {
    try {
      const ownerId = req.user!.ownerId || req.user!.id;
      const branches = await OwnerService.getOwnerBranches(ownerId, req.user?.branchId);
      return sendSuccess(res, branches, 'Owner branches retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // BRANCH SETTINGS
  public static async getBranchSettings(req: Request, res: Response) {
    try {
      const { branch_id } = req.query;
      if (!branch_id) return sendError(res, 'branch_id is required', 400);
      const settings = await OwnerService.getBranchSettings(branch_id as string);
      return sendSuccess(res, settings, 'Branch settings retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async updateBranchSettings(req: Request, res: Response) {
    try {
      const {
        branch_id, razorpay_key, razorpay_secret, upi_id,
        smtp_email, smtp_password, smtp_host, smtp_port, smtp_username, smtp_display_name,
        mail, user_name, display_name, password, host, port
      } = req.body;
      const data = {
        razorpay_key, razorpay_secret, upi_id,
        smtp_email: mail || smtp_email,
        smtp_password: password || smtp_password,
        smtp_host: host || smtp_host,
        smtp_port: port || smtp_port,
        smtp_username: user_name || smtp_username,
        smtp_display_name: display_name || smtp_display_name,
        mail: mail || smtp_email,
        user_name: user_name || smtp_username,
        display_name: display_name || smtp_display_name,
        password: password || smtp_password,
        host: host || smtp_host,
        port: port || smtp_port,
      };
      const settings = await OwnerService.updateBranchSettings(branch_id, data);
      return sendSuccess(res, settings, 'Branch settings updated');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  // ROOMS & BEDS
  public static async createRoom(req: Request, res: Response) {
    try {
      const roomData = {
        branch_id: req.body.branch_id,
        floor_number: req.body.floor_number ? parseInt(req.body.floor_number) : 1,
        room_number: req.body.room_number,
        room_type: req.body.room_type,
        monthly_rent: req.body.monthly_rent ? parseFloat(req.body.monthly_rent) : 0,
        security_deposit: req.body.security_deposit ? parseFloat(req.body.security_deposit) : 0,
        capacity: req.body.capacity ? parseInt(req.body.capacity) : 1,
      };
      const room = await OwnerService.createRoom(roomData);
      return sendSuccess(res, room, 'Room created successfully', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getRooms(req: Request, res: Response) {
    try {
      const branch_id = req.user?.branchId || (req.query.branch_id as string);
      const rooms = await OwnerService.getRooms(branch_id);
      return sendSuccess(res, rooms, 'Rooms list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async createBed(req: Request, res: Response) {
    try {
      const bed = await OwnerService.createBed(req.body);
      return sendSuccess(res, bed, 'Bed created successfully', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getBeds(req: Request, res: Response) {
    try {
      const { room_id } = req.query;
      const beds = await OwnerService.getBeds(room_id as string);
      return sendSuccess(res, beds, 'Beds list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async updateBed(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const bed = await OwnerService.updateBed(id, req.body);
      return sendSuccess(res, bed, 'Bed updated successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async deleteBed(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const bed = await OwnerService.deleteBed(id);
      return sendSuccess(res, bed, 'Bed deleted successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  // TENANTS & BOOKINGS
  public static async getTenants(req: Request, res: Response) {
    try {
      const branch_id = req.user?.branchId || (req.query.branch_id as string);
      const tenants = await OwnerService.getTenants(branch_id);
      return sendSuccess(res, tenants, 'Tenants list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async getBookings(req: Request, res: Response) {
    try {
      const branch_id = req.user?.branchId || (req.query.branch_id as string);
      const bookings = await OwnerService.getBookings(branch_id);
      return sendSuccess(res, bookings, 'Bookings list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async updateBookingStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, remarks, refund_amount } = req.body;
      const refund = refund_amount ? parseFloat(refund_amount) : undefined;
      const booking = await OwnerService.updateBookingStatus(id, status, remarks, refund);
      return sendSuccess(res, booking, 'Booking status updated');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  // RENT INVOICES & PAYMENTS
  public static async createRentInvoice(req: Request, res: Response) {
    try {
      const invoice = await OwnerService.createRentInvoice(req.body);
      return sendSuccess(res, invoice, 'Rent invoice generated successfully', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async generateBulkInvoices(req: Request, res: Response) {
    try {
      const { branch_id, invoice_month, due_date } = req.body;
      const result = await OwnerService.generateBulkInvoices(branch_id, invoice_month, due_date);
      return sendSuccess(res, result, 'Bulk invoices generated successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getRentInvoices(req: Request, res: Response) {
    try {
      const branch_id = req.user?.branchId || (req.query.branch_id as string);
      const invoices = await OwnerService.getRentInvoices(branch_id);
      return sendSuccess(res, invoices, 'Invoices list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async getPayments(req: Request, res: Response) {
    try {
      const branch_id = req.user?.branchId || (req.query.branch_id as string);
      const payments = await OwnerService.getPayments(branch_id);
      return sendSuccess(res, payments, 'Payments list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async verifyManualPayment(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, remarks } = req.body;
      const payment = await OwnerService.verifyManualPayment(id, status, remarks);
      return sendSuccess(res, payment, 'Payment verified successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  // COMPLAINTS
  public static async getComplaints(req: Request, res: Response) {
    try {
      const branch_id = req.user?.branchId || (req.query.branch_id as string);
      const complaints = await OwnerService.getComplaints(branch_id);
      return sendSuccess(res, complaints, 'Complaints list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async updateComplaintStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const resolvedBy = status === 'RESOLVED' ? req.user!.id : undefined;
      const complaint = await OwnerService.updateComplaintStatus(id, status, resolvedBy);
      return sendSuccess(res, complaint, 'Complaint status updated');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  // EXPENSES
  public static async createExpense(req: Request, res: Response) {
    try {
      let receipt_url = req.body.receipt_url;
      if (req.file) {
        receipt_url = await StorageService.uploadFile(req.file.path, 'pg_expenses');
        try {
          const fs = require('fs');
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        } catch (e) {}
      }
      const data = { ...req.body, receipt_url };
      const expense = await OwnerService.createExpense(data);
      return sendSuccess(res, expense, 'Expense recorded', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getExpenses(req: Request, res: Response) {
    try {
      const branch_id = req.user?.branchId || (req.query.branch_id as string);
      const expenses = await OwnerService.getExpenses(branch_id);
      return sendSuccess(res, expenses, 'Expenses list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // NOTICES
  public static async createNotice(req: Request, res: Response) {
    try {
      const notice = await OwnerService.createNotice(req.body);
      return sendSuccess(res, notice, 'Notice created', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getNotices(req: Request, res: Response) {
    try {
      const branch_id = req.user?.branchId || (req.query.branch_id as string);
      const notices = await OwnerService.getNotices(branch_id);
      return sendSuccess(res, notices, 'Notices list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async deleteNotice(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await OwnerService.deleteNotice(id);
      return sendSuccess(res, null, 'Notice deleted');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  // STAFF
  public static async createStaff(req: Request, res: Response) {
    try {
      const staff = await OwnerService.createStaff(req.body);
      return sendSuccess(res, staff, 'Staff created successfully', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getStaff(req: Request, res: Response) {
    try {
      const { branch_id } = req.query;
      const staff = await OwnerService.getStaff(branch_id as string);
      return sendSuccess(res, staff, 'Staff list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // REPORTS
  public static async getBranchReports(req: Request, res: Response) {
    try {
      const { branch_id } = req.query;
      const reports = await OwnerService.getBranchReports(branch_id as string);
      return sendSuccess(res, reports, 'Branch operational report generated');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }
}
