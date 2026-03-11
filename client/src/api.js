import axios from 'axios';

const resolveBaseUrl = () => {
  const explicit = (import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');

  if (!explicit) return '';
  if (explicit === '/api') return '';
  if (/\/api$/i.test(explicit)) return explicit.replace(/\/api$/i, '');
  return explicit;
};

const api = axios.create({
  baseURL: resolveBaseUrl(),
});

export default api;
