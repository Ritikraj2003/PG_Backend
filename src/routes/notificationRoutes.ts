import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/device-token', authenticate, NotificationController.registerDeviceToken);

export default router;
