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

// 40 KM Radius Location-Based PG Discovery & Details
router.get('/locations', PublicController.getRegisteredLocations);
router.get('/pgs/nearby', PublicController.getNearbyPGs);
router.get('/pgs/:id', PublicController.getPGById);

router.get('/rooms', PublicController.getRooms);
router.get('/rooms/:id', PublicController.getRoomById);
router.get('/rooms/:id/availability', PublicController.getRoomAvailability);

export default router;

