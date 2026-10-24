import { Router } from 'express';
import multer from 'multer';
import {
  uploadAndPreviewImport,
  getImportJob,
  commitImportJob,
  downloadErrorRows,
  downloadTemplate,
} from './imports.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

router.use(authenticate);

router.post('/upload', upload.single('file'), uploadAndPreviewImport);
router.get('/:id', getImportJob);
router.post('/:id/commit', commitImportJob);
router.get('/:id/download-errors', downloadErrorRows);
router.get('/template/:type', downloadTemplate);

export default router;
