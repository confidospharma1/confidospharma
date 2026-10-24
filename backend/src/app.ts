import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

// Routes
import authRoutes from './modules/auth/auth.routes';
import branchRoutes from './modules/branches/branches.routes';
import userRoutes from './modules/users/users.routes';
import productRoutes from './modules/products/products.routes';
import inventoryRoutes from './modules/inventory/inventory.routes';
import billingRoutes from './modules/billing/billing.routes';
import purchaseRoutes from './modules/purchases/purchases.routes';
import supplierRoutes from './modules/suppliers/suppliers.routes';
import importRoutes from './modules/imports/imports.routes';
import reportRoutes from './modules/reports/reports.routes';
import auditRoutes from './modules/audit/audit.routes';
import privacyRoutes from './modules/privacy/privacy.routes';

const app = express();

// Middlewares
app.use(cors({
  origin: '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    product: 'Confidos Pharma API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Mount Modules
app.use('/api/auth', authRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/privacy', privacyRoutes);

// Centralized 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ message: `API endpoint '${req.method} ${req.url}' was not found.` });
});

// Centralized error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'An unexpected internal error occurred on the server.',
  });
});

export default app;
