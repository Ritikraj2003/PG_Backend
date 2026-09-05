import { Request, Response } from 'express';
import { PlanService } from '../services/planService';
import { sendSuccess, sendError } from '../utils/response';

export class PlanController {
  public static async listPlans(req: Request, res: Response) {
    try {
      const activeOnly = req.query.active_only === 'true';
      const plans = await PlanService.listPlans(activeOnly);
      return sendSuccess(res, plans, 'Subscription plans retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async getPlan(req: Request, res: Response) {
    try {
      const plan = await PlanService.getPlanById(req.params.id);
      return sendSuccess(res, plan, 'Subscription plan retrieved');
    } catch (err: any) {
      return sendError(res, err.message, 404);
    }
  }

  public static async createPlan(req: Request, res: Response) {
    try {
      const plan = await PlanService.createPlan(req.body);
      return sendSuccess(res, plan, 'Subscription plan created successfully', 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async updatePlan(req: Request, res: Response) {
    try {
      const plan = await PlanService.updatePlan(req.params.id, req.body);
      return sendSuccess(res, plan, 'Subscription plan updated successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async deletePlan(req: Request, res: Response) {
    try {
      const plan = await PlanService.deletePlan(req.params.id);
      return sendSuccess(res, plan, 'Subscription plan deactivated successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }
}
