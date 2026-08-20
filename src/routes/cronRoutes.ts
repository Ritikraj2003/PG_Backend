import { Router } from 'express';
import { CronController } from '../controllers/cronController';

const router = Router();

router.get('/rent-reminder', CronController.rentReminder);
router.get('/overdue-rent', CronController.overdueRent);
router.get('/check-in-reminder', CronController.checkInReminder);
router.get('/check-out-reminder', CronController.checkOutReminder);

export default router;
