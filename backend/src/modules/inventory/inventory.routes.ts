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
  getLedgerSummary,
  getLedgerMovements,
} from './inventory.controller';
import {
  getStockMonitoring,
  getMedicineBatches,
  getStockMonitoringFilterOptions,
  getStockMonitoringAlerts,
} from './stockMonitoring.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Dedicated Read-Only Stock Monitoring Routes
router.get('/monitoring', getStockMonitoring);
router.get('/monitoring/alerts', getStockMonitoringAlerts);
router.get('/monitoring/filter-options', getStockMonitoringFilterOptions);
router.get('/monitoring/batches/:medicineId', getMedicineBatches);

// Dedicated Ledger-Based Inventory Management Routes
router.get('/ledger/summary', getLedgerSummary);
router.get('/ledger/movements', getLedgerMovements);

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
