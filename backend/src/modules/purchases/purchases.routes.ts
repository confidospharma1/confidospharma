import { Router } from 'express';
import {
  getPurchases,
  createPurchase,
  createPurchaseReturn,
  getPurchaseReturns,
} from './purchases.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getPurchases);
router.post('/', createPurchase);

router.get('/returns', getPurchaseReturns);
router.post('/returns', createPurchaseReturn);

export default router;
