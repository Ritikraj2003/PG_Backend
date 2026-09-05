import { Router } from 'express';
import { OwnerController } from '../controllers/ownerController';
import { RbacController } from '../controllers/rbacController';
import { authenticate } from '../middleware/auth';
import { authorizeRoles } from '../middleware/role';
import { verifyBranchOwnership } from '../middleware/branchAuth';

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';

const getUploadsDir = () => {
  const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  const baseDir = isVercel ? os.tmpdir() : process.cwd();
  const dir = path.join(baseDir, 'uploads');
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn('Could not create uploads dir:', err);
  }
  return dir;
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getUploadsDir());
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `img-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate, authorizeRoles('COMPANY_ADMIN', 'STAFF', 'SUPER_ADMIN'));

router.get('/dashboard', OwnerController.getDashboard);
router.get('/platform-payment-info', OwnerController.getPlatformPaymentInfo);
router.post('/subscription/create-order', OwnerController.createSubscriptionOrder);
router.post('/subscription/verify-and-renew', OwnerController.verifySubscriptionPayment);
router.post('/subscription/renew', OwnerController.renewSubscription);
router.post('/branches/:id/renew-subscription', OwnerController.renewSubscription);
router.get('/branches', OwnerController.getBranches);

// Branch Settings
router.get('/branch-settings', OwnerController.getBranchSettings);
router.put('/branch-settings', upload.single('qr_image'), OwnerController.updateBranchSettings);

// Rooms
router.post('/rooms', upload.array('images', 10), verifyBranchOwnership, OwnerController.createRoom);
router.get('/rooms', OwnerController.getRooms);

// Beds
router.post('/beds', verifyBranchOwnership, OwnerController.createBed);
router.get('/beds', OwnerController.getBeds);
router.put('/beds/:id', OwnerController.updateBed);
router.delete('/beds/:id', OwnerController.deleteBed);

// Tenants & Bookings
router.get('/tenants', OwnerController.getTenants);
router.get('/bookings', OwnerController.getBookings);
router.put('/bookings/:id/status', OwnerController.updateBookingStatus); // Handles check-out as well

// Rent Invoices & Payments
router.post('/rent/invoices', verifyBranchOwnership, OwnerController.createRentInvoice);
router.post('/rent/invoices/generate-bulk', verifyBranchOwnership, OwnerController.generateBulkInvoices);
router.get('/rent/invoices', OwnerController.getRentInvoices);
router.get('/payments', OwnerController.getPayments);
router.put('/payments/:id/verify', OwnerController.verifyManualPayment);
router.post('/payments/:id/verify', OwnerController.verifyManualPayment);

// Complaints
router.get('/complaints', OwnerController.getComplaints);
router.put('/complaints/:id/status', OwnerController.updateComplaintStatus);

// Expenses
router.post('/expenses', upload.single('receipt'), verifyBranchOwnership, OwnerController.createExpense);
router.get('/expenses', OwnerController.getExpenses);

// Notices
router.post('/notices', verifyBranchOwnership, OwnerController.createNotice);
router.get('/notices', OwnerController.getNotices);
router.delete('/notices/:id', OwnerController.deleteNotice);

// Roles & Permissions (RBAC)
router.get('/permissions', RbacController.getPermissions);
router.get('/roles', RbacController.getRoles);
router.post('/roles', RbacController.createRole);
router.put('/roles/:id', RbacController.updateRole);
router.delete('/roles/:id', RbacController.deleteRole);

// Staff / Team Management (RBAC)
router.get('/team', RbacController.getStaff);
router.post('/team', RbacController.createStaff);
router.put('/team/:id', RbacController.updateStaff);
router.delete('/team/:id', RbacController.deleteStaff);

// Staff Legacy Mapping
router.post('/staff', verifyBranchOwnership, OwnerController.createStaff);
router.get('/staff', OwnerController.getStaff);

router.get('/reports', OwnerController.getBranchReports);

export default router;
