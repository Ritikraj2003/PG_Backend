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

  public static async getNearbyPGs(req: Request, res: Response) {
    try {
      const {
        lat,
        lng,
        radius,
        search,
        gender,
        min_rent,
        max_rent,
        room_type,
        food,
        ac,
        sort_by,
      } = req.query;

      const options = {
        lat: lat !== undefined ? parseFloat(lat as string) : undefined,
        lng: lng !== undefined ? parseFloat(lng as string) : undefined,
        radius: radius !== undefined ? parseFloat(radius as string) : 40,
        search: search as string | undefined,
        gender: gender as string | undefined,
        min_rent: min_rent !== undefined ? parseFloat(min_rent as string) : undefined,
        max_rent: max_rent !== undefined ? parseFloat(max_rent as string) : undefined,
        room_type: room_type as string | undefined,
        food: food !== undefined ? food === 'true' || food === '1' : undefined,
        ac: ac !== undefined ? ac === 'true' || ac === '1' : undefined,
        sort_by: sort_by as string | undefined,
      };

      const pgs = await PublicService.getNearbyPGs(options);
      return sendSuccess(res, pgs, 'Nearby PGs retrieved successfully');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async getPGById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { lat, lng } = req.query;
      const userLat = lat !== undefined ? parseFloat(lat as string) : undefined;
      const userLng = lng !== undefined ? parseFloat(lng as string) : undefined;

      const pg = await PublicService.getPGById(id, userLat, userLng);
      return sendSuccess(res, pg, 'PG details retrieved successfully');
    } catch (err: any) {
      return sendError(res, err.message, 404);
    }
  }
}

