import { Router } from 'express';
import {
  getDailySalesReport,
  getStockValuationReport,
  getExpiryAlertsReport,
  getGSTSummaryReport,
  getCompanyOverview,
  getProfitLossReport,
  getProductProfitabilityReport,
  getDateWiseStockReport,
} from './reports.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/daily-sales', getDailySalesReport);
router.get('/stock-valuation', getStockValuationReport);
router.get('/expiry-alerts', getExpiryAlertsReport);
router.get('/gst-summary', getGSTSummaryReport);
router.get('/company-overview', getCompanyOverview);
router.get('/profit-loss', getProfitLossReport);
router.get('/product-profitability', getProductProfitabilityReport);
router.get('/datewise-stock', getDateWiseStockReport);

export default router;
