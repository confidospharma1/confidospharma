import { Router } from 'express';
import { getSettings, updateSettings } from './settings.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getSettings);
router.put('/', updateSettings);

export default router;
