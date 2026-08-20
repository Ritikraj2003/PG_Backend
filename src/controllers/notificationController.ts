import { Request, Response } from 'express';
import { NotificationService } from '../services/notificationService';
import { sendSuccess, sendError } from '../utils/response';

export class NotificationController {
  public static async registerDeviceToken(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { token, platform } = req.body;
      if (!token) return sendError(res, 'Device token is required', 400);

      await NotificationService.registerDeviceToken(userId, token, platform);
      return sendSuccess(res, null, 'Device token registered successfully');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }
}
