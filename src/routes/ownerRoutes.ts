import { Router } from 'express';
import { OwnerController } from '../controllers/ownerController';
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
    cb(null, `room-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate, authorizeRoles('OWNER', 'STAFF', 'SUPER_ADMIN'));

router.get('/dashboard', OwnerController.getDashboard);
router.get('/branches', OwnerController.getBranches);

// Branch master routes with branch security verification
router.post('/floors', verifyBranchOwnership, OwnerController.createFloor);
router.get('/floors', OwnerController.getFloors);
router.put('/floors/:id', OwnerController.updateFloor);
router.delete('/floors/:id', OwnerController.deleteFloor);

router.post('/room-types', OwnerController.createRoomType);
router.get('/room-types', OwnerController.getRoomTypes);

router.post('/rooms', upload.array('images', 10), verifyBranchOwnership, OwnerController.createRoom);
router.get('/rooms', OwnerController.getRooms);

router.post('/beds', verifyBranchOwnership, OwnerController.createBed);
router.get('/beds', OwnerController.getBeds);
router.put('/beds/:id', OwnerController.updateBed);
router.delete('/beds/:id', OwnerController.deleteBed);

router.get('/tenants', OwnerController.getTenants);

router.get('/bookings', OwnerController.getBookings);
router.put('/bookings/:id/status', OwnerController.updateBookingStatus);

router.post('/check-ins', verifyBranchOwnership, OwnerController.processCheckIn);
router.post('/check-outs', verifyBranchOwnership, OwnerController.processCheckOut);

router.post('/rent/invoices', verifyBranchOwnership, OwnerController.createRentInvoice);
router.get('/rent/invoices', OwnerController.getRentInvoices);
router.get('/payments', OwnerController.getRentPayments);

router.get('/complaints', OwnerController.getComplaints);
router.put('/complaints/:id/status', OwnerController.updateComplaintStatus);

router.post('/staff', verifyBranchOwnership, OwnerController.createStaff);
router.get('/staff', OwnerController.getStaff);

router.post('/expenses/categories', verifyBranchOwnership, OwnerController.createExpenseCategory);
router.post('/expenses', verifyBranchOwnership, OwnerController.createExpense);
router.get('/expenses', OwnerController.getExpenses);

router.get('/reports', OwnerController.getBranchReports);

export default router;
