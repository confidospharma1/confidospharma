import { Router } from 'express';
import { createInvoice, getInvoices, getInvoiceById, cancelInvoice } from './billing.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/invoices', createInvoice);
router.get('/invoices', getInvoices);
router.get('/invoices/:id', getInvoiceById);
router.post('/invoices/:id/cancel', cancelInvoice);

export default router;
