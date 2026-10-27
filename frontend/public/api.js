/**
 * ManageIT API client — ASP.NET Core backend only
 */
'use strict';

const ManageITApi = (() => {
  let baseUrl         = '';
  let timeoutMs       = 8000;
  let onUnauthorized  = null;

  function configure(cfg = {}) {
    baseUrl           = (cfg.apiBaseUrl || window.location.origin).replace(/\/$/, '');
    timeoutMs         = cfg.apiTimeoutMs || 8000;
  }

  function getToken() {
    return sessionStorage.getItem('manageit_token');
  }

  function setToken(token) {
    if (token) sessionStorage.setItem('manageit_token', token);
    else sessionStorage.removeItem('manageit_token');
  }

  function clearToken() {
    setToken(null);
  }

  function setUnauthorizedHandler(handler) {
    onUnauthorized    = handler;
  }

  async function request(method, path, { body, auth = true } = {}) {
    const headers     = { 'Content-Type': 'application/json' };
    const token       = getToken();
    if (auth && token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(baseUrl + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs)
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401 && auth) {
      const msg = data.message || data.error || 'Session expired. Please sign in again.';
      if (onUnauthorized) onUnauthorized(msg);
      throw new Error(msg);
    }

    if (!res.ok) {
      const msg = data.error || data.message || data.detail || data.title || `HTTP ${res.status}`;
      throw new Error(typeof msg === 'string' ? msg : 'Request failed');
    }

    return data;
  }

  async function checkHealth() {
    try {
      const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return { ok: false, databaseConnected: false };
      const data = await res.json();
      return { ok: true, databaseConnected: !!data.databaseConnected, ...data };
    } catch {
      return { ok: false, databaseConnected: false };
    }
  }

  return {
    configure,
    getToken,
    setToken,
    clearToken,
    setUnauthorizedHandler,

    checkHealth,
    login: (salNumber, password, brand) =>
      request('POST', '/api/auth/login', { body: { salNumber, password, brand: brand || 'sms' }, auth: false }),
    checkLmsAccess: async (salNumber) => {
      try {
        const res = await fetch(`${baseUrl}/api/auth/lms-access?sal=${encodeURIComponent(salNumber || '')}`, {
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        if (!data || typeof data.canAccessLms !== 'boolean') return null;
        return data.canAccessLms;
      } catch {
        return null;
      }
    },
    me: async () => {
      const data = await request('GET', '/api/auth/me');
      if (data.user) return data;
      return { user: data, permissions: null, roleDisplayName: null };
    },
    getPermissions: () => request('GET', '/api/auth/permissions'),
    bootstrap: () => request('GET', '/api/bootstrap'),
    sync: (state) => request('POST', '/api/sync', { body: state }),

    getJobs: () => request('GET', '/api/jobs'),
    getJob: (id) => request('GET', `/api/jobs/${id}`),
    createJob: (job) => request('POST', '/api/jobs', { body: job }),
    updateJob: (id, job) => request('PUT', `/api/jobs/${id}`, { body: job }),
    deleteJob: (id) => request('DELETE', `/api/jobs/${id}`),

    getUsers: () => request('GET', '/api/users'),
    getUser: (id) => request('GET', `/api/users/${id}`),
    createUser: (user) => request('POST', '/api/users', { body: user }),
    updateUser: (id, user) => request('PUT', `/api/users/${id}`, { body: user }),
    deleteUser: (id) => request('DELETE', `/api/users/${id}`),

    getStock: () => request('GET', '/api/stock'),
    getStockItem: (id) => request('GET', `/api/stock/${id}`),
    createStock: (stock) => request('POST', '/api/stock', { body: stock }),
    updateStock: (id, stock) => request('PUT', `/api/stock/${id}`, { body: stock }),
    deleteStock: (id) => request('DELETE', `/api/stock/${id}`),

    getStorageLocations: () => request('GET', '/api/storage-locations'),
    getStorageLocation: (id) => request('GET', `/api/storage-locations/${id}`),
    createStorageLocation: (loc) => request('POST', '/api/storage-locations', { body: loc }),
    updateStorageLocation: (id, loc) => request('PUT', `/api/storage-locations/${id}`, { body: loc }),
    deleteStorageLocation: (id) => request('DELETE', `/api/storage-locations/${id}`),

    getTransactions: () => request('GET', '/api/transactions'),
    createTransaction: (tx) => request('POST', '/api/transactions', { body: tx }),

    getActivity: () => request('GET', '/api/activity'),
    createActivity: (entry) => request('POST', '/api/activity', { body: entry }),

    getSettings: () => request('GET', '/api/settings'),
    updateSettings: (settings) => request('PUT', '/api/settings', { body: settings }),

    getAudits: () => request('GET', '/api/audits'),
    createAudit: (audit) => request('POST', '/api/audits', { body: audit }),

    getReconciliations: () => request('GET', '/api/reconciliations'),
    createReconciliation: (item) => request('POST', '/api/reconciliations', { body: item }),

    getAuditSessions: () => request('GET', '/api/audit-sessions'),
    upsertAuditSession: (session) => request('POST', '/api/audit-sessions', { body: session }),
    deleteAuditSession: (id) => request('DELETE', `/api/audit-sessions/${encodeURIComponent(id)}`),

    getReconHistory: () => request('GET', '/api/recon-history'),
    upsertReconHistory: (run) => request('POST', '/api/recon-history', { body: run }),

    getSerialNumbers: () => request('GET', '/api/serial-numbers'),
    addSerialNumber: (serialNumber) => request('POST', '/api/serial-numbers', { body: { serialNumber } }),

    getAssets: () => request('GET', '/api/assets'),
    getAsset: (id) => request('GET', `/api/assets/${id}`),
    createAsset: (asset) => request('POST', '/api/assets', { body: asset }),
    updateAsset: (id, asset) => request('PUT', `/api/assets/${id}`, { body: asset }),
    deleteAsset: (id) => request('DELETE', `/api/assets/${id}`),

    getAssetMaintenance: () => request('GET', '/api/asset-maintenance'),
    createAssetMaintenance: (item) => request('POST', '/api/asset-maintenance', { body: item }),
    updateAssetMaintenance: (id, item) => request('PUT', `/api/asset-maintenance/${id}`, { body: item }),
    deleteAssetMaintenance: (id) => request('DELETE', `/api/asset-maintenance/${id}`)
  };
})();

window.ManageITApi = ManageITApi;
