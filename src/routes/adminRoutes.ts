import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AdminController } from '../controllers/adminController';
import { PlanController } from '../controllers/planController';
import { authenticate } from '../middleware/auth';
import { authorizeRoles } from '../middleware/role';

const router = Router();

router.use(authenticate, authorizeRoles('SUPER_ADMIN'));

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
  destination: (_req, _file, cb) => cb(null, getUploadsDir()),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const fieldName = file.fieldname || 'file';
    cb(null, `${fieldName}-${Date.now()}-${Math.round(Math.random() * 1e4)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024,
    fieldSize: 25 * 1024 * 1024,
  },
});

router.post(
  '/owners',
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'kyc_doc', maxCount: 1 },
  ]),
  AdminController.createOwner
);
router.get('/owners', AdminController.listOwners);
router.put('/owners/:id', AdminController.updateOwner);
router.post('/owners/:id/renew-subscription', AdminController.renewOwnerSubscription);
router.delete('/owners/:id', AdminController.deleteOwner);

router.post('/properties', AdminController.createProperty);
router.get('/properties', AdminController.listProperties);

router.post('/branches', AdminController.createBranch);
router.get('/branches', AdminController.listBranches);
router.put('/branches/:id', AdminController.updateBranch);
router.delete('/branches/:id', AdminController.deleteBranch);
router.post('/branches/:id/renew-subscription', AdminController.renewBranchSubscription);

// Subscription Plans CRUD
router.get('/plans', PlanController.listPlans);
router.get('/plans/:id', PlanController.getPlan);
router.post('/plans', PlanController.createPlan);
router.put('/plans/:id', PlanController.updatePlan);
router.delete('/plans/:id', PlanController.deletePlan);

router.get('/users', AdminController.listUsers);
router.get('/reports', AdminController.getGlobalReports);

// General Settings (SuperAdmin Platform Credentials)
const uploadAdminQrFields = upload.fields([
  { name: 'upi_qr', maxCount: 1 },
  { name: 'qr_image', maxCount: 1 }
]);
const normalizeAdminQrFile = (req: any, res: any, next: any) => {
  if (req.files) {
    req.file = req.files['upi_qr']?.[0] || req.files['qr_image']?.[0];
  }
  next();
};
router.get('/general-settings', AdminController.getGeneralSettings);
router.put('/general-settings', uploadAdminQrFields, normalizeAdminQrFile, AdminController.updateGeneralSettings);
router.post('/general-settings', uploadAdminQrFields, normalizeAdminQrFile, AdminController.updateGeneralSettings);

export default router;
