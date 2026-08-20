import { Router } from 'express';
import { PublicController } from '../controllers/publicController';

const router = Router();

router.get('/properties', PublicController.getProperties);
router.get('/properties/:id', PublicController.getPropertyById);
router.get('/branches/:id', PublicController.getBranchById);
router.get('/rooms', PublicController.getRooms);
router.get('/rooms/:id', PublicController.getRoomById);
router.get('/rooms/:id/availability', PublicController.getRoomAvailability);

export default router;
