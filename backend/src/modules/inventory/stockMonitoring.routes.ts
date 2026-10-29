import { Router } from 'express';
import {
  getStockMonitoring,
  getMedicineBatches,
  getStockMonitoringFilterOptions,
  getStockMonitoringAlerts,
} from './stockMonitoring.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

// Strict Read-Only Routes: All endpoints are HTTP GET only
router.use(authenticate);

router.get('/', getStockMonitoring);
router.get('/alerts', getStockMonitoringAlerts);
router.get('/filter-options', getStockMonitoringFilterOptions);
router.get('/batches/:medicineId', getMedicineBatches);

export default router;
