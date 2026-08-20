import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { sendSuccess, sendError } from '../utils/response';

const router = Router();

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
    cb(null, `file-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return sendError(res, 'No file uploaded', 400);
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    return sendSuccess(res, { url: fileUrl, filename: req.file.filename }, 'File uploaded successfully', 201);
  } catch (err: any) {
    return sendError(res, err.message || 'File upload failed', 500);
  }
});

export default router;
