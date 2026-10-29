import { Router } from 'express';
import multer from 'multer';
import {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  cancelPurchase,
  createPurchaseReturn,
  getPurchaseReturns,
  previewPurchaseImport,
  downloadPurchaseTemplate,
  bulkDeletePurchases,
} from './purchases.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

router.use(authenticate);

router.get('/template', downloadPurchaseTemplate);
router.post('/import-preview', upload.single('file'), previewPurchaseImport);
router.post('/bulk-delete', bulkDeletePurchases);

router.get('/returns', getPurchaseReturns);
router.post('/returns', createPurchaseReturn);

router.get('/', getPurchases);
router.get('/:id', getPurchaseById);
router.post('/', createPurchase);
router.put('/:id', updatePurchase);
router.post('/:id/cancel', cancelPurchase);
router.delete('/:id', cancelPurchase); // Also support DELETE as alias for cancel

export default router;
