import { Router } from 'express';
import { getUsers, createUser, updateUser } from './users.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);

export default router;
