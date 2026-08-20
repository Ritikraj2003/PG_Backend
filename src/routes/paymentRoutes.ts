import { Router } from 'express';
import { PaymentController } from '../controllers/paymentController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/razorpay/order', authenticate, PaymentController.createRazorpayOrder);
router.post('/razorpay/verify', authenticate, PaymentController.verifyPayment);
router.post('/razorpay/webhook', PaymentController.razorpayWebhook);

export default router;
