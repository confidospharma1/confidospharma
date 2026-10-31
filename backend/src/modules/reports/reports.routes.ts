import { Router } from 'express';
import {
  getDailySalesReport,
  getStockValuationReport,
  getExpiryAlertsReport,
  getGSTSummaryReport,
  getCompanyOverview,
  getProfitLossReport,
  getProductProfitabilityReport,
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

export default router;
