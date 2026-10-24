import { Router } from 'express';
import {
  getBatches,
  getFEFOBatch,
  receiveStockBatch,
  adjustStock,
  getMovements,
  getTransfers,
  createTransfer,
  receiveTransfer,
} from './inventory.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/batches', getBatches);
router.get('/fefo/:medicineId', getFEFOBatch);
router.post('/batches', receiveStockBatch);
router.post('/adjust', adjustStock);
router.get('/movements', getMovements);
router.get('/transfers', getTransfers);
router.post('/transfers', createTransfer);
router.put('/transfers/:id/receive', receiveTransfer);

export default router;
