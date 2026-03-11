import axios from 'axios';

const resolveBaseUrl = () => {
  const explicit = (import.meta.env.VITE_API_URL || '').trim();
  if (explicit) return explicit;

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.endsWith('vercel.app')) {
      return '/api';
    }
  }

  return 'http://localhost:5001';
};

const api = axios.create({
  baseURL: resolveBaseUrl(),
});

export default api;
