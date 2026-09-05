import { Router } from 'express';
import { PublicController } from '../controllers/publicController';
import { PlanController } from '../controllers/planController';
import { OwnerController } from '../controllers/ownerController';

const router = Router();

router.get('/plans', PlanController.listPlans);
router.get('/platform-payment-info', OwnerController.getPlatformPaymentInfo);
router.get('/properties', PublicController.getProperties);
router.get('/properties/:id', PublicController.getPropertyById);
router.get('/branches/:id', PublicController.getBranchById);
router.get('/rooms', PublicController.getRooms);
router.get('/rooms/:id', PublicController.getRoomById);
router.get('/rooms/:id/availability', PublicController.getRoomAvailability);

export default router;
