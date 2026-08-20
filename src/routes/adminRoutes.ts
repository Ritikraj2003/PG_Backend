import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AdminController } from '../controllers/adminController';
import { authenticate } from '../middleware/auth';
import { authorizeRoles } from '../middleware/role';

const router = Router();

router.use(authenticate, authorizeRoles('SUPER_ADMIN'));

// Configure multer for file uploads in backend/uploads directory
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const fieldName = file.fieldname || 'file';
    cb(null, `${fieldName}-${Date.now()}-${Math.round(Math.random() * 1e4)}${ext}`);
  },
});

const upload = multer({ storage });

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
router.delete('/owners/:id', AdminController.deleteOwner);

router.post('/properties', AdminController.createProperty);
router.get('/properties', AdminController.listProperties);

router.post('/branches', AdminController.createBranch);
router.get('/branches', AdminController.listBranches);
router.put('/branches/:id', AdminController.updateBranch);
router.delete('/branches/:id', AdminController.deleteBranch);

router.get('/users', AdminController.listUsers);
router.get('/reports', AdminController.getGlobalReports);

export default router;
