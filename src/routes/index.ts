import { Router } from 'express';
import authRoutes from './authRoutes';
import publicRoutes from './publicRoutes';
import adminRoutes from './adminRoutes';
import ownerRoutes from './ownerRoutes';
import tenantRoutes from './tenantRoutes';
import paymentRoutes from './paymentRoutes';
import notificationRoutes from './notificationRoutes';
import cronRoutes from './cronRoutes';
import uploadRoutes from './uploadRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/public', publicRoutes);
router.use('/upload', uploadRoutes);
router.use('/admin', adminRoutes);
router.use('/owner', ownerRoutes);
router.use('/tenant', tenantRoutes);
router.use('/payments', paymentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/cron', cronRoutes);

export default router;
