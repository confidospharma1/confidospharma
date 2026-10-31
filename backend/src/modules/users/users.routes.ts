import { Router } from 'express';
import {
  getUsers,
  createUser,
  updateUser,
  toggleUserStatus,
  deleteUser,
  getProfile,
  updateProfile,
  bulkDeleteUsers,
} from './users.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/bulk-delete', bulkDeleteUsers);

router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.patch('/:id/status', toggleUserStatus);
router.delete('/:id', deleteUser);

export default router;
