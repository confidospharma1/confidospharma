import { Router } from 'express';
import {
  submitPrivacyRequest,
  getPrivacyRequests,
  updatePrivacyRequest,
} from './privacy.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

// Public submission endpoint for customer/patient data requests
router.post('/submit', submitPrivacyRequest);

// Protected admin management endpoints
router.get('/', authenticate, getPrivacyRequests);
router.put('/:id', authenticate, updatePrivacyRequest);

export default router;
