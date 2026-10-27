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
  updateBatch,
  deleteBatch,
  bulkBatchAction,
} from './inventory.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/batches', getBatches);
router.get('/fefo/:medicineId', getFEFOBatch);
router.post('/batches', receiveStockBatch);
router.put('/batches/:id', updateBatch);
router.delete('/batches/:id', deleteBatch);
router.post('/batches/bulk-action', bulkBatchAction);
router.post('/adjust', adjustStock);
router.get('/movements', getMovements);
router.get('/transfers', getTransfers);
router.post('/transfers', createTransfer);
router.put('/transfers/:id/receive', receiveTransfer);

export default router;
