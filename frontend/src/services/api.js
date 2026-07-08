// src/services/api.js
const API_URL = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('ad_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) throw new Error('Request failed.');
    return res;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Unknown server error.');
  return data;
}

function qs(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : '';
}

export function login(username, password) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}
export function saveSession(token, user) {
  localStorage.setItem('ad_token', token);
  localStorage.setItem('ad_user', JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem('ad_token');
  localStorage.removeItem('ad_user');
}
export function getSavedUser() {
  try { return JSON.parse(localStorage.getItem('ad_user')); } catch { return null; }
}
export function isLoggedIn() { return !!getToken(); }

export function getKpis(filters) { return request(`/dashboard/kpis${qs(filters)}`); }
export function getAccountsStatus(filters) { return request(`/dashboard/accounts-status${qs(filters)}`); }
export function getProfitLossByMonth(filters) { return request(`/dashboard/profit-loss-by-month${qs(filters)}`); }
export function getTrend(filters) { return request(`/dashboard/trend${qs(filters)}`); }
export function getStatusDistribution(filters) { return request(`/dashboard/status-distribution${qs(filters)}`); }
export function getTopExtraCosts(filters) { return request(`/dashboard/top-extra-costs${qs(filters)}`); }
export function getAlerts() { return request('/dashboard/alerts'); }

export function getAccountsList() { return request('/accounts'); }
export function getAccountDetail(accountNumber) { return request(`/accounts/${accountNumber}/detail`); }
export function getAccountKpis(accountNumber, filters) {
  return request(`/accounts/${accountNumber}/kpis${qs(filters)}`);
}
export function getAccountMonthly(accountNumber, filters) {
  return request(`/accounts/${accountNumber}/monthly${qs(filters)}`);
}
export function getAccountTransactions(accountNumber, limit = 100) {
  return request(`/accounts/${accountNumber}/transactions${qs({ limit })}`);
}

// ── Admin: customer management ────────────────────────────────────
export function getCustomers() { return request('/admin/customers'); }
export function createCustomer(payload) {
  return request('/admin/customers', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateCustomer(id, payload) {
  return request(`/admin/customers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}
export function resetCustomerPassword(id, password) {
  return request(`/admin/customers/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify(password ? { password } : {}),
  });
}
export function getCustomerAccounts(id) { return request(`/admin/customers/${id}/accounts`); }
export function assignAccountToCustomer(customerId, accountId) {
  return request(`/admin/customers/${customerId}/accounts/${accountId}`, { method: 'PUT' });
}
export function unassignAccountFromCustomer(customerId, accountId) {
  return request(`/admin/customers/${customerId}/accounts/${accountId}`, { method: 'DELETE' });
}
export function getUnassignedAccounts() { return request('/accounts?unassigned=true'); }
export function createAccount(payload) {
  return request('/accounts', { method: 'POST', body: JSON.stringify(payload) });
}

// ── Online / active indicator ─────────────────────────────────────
export function sendHeartbeat() { return request('/auth/heartbeat', { method: 'POST' }); }
export function getOnlineSummary() { return request('/admin/customers/online-summary'); }

export function getLatestRates() { return request('/exchange-rates/latest'); }
export function getRateHistory(from, to, days = 30) {
  return request(`/exchange-rates/history${qs({ from, to, days })}`);
}
export function getFxMonthlyPl() { return request('/exchange-rates/monthly-pl'); }

// ── Admin: analytics (usage %, failed sign-ins) ───────────────────
export function getUsageAnalytics() { return request('/admin/analytics/usage'); }
export function getLoginAttempts(params) { return request(`/admin/analytics/login-attempts${qs(params)}`); }
export function getAnalyticsSummary() { return request('/admin/analytics/summary'); }

export async function downloadExport(format, filters) {
  const token = getToken();
  const url = `${API_URL}/export/${format}${qs(filters)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Export failed.');
  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = window.URL.createObjectURL(blob);
  link.download = `account-status.${format === 'excel' ? 'xlsx' : 'pdf'}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
