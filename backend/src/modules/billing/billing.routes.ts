import { Router } from 'express';
import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  cancelInvoice,
  deleteInvoice,
  bulkDeleteCancelledInvoices,
  sendInvoiceWhatsApp,
} from './billing.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/invoices', createInvoice);
router.get('/invoices', getInvoices);
router.post('/invoices/bulk-delete', bulkDeleteCancelledInvoices);
router.get('/invoices/:id', getInvoiceById);
router.post('/invoices/:id/cancel', cancelInvoice);
router.delete('/invoices/:id', deleteInvoice);
router.post('/invoices/:id/send-whatsapp', sendInvoiceWhatsApp);

export default router;
