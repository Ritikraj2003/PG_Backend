import { Request, Response } from 'express';
import { PublicService } from '../services/publicService';
import { sendSuccess, sendError } from '../utils/response';

export class PublicController {
  public static async getProperties(req: Request, res: Response) {
    try {
      const { city, type } = req.query;
      const properties = await PublicService.getProperties(city as string, type as string);
      return sendSuccess(res, properties, 'Properties retrieved successfully');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async getPropertyById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const property = await PublicService.getPropertyById(id);
      return sendSuccess(res, property, 'Property details retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 404);
    }
  }

  public static async getBranchById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const branch = await PublicService.getBranchById(id);
      return sendSuccess(res, branch, 'Branch details retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 404);
    }
  }

  public static async getRooms(req: Request, res: Response) {
    try {
      const { branch_id, min_rent, max_rent, status } = req.query;
      const minRentNum = min_rent ? parseFloat(min_rent as string) : undefined;
      const maxRentNum = max_rent ? parseFloat(max_rent as string) : undefined;

      const rooms = await PublicService.getRooms(branch_id as string, minRentNum, maxRentNum, status as string);
      return sendSuccess(res, rooms, 'Rooms retrieved successfully');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async getRoomById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const room = await PublicService.getRoomById(id);
      return sendSuccess(res, room, 'Room details retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 404);
    }
  }

  public static async getRoomAvailability(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const availability = await PublicService.getRoomAvailability(id);
      return sendSuccess(res, availability, 'Room availability fetched');
    } catch (err: any) {
      return sendError(res, err.message, 404);
    }
  }
}
