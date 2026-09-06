import { Router } from 'express';
import { TenantController } from '../controllers/tenantController';
import { authenticate } from '../middleware/auth';
import { authorizeRoles } from '../middleware/role';
import multer from 'multer';
import os from 'os';
import path from 'path';

const getUploadsDir = () => {
  const baseDir = process.env.VERCEL ? os.tmpdir() : process.cwd();
  return path.join(baseDir, 'uploads');
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, getUploadsDir()),
  filename: (_req, file, cb) => cb(null, `qr-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024,
    fieldSize: 25 * 1024 * 1024,
  },
});

const router = Router();

router.use(authenticate, authorizeRoles('USER', 'SUPER_ADMIN'));

router.get('/dashboard', TenantController.getDashboard);
router.post('/booking', TenantController.createBooking);
router.get('/booking', TenantController.getBookings);
router.post('/payments/manual', upload.single('screenshot'), TenantController.submitManualPayment);
router.get('/branch-settings', TenantController.getBranchSettings);

router.post('/complaints', TenantController.createComplaint);
router.get('/complaints', TenantController.getComplaints);

router.get('/rent', TenantController.getInvoices);
router.get('/payments', TenantController.getPayments);

export default router;
