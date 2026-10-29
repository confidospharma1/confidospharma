import { Router } from 'express';
import {
  getIndents,
  getIndentById,
  createIndent,
  approveIndent,
  rejectIndent,
  convertIndentToPurchase,
} from './indents.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getIndents);
router.get('/:id', getIndentById);
router.post('/', createIndent);
router.post('/:id/approve', approveIndent);
router.post('/:id/reject', rejectIndent);
router.post('/:id/convert', convertIndentToPurchase);

export default router;
