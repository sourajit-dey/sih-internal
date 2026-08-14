const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  const config = {
    ...options,
    headers
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong');
  }

  return data;
}

export const api = {
  getFacilities: () => request('/facility'),
  getFacilityQueue: (id, department) => {
    const query = department ? `?department=${encodeURIComponent(department)}` : '';
    return request(`/facility/${id}/queue${query}`);
  },
  issueToken: (body) => request('/token', { method: 'POST', body }),
  getTokenStatus: (id) => request(`/token/${id}`),
  advanceQueue: (body) => request('/admin/queue/advance', { method: 'POST', body }),
  getAdminDashboard: () => request('/admin/dashboard'),
  getPredictions: () => request('/admin/predictions')
};
