import { Request, Response } from 'express';
import { AuthService } from '../services/authService';
import { sendSuccess, sendError } from '../utils/response';

export class AuthController {
  public static async register(req: Request, res: Response) {
    try {
      const { full_name, email, mobile_number, password, role, branch_id } = req.body;
      if (!full_name || !email || !mobile_number || !password) {
        return sendError(res, 'Full name, email, mobile number and password are required', 400);
      }

      const result = await AuthService.register({ full_name, email, mobile_number, password, role, branch_id });
      return sendSuccess(res, result, 'User registered successfully', 201);
    } catch (err: any) {
      return sendError(res, err.message || 'Registration failed', 400);
    }
  }

  public static async login(req: Request, res: Response) {
    try {
      const { emailOrMobile, password } = req.body;
      if (!emailOrMobile || !password) {
        return sendError(res, 'Email/Mobile and password are required', 400);
      }

      const result = await AuthService.login(emailOrMobile, password);
      return sendSuccess(res, result, 'Login successful');
    } catch (err: any) {
      return sendError(res, err.message || 'Login failed', 401);
    }
  }

  public static async refresh(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return sendError(res, 'Refresh token is required', 400);
      }

      const result = await AuthService.refresh(refreshToken);
      return sendSuccess(res, result, 'Token refreshed successfully');
    } catch (err: any) {
      return sendError(res, err.message || 'Invalid refresh token', 401);
    }
  }

  public static async logout(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await AuthService.logout(refreshToken);
      }
      return sendSuccess(res, null, 'Logged out successfully');
    } catch (err: any) {
      return sendError(res, err.message || 'Logout failed', 400);
    }
  }

  public static async changePassword(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { oldPassword, newPassword } = req.body;
      if (!oldPassword || !newPassword) {
        return sendError(res, 'Old password and new password are required', 400);
      }

      await AuthService.changePassword(userId, oldPassword, newPassword);
      return sendSuccess(res, null, 'Password updated successfully');
    } catch (err: any) {
      return sendError(res, err.message || 'Password update failed', 400);
    }
  }
}
