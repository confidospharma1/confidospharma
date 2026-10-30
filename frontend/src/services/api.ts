const getBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
  }
  // Fallback to live Render backend when running on Vercel or any non-localhost host
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return 'https://confidospharma.onrender.com/api';
  }
  return '/api';
};

export const BASE_URL = getBaseUrl();

export const getAuthToken = (): string | null => {
  return localStorage.getItem('confidos_token');
};

export const setAuthToken = (token: string): void => {
  localStorage.setItem('confidos_token', token);
};

export const removeAuthToken = (): void => {
  localStorage.removeItem('confidos_token');
};

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // If expired token
    removeAuthToken();
    if (window.location.pathname !== '/' && !window.location.pathname.includes('/login')) {
      window.location.href = '/';
    }
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('text/csv')) {
    return response.blob() as any;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

export const api = {
  // Auth
  getSetupStatus: () => apiRequest<{ needsSetup: boolean; totalUsers: number }>('/auth/setup-status'),
  setupAdmin: (data: any) => apiRequest('/auth/setup-admin', { method: 'POST', body: JSON.stringify(data) }),
  login: (credentials: { usernameOrEmail: string; password: string }) =>
    apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  getMe: () => apiRequest('/auth/me'),
  logout: () => apiRequest('/auth/logout', { method: 'POST' }),

  // Branches
  getBranches: () => apiRequest('/branches'),
  getBranch: (id: string) => apiRequest(`/branches/${id}`),
  createBranch: (data: any) => apiRequest('/branches', { method: 'POST', body: JSON.stringify(data) }),
  updateBranch: (id: string, data: any) => apiRequest(`/branches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBranch: (id: string) => apiRequest(`/branches/${id}`, { method: 'DELETE' }),

  // Users
  getUsers: () => apiRequest('/users'),
  createUser: (data: any) => apiRequest('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => apiRequest(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) => apiRequest(`/users/${id}`, { method: 'DELETE' }),
  bulkDeleteUsers: (userIds: string[]) => apiRequest('/users/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: userIds, userIds }) }),
  getProfile: () => apiRequest('/users/profile'),
  updateProfile: (data: any) => apiRequest('/users/profile', { method: 'PUT', body: JSON.stringify(data) }),

  // Products
  getProducts: (params?: { search?: string; barcode?: string; branchId?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.append('search', params.search);
    if (params?.barcode) q.append('barcode', params.barcode);
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.page) q.append('page', params.page.toString());
    if (params?.limit) q.append('limit', params.limit.toString());
    return apiRequest(`/products?${q.toString()}`);
  },
  getProduct: (id: string) => apiRequest(`/products/${id}`),
  createProduct: (data: any) => apiRequest('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: string, data: any) => apiRequest(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id: string) => apiRequest(`/products/${id}`, { method: 'DELETE' }),
  bulkDeleteProducts: (productIds: string[]) => apiRequest('/products/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: productIds, productIds }) }),

  // Inventory
  getBatches: (params?: { branchId?: string; medicineId?: string; status?: string; nearExpiry?: boolean; expired?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.medicineId) q.append('medicineId', params.medicineId);
    if (params?.status) q.append('status', params.status);
    if (params?.nearExpiry) q.append('nearExpiry', 'true');
    if (params?.expired) q.append('expired', 'true');
    return apiRequest(`/inventory/batches?${q.toString()}`);
  },
  getFEFOBatch: (medicineId: string, branchId?: string) => {
    const q = branchId ? `?branchId=${branchId}` : '';
    return apiRequest(`/inventory/fefo/${medicineId}${q}`);
  },
  receiveBatch: (data: any) => apiRequest('/inventory/batches', { method: 'POST', body: JSON.stringify(data) }),
  updateBatch: (id: string, data: any) => apiRequest(`/inventory/batches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBatch: (id: string) => apiRequest(`/inventory/batches/${id}`, { method: 'DELETE' }),
  bulkBatchAction: (data: { batchIds: string[]; action: 'QUARANTINE' | 'ACTIVE' | 'DEPLETED' | 'DELETE' }) =>
    apiRequest('/inventory/batches/bulk-action', { method: 'POST', body: JSON.stringify(data) }),
  adjustStock: (data: { batchId: string; adjustmentType: string; quantityDelta: number; reason: string }) =>
    apiRequest('/inventory/adjust', { method: 'POST', body: JSON.stringify(data) }),
  getMovements: (params?: { branchId?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.page) q.append('page', params.page.toString());
    return apiRequest(`/inventory/movements?${q.toString()}`);
  },
  getTransfers: () => apiRequest('/inventory/transfers'),
  createTransfer: (data: any) => apiRequest('/inventory/transfers', { method: 'POST', body: JSON.stringify(data) }),
  receiveTransfer: (id: string) => apiRequest(`/inventory/transfers/${id}/receive`, { method: 'PUT' }),

  // Dedicated Stock Monitoring (Read-Only)
  getStockMonitoring: (params?: {
    branchId?: string;
    search?: string;
    stockStatus?: string;
    expiryStatus?: string;
    dosageForm?: string;
    manufacturer?: string;
    genericName?: string;
    supplierId?: string;
    minQuantity?: string | number;
    maxQuantity?: string | number;
    batchNumber?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.search) q.append('search', params.search);
    if (params?.stockStatus && params.stockStatus !== 'ALL') q.append('stockStatus', params.stockStatus);
    if (params?.expiryStatus && params.expiryStatus !== 'ALL') q.append('expiryStatus', params.expiryStatus);
    if (params?.dosageForm) q.append('dosageForm', params.dosageForm);
    if (params?.manufacturer) q.append('manufacturer', params.manufacturer);
    if (params?.genericName) q.append('genericName', params.genericName);
    if (params?.supplierId) q.append('supplierId', params.supplierId);
    if (params?.minQuantity !== undefined && params.minQuantity !== '') q.append('minQuantity', params.minQuantity.toString());
    if (params?.maxQuantity !== undefined && params.maxQuantity !== '') q.append('maxQuantity', params.maxQuantity.toString());
    if (params?.batchNumber) q.append('batchNumber', params.batchNumber);
    if (params?.sortBy) q.append('sortBy', params.sortBy);
    if (params?.sortOrder) q.append('sortOrder', params.sortOrder);
    if (params?.page) q.append('page', params.page.toString());
    if (params?.limit) q.append('limit', params.limit.toString());
    return apiRequest(`/stock-monitoring?${q.toString()}`);
  },
  getStockMonitoringBatches: (medicineId: string, branchId?: string) => {
    const q = branchId ? `?branchId=${branchId}` : '';
    return apiRequest(`/stock-monitoring/batches/${medicineId}${q}`);
  },
  getStockMonitoringFilterOptions: (branchId?: string) => {
    const q = branchId ? `?branchId=${branchId}` : '';
    return apiRequest(`/stock-monitoring/filter-options${q}`);
  },
  getStockMonitoringAlerts: (branchId?: string) => {
    const q = branchId ? `?branchId=${branchId}` : '';
    return apiRequest(`/stock-monitoring/alerts${q}`);
  },

  // Billing & Invoices
  createInvoice: (data: any) => apiRequest('/billing/invoices', { method: 'POST', body: JSON.stringify(data) }),
  getInvoices: (params?: {
    branchId?: string;
    invoiceNumber?: string;
    status?: string;
    paymentMethod?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.invoiceNumber) q.append('invoiceNumber', params.invoiceNumber);
    if (params?.status) q.append('status', params.status);
    if (params?.paymentMethod) q.append('paymentMethod', params.paymentMethod);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    if (params?.page) q.append('page', params.page.toString());
    return apiRequest(`/billing/invoices?${q.toString()}`);
  },
  getInvoice: (id: string) => apiRequest(`/billing/invoices/${id}`),
  cancelInvoice: (id: string, reason: string) =>
    apiRequest(`/billing/invoices/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Purchases & Suppliers
  getSuppliers: (params?: { search?: string; includeInactive?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.search) q.append('search', params.search);
    if (params?.includeInactive) q.append('includeInactive', 'true');
    const queryString = q.toString() ? `?${q.toString()}` : '';
    return apiRequest(`/suppliers${queryString}`);
  },
  getSupplier: (id: string) => apiRequest(`/suppliers/${id}`),
  createSupplier: (data: any) => apiRequest('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplier: (id: string, data: any) => apiRequest(`/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSupplier: (id: string) => apiRequest(`/suppliers/${id}`, { method: 'DELETE' }),
  bulkDeleteSuppliers: (supplierIds: string[]) => apiRequest('/suppliers/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: supplierIds, supplierIds }) }),

  getPurchases: (params?: { branchId?: string; search?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.search) q.append('search', params.search);
    if (params?.page) q.append('page', params.page.toString());
    return apiRequest(`/purchases?${q.toString()}`);
  },
  getPurchase: (id: string) => apiRequest(`/purchases/${id}`),
  createPurchase: (data: any) => apiRequest('/purchases', { method: 'POST', body: JSON.stringify(data) }),
  updatePurchase: (id: string, data: any) => apiRequest(`/purchases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  cancelPurchase: (id: string, reason: string) =>
    apiRequest(`/purchases/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  bulkDeletePurchases: (invoiceIds: string[], reason?: string) =>
    apiRequest('/purchases/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: invoiceIds, invoiceIds, reason }) }),
  previewPurchaseImport: (formData: FormData) =>
    apiRequest('/purchases/import-preview', { method: 'POST', body: formData }),
  downloadPurchaseTemplateUrl: (format: 'xlsx' | 'csv' = 'xlsx') =>
    `${BASE_URL}/purchases/template?format=${format}`,
  downloadPurchaseTemplate: async (format: 'xlsx' | 'csv' = 'xlsx'): Promise<Blob> => {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${BASE_URL}/purchases/template?format=${format}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      let errMsg = 'Failed to download purchase template.';
      try {
        const errJson = await response.json();
        if (errJson?.message) errMsg = errJson.message;
      } catch (_) {}
      throw new Error(errMsg);
    }

    return response.blob();
  },
  createPurchaseReturn: (data: any) => apiRequest('/purchases/returns', { method: 'POST', body: JSON.stringify(data) }),
  getPurchaseReturns: (params?: { branchId?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.page) q.append('page', params.page.toString());
    return apiRequest(`/purchases/returns?${q.toString()}`);
  },

  // Indents
  getIndents: (params?: { branchId?: string; status?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.status) q.append('status', params.status);
    if (params?.page) q.append('page', params.page.toString());
    return apiRequest(`/indents?${q.toString()}`);
  },
  getIndent: (id: string) => apiRequest(`/indents/${id}`),
  createIndent: (data: any) => apiRequest('/indents', { method: 'POST', body: JSON.stringify(data) }),
  updateIndentStatus: (id: string, status: string, reviewNotes?: string) =>
    apiRequest(`/indents/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reviewNotes }) }),
  convertIndentToPurchase: (id: string) => apiRequest(`/indents/${id}/convert`, { method: 'POST' }),

  // System Settings & Customization
  getSettings: () => apiRequest('/settings'),
  updateSettings: (settings: any) => apiRequest('/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),

  // Operating Expenses
  getExpenses: (params?: { branchId?: string; category?: string; startDate?: string; endDate?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.category) q.append('category', params.category);
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    if (params?.page) q.append('page', params.page.toString());
    return apiRequest(`/expenses?${q.toString()}`);
  },
  createExpense: (data: any) => apiRequest('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (id: string, data: any) => apiRequest(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExpense: (id: string) => apiRequest(`/expenses/${id}`, { method: 'DELETE' }),

  // Bulk Imports
  uploadImportFile: (formData: FormData) => apiRequest('/imports/upload', { method: 'POST', body: formData }),
  getImportJob: (id: string) => apiRequest(`/imports/${id}`),
  commitImport: (id: string) => apiRequest(`/imports/${id}/commit`, { method: 'POST' }),
  downloadTemplateUrl: (type: string) => `${BASE_URL}/imports/template/${type}`,
  downloadTemplate: async (type: string): Promise<Blob> => {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${BASE_URL}/imports/template/${type}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      let errMsg = 'Failed to download CSV template.';
      try {
        const errJson = await response.json();
        if (errJson?.message) errMsg = errJson.message;
      } catch (_) {}
      throw new Error(errMsg);
    }

    return response.blob();
  },
  downloadErrorsUrl: (importId: string) => {
    const token = getAuthToken();
    return `${BASE_URL}/imports/${importId}/download-errors${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },

  // Reports
  getDailySales: (branchId?: string, date?: string) => {
    const q = new URLSearchParams();
    if (branchId) q.append('branchId', branchId);
    if (date) q.append('date', date);
    return apiRequest(`/reports/daily-sales?${q.toString()}`);
  },
  getStockValuation: (branchId?: string) => {
    const q = branchId ? `?branchId=${branchId}` : '';
    return apiRequest(`/reports/stock-valuation${q}`);
  },
  getExpiryAlerts: (branchId?: string, days?: number) => {
    const q = new URLSearchParams();
    if (branchId) q.append('branchId', branchId);
    if (days) q.append('days', days.toString());
    return apiRequest(`/reports/expiry-alerts?${q.toString()}`);
  },
  getGSTSummary: (branchId?: string, startDate?: string, endDate?: string) => {
    const q = new URLSearchParams();
    if (branchId) q.append('branchId', branchId);
    if (startDate) q.append('startDate', startDate);
    if (endDate) q.append('endDate', endDate);
    return apiRequest(`/reports/gst-summary?${q.toString()}`);
  },
  getCompanyOverview: () => apiRequest('/reports/company-overview'),
  getProfitLoss: (branchId?: string, startDate?: string, endDate?: string) => {
    const q = new URLSearchParams();
    if (branchId) q.append('branchId', branchId);
    if (startDate) q.append('startDate', startDate);
    if (endDate) q.append('endDate', endDate);
    return apiRequest(`/reports/profit-loss?${q.toString()}`);
  },

  // Audit Logs
  getAuditLogs: (params?: { branchId?: string; action?: string; targetEntity?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.action) q.append('action', params.action);
    if (params?.targetEntity) q.append('targetEntity', params.targetEntity);
    if (params?.page) q.append('page', params.page.toString());
    return apiRequest(`/audit?${q.toString()}`);
  },

  // Privacy Compliance
  submitPrivacyRequest: (data: any) => apiRequest('/privacy/submit', { method: 'POST', body: JSON.stringify(data) }),
  getPrivacyRequests: () => apiRequest('/privacy'),
  updatePrivacyRequest: (id: string, data: any) => apiRequest(`/privacy/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};
