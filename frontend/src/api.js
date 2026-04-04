import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const invoiceApi = {
  list: (params) => api.get('/invoices', { params }),
  get: (id) => api.get(`/invoices/${id}`),
  create: (data) => api.post('/invoices', data),
  update: (id, data) => api.put(`/invoices/${id}`, data),
  delete: (id) => api.delete(`/invoices/${id}`),
  updateStatus: (id, status) => api.patch(`/invoices/${id}/status`, { status }),
  downloadUrl: (id) => `/api/invoices/${id}/download`,
  sendWhatsApp: (id, phone) => api.post(`/invoices/${id}/send-whatsapp`, { phone }),
  regeneratePdf: (id) => api.post(`/invoices/${id}/regenerate-pdf`),
  stats: () => api.get('/invoices/stats'),
};

export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
  uploadLogo: (file) => {
    const fd = new FormData();
    fd.append('logo', file);
    return api.post('/settings/logo', fd);
  }
};

export const whatsappApi = {
  status: () => api.get('/whatsapp/status'),
  connect: () => api.post('/whatsapp/connect'),
  disconnect: () => api.post('/whatsapp/disconnect'),
  send: (phone, message) => api.post('/whatsapp/send', { phone, message }),
};

export default api;
