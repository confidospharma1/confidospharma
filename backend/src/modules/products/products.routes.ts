import { Router } from 'express';
import { getProducts, getProductById, createProduct, updateProduct } from './products.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getProducts);
router.get('/:id', getProductById);
router.post('/', createProduct);
router.put('/:id', updateProduct);

export default router;
