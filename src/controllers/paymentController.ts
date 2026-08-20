import { Request, Response } from 'express';
import { PaymentService } from '../services/paymentService';
import { sendSuccess, sendError } from '../utils/response';

export class PaymentController {
  public static async createRazorpayOrder(req: Request, res: Response) {
    try {
      const { amount, receipt } = req.body;
      if (!amount) return sendError(res, 'Amount is required', 400);

      const order = await PaymentService.createRazorpayOrder(amount, 'INR', receipt || `rcpt_${Date.now()}`);
      return sendSuccess(res, order, 'Razorpay order created');
    } catch (err: any) {
      return sendError(res, err.message, 500);
    }
  }

  public static async verifyPayment(req: Request, res: Response) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, rent_invoice_id, booking_id, amount, payment_method } = req.body;

      const isValid = PaymentService.verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
      if (!isValid) {
        return sendError(res, 'Invalid Razorpay payment signature', 400);
      }

      let result;
      if (rent_invoice_id) {
        result = await PaymentService.processRentPaymentSuccess({
          rent_invoice_id,
          amount,
          payment_method: payment_method || 'RAZORPAY',
          transaction_id: razorpay_payment_id,
        });
      } else if (booking_id) {
        result = await PaymentService.processBookingPaymentSuccess({
          booking_id,
          amount,
          payment_method: payment_method || 'RAZORPAY',
          transaction_id: razorpay_payment_id,
        });
      }

      return sendSuccess(res, result, 'Payment verified and recorded successfully');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  }

  public static async razorpayWebhook(req: Request, res: Response) {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      const rawBody = JSON.stringify(req.body);

      const isValid = PaymentService.verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        return res.status(400).send('Invalid signature');
      }

      const event = req.body.event;
      if (event === 'payment.captured') {
        const paymentEntity = req.body.payload.payment.entity;
        console.log('Webhook: Payment Captured', paymentEntity.id);
      }

      return res.status(200).json({ status: 'ok' });
    } catch (err: any) {
      console.error('Webhook error:', err);
      return res.status(500).send('Webhook handler failed');
    }
  }
}
