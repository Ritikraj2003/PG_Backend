import { Request, Response } from 'express';
import { CronService } from '../services/cronService';
import { sendSuccess, sendError } from '../utils/response';

export class CronController {
  public static async rentReminder(req: Request, res: Response) {
    try {
      const result = await CronService.runRentReminders();
      return sendSuccess(res, result, 'Rent reminder cron executed');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async overdueRent(req: Request, res: Response) {
    try {
      const result = await CronService.runOverdueRentCheck();
      return sendSuccess(res, result, 'Overdue rent cron executed');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async checkInReminder(req: Request, res: Response) {
    try {
      const result = await CronService.runCheckInReminders();
      return sendSuccess(res, result, 'Check-in reminder cron executed');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async checkOutReminder(req: Request, res: Response) {
    try {
      const result = await CronService.runCheckOutReminders();
      return sendSuccess(res, result, 'Check-out reminder cron executed');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }
}
