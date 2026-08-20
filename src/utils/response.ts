import { Response } from 'express';

export const sendSuccess = (
  res: Response,
  data: any = null,
  message: string = 'Success',
  statusCode: number = 200
) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const sendError = (
  res: Response,
  message: string = 'Internal Server Error',
  statusCode: number = 500,
  error: any = null
) => {
  return res.status(statusCode).json({
    success: false,
    message,
    error: error ? error.message || error : undefined,
  });
};
