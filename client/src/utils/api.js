/**
 * API utility for making requests to the backend.
 */

const API_BASE = '/api';

async function request(url, options = {}, retries = 1) {
  const method = (options.method || 'GET').toUpperCase();
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    credentials: 'include',
    ...options
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  // 15-second request timeout to prevent UI freezes on slow networks or cold starts
  const timeoutMs = options.timeout || 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}${url}`, {
      ...config,
      signal: options.signal || controller.signal
    });
    clearTimeout(timeoutId);
    
    if (response.headers.get('content-type')?.includes('application/json')) {
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || data.errors?.[0]?.msg || 'Request failed');
        error.status = response.status;
        error.data = data;
        throw error;
      }
      return data;
    }
    
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    // Auto-retry idempotent GET requests once if network glitch or cold start occurs
    if (retries > 0 && method === 'GET' && (err.name === 'AbortError' || err.message?.includes('Failed to fetch') || err.message?.includes('network'))) {
      await new Promise(r => setTimeout(r, 1000));
      return request(url, options, retries - 1);
    }
    if (err.name === 'AbortError') {
      throw new Error('Connection timed out. Please check your network and try again.');
    }
    throw err;
  }
}

export const api = {
  // Public endpoints
  checkHealth: () => request('/health'),
  getPricing: () => request('/pricing'),
  
  register: (data) => request('/register', { method: 'POST', body: data }),
  
  getRegistration: (token) => request(`/registration/${token}`),
  
  createNewSession: (token) => request(`/registration/${token}/new-session`, { method: 'POST' }),
  
  submitPayment: (data) => request('/payment/submit', { method: 'POST', body: data }),
  
  validateTicket: (ticketNumber) => request(`/ticket/validate/${ticketNumber}`),
  
  // Admin endpoints
  adminLogin: (credentials) => request('/admin/login', { method: 'POST', body: credentials }),
  
  adminLogout: () => request('/admin/logout', { method: 'POST' }),
  
  adminMe: () => request('/admin/me'),
  
  adminStatistics: () => request('/admin/statistics'),
  
  adminRegistrations: (params) => {
    const queryString = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null && v !== ''))
    ).toString();
    return request(`/admin/registrations?${queryString}`);
  },
  
  adminRegistration: (id) => request(`/admin/registration/${id}`),
  
  adminApprove: (id) => request(`/admin/approve/${id}`, { method: 'POST' }),
  
  adminReject: (id, reason) => request(`/admin/reject/${id}`, { method: 'POST', body: { reason } }),
  
  adminRemove: (id, reason) => request(`/admin/remove/${id}`, { method: 'POST', body: { reason } }),

  adminRestore: (id) => request(`/admin/restore/${id}`, { method: 'POST' }),

  adminPermanentDelete: (id) => request(`/admin/permanent-delete/${id}`, { method: 'POST' }),

  adminDeleteAll: (confirmation) => request('/admin/delete-all', { method: 'POST', body: { confirmation } }),

  adminExport: (params = {}) => {
    const queryString = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null && v !== ''))
    ).toString();
    return fetch(`${API_BASE}/admin/export?${queryString}`, { credentials: 'include' });
  },

  adminScanDuplicates: () => request('/admin/duplicates/scan'),

  adminFlagDuplicate: (id, reason) => request(`/admin/duplicates/flag/${id}`, { method: 'POST', body: { reason } }),

  adminResolveDuplicate: (payload) => request('/admin/duplicates/resolve', { method: 'POST', body: payload })
};

export default api;
