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
import expenseRoutes from './modules/expenses/expenses.routes';
import auditRoutes from './modules/audit/audit.routes';
import privacyRoutes from './modules/privacy/privacy.routes';
import settingRoutes from './modules/settings/settings.routes';
import indentRoutes from './modules/indents/indents.routes';

const app = express();

const allowedOrigins = [
  'https://frontend-lovat-two-zphauehhuj.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (mobile, curl, server-to-server)
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.includes(origin) ||
      /\.vercel\.app$/.test(new URL(origin).hostname) ||
      process.env.NODE_ENV !== 'production'
    ) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive fallback to echo origin for preview deploys
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-branch-id'],
};

// Middlewares
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Root Status
app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    product: 'Confidos Pharma Enterprise OS - API Server',
    version: '1.0.0',
    healthCheck: '/api/health',
    timestamp: new Date().toISOString(),
  });
});

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
app.use('/api/expenses', expenseRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/privacy', privacyRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/indents', indentRoutes);

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
