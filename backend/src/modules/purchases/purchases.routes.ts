import { Router } from 'express';
import {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  cancelPurchase,
  createPurchaseReturn,
  getPurchaseReturns,
} from './purchases.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getPurchases);
router.get('/:id', getPurchaseById);
router.post('/', createPurchase);
router.put('/:id', updatePurchase);
router.post('/:id/cancel', cancelPurchase);
router.delete('/:id', cancelPurchase); // Also support DELETE as alias for cancel

router.get('/returns', getPurchaseReturns);
router.post('/returns', createPurchaseReturn);

export default router;
