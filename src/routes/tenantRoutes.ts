import { Router } from 'express';
import { TenantController } from '../controllers/tenantController';
import { authenticate } from '../middleware/auth';
import { authorizeRoles } from '../middleware/role';

const router = Router();

router.use(authenticate, authorizeRoles('TENANT', 'SUPER_ADMIN'));

router.get('/dashboard', TenantController.getDashboard);
router.post('/booking', TenantController.createBooking);
router.get('/booking', TenantController.getBookings);

router.post('/complaints', TenantController.createComplaint);
router.get('/complaints', TenantController.getComplaints);

router.get('/rent', TenantController.getInvoices);
router.get('/payments', TenantController.getPayments);

export default router;
