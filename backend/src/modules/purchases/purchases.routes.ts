import { Router } from 'express';
import { getPurchases, createPurchase } from './purchases.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getPurchases);
router.post('/', createPurchase);

export default router;
