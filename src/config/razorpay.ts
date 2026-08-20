import Razorpay from 'razorpay';
import { config } from './env';

export const razorpayInstance = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

export default razorpayInstance;
