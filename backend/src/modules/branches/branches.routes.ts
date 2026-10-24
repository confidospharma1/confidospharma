import { Router } from 'express';
import { getBranches, getBranchById, createBranch, updateBranch } from './branches.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getBranches);
router.get('/:id', getBranchById);
router.post('/', createBranch);
router.put('/:id', updateBranch);

export default router;
