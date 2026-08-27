import axios from 'axios';

// API base URL comes from the environment. Vite injects VITE_* vars at build
// time (see .env / .env.example in frontend). Default to the local backend for
// development; never hard-code a remote URL.
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (userData) => api.post('/auth/register', userData),
  login: (credentials) => api.post('/auth/login', credentials),
  getMe: () => api.get('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  updateProfile: (name) => api.patch('/auth/profile', { name }),
  logout: () => api.post('/auth/logout'),
};

// Documents API
export const documentsAPI = {
  upload: (formData) => api.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  ingest: (docId) => api.post('/documents/ingest', { docId }),
  retry: (docId) => api.post(`/documents/${docId}/retry`),
  getAll: () => api.get('/documents'),
  getById: (id) => api.get(`/documents/${id}`),
  delete: (id) => api.delete(`/documents/${id}`),
  // Authenticated, ownership-scoped file download -> object URL for the viewer.
  async getFileUrl(id) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE_URL}/documents/${id}/file`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch file (${res.status})`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};

// QA API
export const qaAPI = {
  ask: (query, docIds, topK = 4) => api.post('/qa', { query, docIds, topK }),
  search: (query, docIds, topK = 4) => api.post('/qa/search', { query, docIds, topK }),
};

// Quiz API
export const quizAPI = {
  generate: (docIds, numQuestions = 10, distribution = { mcq: 6, saq: 3, laq: 1 }) =>
    api.post('/quiz/generate', { docIds, numQuestions, distribution }),
  getById: (id) => api.get(`/quiz/${id}`),
  getAll: () => api.get('/quiz'),
  submitAttempt: (id, answers) => api.post(`/quiz/${id}/attempt`, { answers }),
  getAttempts: (id) => api.get(`/quiz/${id}/attempts`),
  delete: (id) => api.delete(`/quiz/${id}`),
};

// Stats API (real, question-level analytics)
export const statsAPI = {
  getStats: () => api.get('/stats'),
  getDashboard: () => api.get('/stats/dashboard'),
};

// Chat API
export const chatAPI = {
  create: (title) => api.post('/chat', { title }),
  getAll: () => api.get('/chat'),
  getMessages: (id) => api.get(`/chat/${id}/messages`),
  sendMessage: (id, message, docIds) => api.post(`/chat/${id}/messages`, { message, docIds }),
  delete: (id) => api.delete(`/chat/${id}`),
};

// Export API (GDPR-style data export of owned data)
export const exportAPI = {
  async downloadJson() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE_URL}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    return res.json();
  },
};

// Account API (permanent deletion)
export const accountAPI = {
  delete: () => api.delete('/account'),
};
