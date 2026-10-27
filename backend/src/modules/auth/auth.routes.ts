import { Router } from 'express';
import { login, getMe, logout, getSetupStatus, setupInitialAdmin } from './auth.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.get('/setup-status', getSetupStatus);
router.post('/setup-admin', setupInitialAdmin);
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);

export default router;
