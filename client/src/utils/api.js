/**
 * API utility for making requests to the backend.
 */

const API_BASE = '/api';

async function request(url, options = {}) {
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

  const response = await fetch(`${API_BASE}${url}`, config);
  
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
}

export const api = {
  // Public endpoints
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
