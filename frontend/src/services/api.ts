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

const BASE_URL = getBaseUrl();

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
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login';
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
  login: (credentials: { usernameOrEmail: string; password: string }) =>
    apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  getMe: () => apiRequest('/auth/me'),
  logout: () => apiRequest('/auth/logout', { method: 'POST' }),

  // Branches
  getBranches: () => apiRequest('/branches'),
  getBranch: (id: string) => apiRequest(`/branches/${id}`),
  createBranch: (data: any) => apiRequest('/branches', { method: 'POST', body: JSON.stringify(data) }),
  updateBranch: (id: string, data: any) => apiRequest(`/branches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Users
  getUsers: () => apiRequest('/users'),
  createUser: (data: any) => apiRequest('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => apiRequest(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

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

  // Billing & Invoices
  createInvoice: (data: any) => apiRequest('/billing/invoices', { method: 'POST', body: JSON.stringify(data) }),
  getInvoices: (params?: { branchId?: string; invoiceNumber?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.invoiceNumber) q.append('invoiceNumber', params.invoiceNumber);
    if (params?.page) q.append('page', params.page.toString());
    return apiRequest(`/billing/invoices?${q.toString()}`);
  },
  getInvoice: (id: string) => apiRequest(`/billing/invoices/${id}`),
  cancelInvoice: (id: string, reason: string) =>
    apiRequest(`/billing/invoices/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // Purchases & Suppliers
  getSuppliers: () => apiRequest('/suppliers'),
  createSupplier: (data: any) => apiRequest('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  getPurchases: (params?: { branchId?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.page) q.append('page', params.page.toString());
    return apiRequest(`/purchases?${q.toString()}`);
  },
  createPurchase: (data: any) => apiRequest('/purchases', { method: 'POST', body: JSON.stringify(data) }),
  createPurchaseReturn: (data: any) => apiRequest('/purchases/returns', { method: 'POST', body: JSON.stringify(data) }),
  getPurchaseReturns: (params?: { branchId?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.page) q.append('page', params.page.toString());
    return apiRequest(`/purchases/returns?${q.toString()}`);
  },

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
  getAuditLogs: (params?: { branchId?: string; action?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.branchId) q.append('branchId', params.branchId);
    if (params?.action) q.append('action', params.action);
    if (params?.page) q.append('page', params.page.toString());
    return apiRequest(`/audit?${q.toString()}`);
  },

  // Privacy Compliance
  submitPrivacyRequest: (data: any) => apiRequest('/privacy/submit', { method: 'POST', body: JSON.stringify(data) }),
  getPrivacyRequests: () => apiRequest('/privacy'),
  updatePrivacyRequest: (id: string, data: any) => apiRequest(`/privacy/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};
