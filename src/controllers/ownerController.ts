import { Request, Response } from 'express';
import { OwnerService } from '../services/ownerService';
import { sendSuccess, sendError } from '../utils/response';

export class OwnerController {
  public static async getDashboard(req: Request, res: Response) {
    try {
      const ownerId = req.user!.ownerId;
      if (!ownerId) return sendError(res, 'User is not a property owner', 403);

      const dashboard = await OwnerService.getDashboardData(ownerId);
      return sendSuccess(res, dashboard, 'Owner dashboard retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async getBranches(req: Request, res: Response) {
    try {
      const ownerId = req.user!.ownerId;
      if (!ownerId) return sendError(res, 'User is not a property owner', 403);

      const branches = await OwnerService.getOwnerBranches(ownerId);
      return sendSuccess(res, branches, 'Owner branches retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // Floors
  public static async createFloor(req: Request, res: Response) {
    try {
      const { branch_id, floor_number, floor_name, description } = req.body;
      const floor = await OwnerService.createFloor(branch_id, floor_number, floor_name, description);
      return sendSuccess(res, floor, 'Floor created', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getFloors(req: Request, res: Response) {
    try {
      const { branch_id } = req.query;
      const floors = await OwnerService.getFloors(branch_id as string);
      return sendSuccess(res, floors, 'Floors list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async updateFloor(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { floor_number, floor_name, description } = req.body;
      const floor = await OwnerService.updateFloor(id, floor_number, floor_name, description);
      return sendSuccess(res, floor, 'Floor updated successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async deleteFloor(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await OwnerService.deleteFloor(id);
      return sendSuccess(res, result, 'Floor deleted successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  // Room Types
  public static async createRoomType(req: Request, res: Response) {
    try {
      const { name, capacity, description } = req.body;
      const roomType = await OwnerService.createRoomType(name, capacity, description);
      return sendSuccess(res, roomType, 'Room type created', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getRoomTypes(req: Request, res: Response) {
    try {
      const types = await OwnerService.getRoomTypes();
      return sendSuccess(res, types, 'Room types retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // Rooms
  public static async createRoom(req: Request, res: Response) {
    try {
      let imageUrls: string[] = [];

      // Extract files uploaded via multipart/form-data
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        imageUrls = (req.files as Express.Multer.File[]).map((file) => `/uploads/${file.filename}`);
      } else if (req.body.images) {
        if (typeof req.body.images === 'string') {
          try {
            imageUrls = JSON.parse(req.body.images);
          } catch {
            imageUrls = [req.body.images];
          }
        } else if (Array.isArray(req.body.images)) {
          imageUrls = req.body.images;
        }
      }

      const roomData = {
        branch_id: req.body.branch_id,
        floor_id: req.body.floor_id || undefined,
        room_type_id: req.body.room_type_id || undefined,
        room_number: req.body.room_number,
        room_name: req.body.room_name || undefined,
        monthly_rent: req.body.monthly_rent ? parseFloat(req.body.monthly_rent) : 0,
        security_deposit: req.body.security_deposit ? parseFloat(req.body.security_deposit) : 0,
        electricity_charge: req.body.electricity_charge ? parseFloat(req.body.electricity_charge) : 0,
        maintenance_charge: req.body.maintenance_charge ? parseFloat(req.body.maintenance_charge) : 0,
        description: req.body.description || undefined,
        images: imageUrls,
        capacity: req.body.capacity ? parseInt(req.body.capacity) : undefined,
      };

      const room = await OwnerService.createRoom(roomData);
      return sendSuccess(res, room, 'Room created successfully', 201);
    } catch (err: any) {
      console.error('Error in createRoom:', err);
      return sendError(res, err.message, 400);
    }
  }

  public static async getRooms(req: Request, res: Response) {
    try {
      const { branch_id } = req.query;
      const rooms = await OwnerService.getRooms(branch_id as string);
      return sendSuccess(res, rooms, 'Rooms list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // Beds
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

  // Tenants
  public static async getTenants(req: Request, res: Response) {
    try {
      const { branch_id } = req.query;
      const tenants = await OwnerService.getTenants(branch_id as string);
      return sendSuccess(res, tenants, 'Tenants list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // Bookings
  public static async getBookings(req: Request, res: Response) {
    try {
      const { branch_id } = req.query;
      const bookings = await OwnerService.getBookings(branch_id as string);
      return sendSuccess(res, bookings, 'Bookings list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async updateBookingStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, remarks } = req.body;
      const booking = await OwnerService.updateBookingStatus(id, status, remarks);
      return sendSuccess(res, booking, 'Booking status updated');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  // Check-In / Check-Out
  public static async processCheckIn(req: Request, res: Response) {
    try {
      const result = await OwnerService.processCheckIn(req.body);
      return sendSuccess(res, result, 'Check-in processed successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async processCheckOut(req: Request, res: Response) {
    try {
      const result = await OwnerService.processCheckOut(req.body);
      return sendSuccess(res, result, 'Check-out processed successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  // Rent Invoices & Payments
  public static async createRentInvoice(req: Request, res: Response) {
    try {
      const invoice = await OwnerService.createRentInvoice(req.body);
      return sendSuccess(res, invoice, 'Rent invoice generated successfully', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getRentInvoices(req: Request, res: Response) {
    try {
      const { branch_id } = req.query;
      const invoices = await OwnerService.getRentInvoices(branch_id as string);
      return sendSuccess(res, invoices, 'Invoices list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async getRentPayments(req: Request, res: Response) {
    try {
      const { branch_id } = req.query;
      const payments = await OwnerService.getRentPayments(branch_id as string);
      return sendSuccess(res, payments, 'Rent payments list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // Complaints
  public static async getComplaints(req: Request, res: Response) {
    try {
      const { branch_id } = req.query;
      const complaints = await OwnerService.getComplaints(branch_id as string);
      return sendSuccess(res, complaints, 'Complaints list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async updateComplaintStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, resolution_note } = req.body;
      const complaint = await OwnerService.updateComplaintStatus(id, status, resolution_note);
      return sendSuccess(res, complaint, 'Complaint status updated');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  // Staff
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

  // Expenses
  public static async createExpenseCategory(req: Request, res: Response) {
    try {
      const { branch_id, category_name, description } = req.body;
      const category = await OwnerService.createExpenseCategory(branch_id, category_name, description);
      return sendSuccess(res, category, 'Expense category created', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async createExpense(req: Request, res: Response) {
    try {
      const expense = await OwnerService.createExpense(req.body);
      return sendSuccess(res, expense, 'Expense recorded', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async getExpenses(req: Request, res: Response) {
    try {
      const { branch_id } = req.query;
      const expenses = await OwnerService.getExpenses(branch_id as string);
      return sendSuccess(res, expenses, 'Expenses list retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  // Reports
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
