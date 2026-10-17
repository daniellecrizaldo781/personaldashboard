/**
 * API client for the Personal Dashboard.
 * Handles authentication, data CRUD, push subscriptions, and Slack integration.
 */

const API_BASE = '';
const TOKEN_KEY = 'dashboard_auth_token';

// ===== Auth =====
function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function getAuthHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function api(path, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${path}`, options);

  if (response.status === 401) {
    // Redirect to login
    window.location.href = '/dashboard.html#/login';
    throw new Error('Authentication required');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  if (response.status === 204) return null;
  return response.json();
}

// ===== Login =====
async function login(username, password) {
  const response = await api('/api/auth/login', 'POST', { username, password });
  saveToken(response.token);
  return response;
}

function logout() {
  clearToken();
  window.location.href = '/dashboard.html#/login';
}

// ===== Settings =====
async function getSettings() {
  return api('/api/settings', 'GET');
}

async function updateSetting(key, value) {
  return api('/api/settings', 'PUT', { key, value });
}

// ===== Tasks =====
async function getTasks(filters = {}) {
  const q = new URLSearchParams(filters).toString();
  return api(`/api/tasks${q ? `?${q}` : ''}`, 'GET');
}

async function getTask(id) {
  return api(`/api/tasks/${id}`, 'GET');
}

async function createTask(data) {
  return api('/api/tasks', 'POST', data);
}

async function updateTask(id, data) {
  return api(`/api/tasks/${id}`, 'PUT', data);
}

async function completeTask(id) {
  return api(`/api/tasks/${id}/complete`, 'PUT');
}

async function restoreTask(id) {
  return api(`/api/tasks/${id}/restore`, 'PUT');
}

async function getArchivedTasks(search = '') {
  const q = search ? `?search=${encodeURIComponent(search)}` : '';
  return api(`/api/tasks/archived${q}`, 'GET');
}

async function deleteTask(id) {
  return api(`/api/tasks/${id}`, 'DELETE');
}

// ===== Notes =====
async function getNotes(filters = {}) {
  const q = new URLSearchParams(filters).toString();
  return api(`/api/notes${q ? `?${q}` : ''}`, 'GET');
}

async function getNote(id) {
  return api(`/api/notes/${id}`, 'GET');
}

async function createNote(data) {
  let url = '/api/notes';
  if (data.quick) {
    // Quick note - just title and content
    url = '/api/notes';
  }
  const result = await api(url, 'POST', data);
  return result;
}

async function updateNote(id, data) {
  return api(`/api/notes/${id}`, 'PUT', data);
}

async function archiveNote(id) {
  return api(`/api/notes/${id}/archive`, 'PUT');
}

async function deleteNote(id) {
  return api(`/api/notes/${id}`, 'DELETE');
}

// ===== Meetings =====
async function getMeetings(filters = {}) {
  const q = new URLSearchParams(filters).toString();
  return api(`/api/meetings${q ? `?${q}` : ''}`, 'GET');
}

async function getMeeting(id) {
  return api(`/api/meetings/${id}`, 'GET');
}

async function createMeeting(data) {
  return api('/api/meetings', 'POST', data);
}

async function updateMeeting(id, data) {
  return api(`/api/meetings/${id}`, 'PUT', data);
}

async function archiveMeeting(id) {
  return api(`/api/meetings/${id}/archive`, 'PUT');
}

async function deleteMeeting(id) {
  return api(`/api/meetings/${id}`, 'DELETE');
}

// ===== Cascades =====
async function getCascades(filters = {}) {
  const q = new URLSearchParams(filters).toString();
  return api(`/api/cascades${q ? `?${q}` : ''}`, 'GET');
}

async function getCascade(id) {
  return api(`/api/cascades/${id}`, 'GET');
}

async function createCascade(data) {
  return api('/api/cascades', 'POST', data);
}

async function updateCascade(id, data) {
  return api(`/api/cascades/${id}`, 'PUT', data);
}

async function markCascadeCascaded(id) {
  return api(`/api/cascades/${id}/cascaded`, 'PUT');
}

async function archiveCascade(id) {
  return api(`/api/cascades/${id}/archive`, 'PUT');
}

async function restoreCascade(id) {
  return api(`/api/cascades/${id}/restore`, 'PUT');
}

async function deleteCascade(id) {
  return api(`/api/cascades/${id}`, 'DELETE');
}

// ===== Slack Alerts =====
async function getSlackAlerts(filters = {}) {
  const q = new URLSearchParams(filters).toString();
  return api(`/api/slack/alerts${q ? `?${q}` : ''}`, 'GET');
}

async function getSlackAlert(id) {
  return api(`/api/slack/alerts/${id}`, 'GET');
}

async function createSlackAlert(data) {
  return api('/api/slack/alerts', 'POST', data);
}

async function updateSlackAlert(id, data) {
  return api(`/api/slack/alerts/${id}`, 'PUT', data);
}

async function archiveSlackAlert(id) {
  return api(`/api/slack/alerts/${id}/archive`, 'PUT');
}

async function getArchivedSlackAlerts() {
  return api('/api/slack/alerts/archived', 'GET');
}

// ===== Push Notifications =====
async function getVapidKey() {
  return api('/api/push/vapid-key', 'GET');
}

async function saveSubscription(subscription) {
  return api('/api/push/subscribe', 'POST', subscription);
}

async function getSubscriptions() {
  return api('/api/push/subscriptions', 'GET');
}

async function removeSubscription(endpoint) {
  return api(`/api/push/subscriptions/${encodeURIComponent(endpoint)}`, 'DELETE');
}

async function sendTestNotification() {
  return api('/api/push/test', 'POST');
}

// ===== Notifications =====
async function getNotifications() {
  return api('/api/notifications', 'GET');
}

async function getActiveAlerts() {
  return api('/api/notifications/alerts', 'GET');
}

async function acknowledgeNotification(id) {
  return api(`/api/notifications/${id}/acknowledge`, 'PUT');
}

// ===== Export =====
async function exportData() {
  const token = getToken();
  const response = await fetch(`${API_BASE}/api/export`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dashboard-export.json';
  a.click();
  URL.revokeObjectURL(url);
}

// Export all functions
window.DashboardAPI = {
  login, logout, getToken, getAuthHeaders,
  getSettings, updateSetting,
  getTasks, getTask, createTask, updateTask, completeTask, restoreTask,
  getArchivedTasks, deleteTask,
  getNotes, getNote, createNote, updateNote, archiveNote, deleteNote,
  getMeetings, getMeeting, createMeeting, updateMeeting, archiveMeeting, deleteMeeting,
  getCascades, getCascade, createCascade, updateCascade, markCascadeCascaded,
  archiveCascade, restoreCascade, deleteCascade,
  getSlackAlerts, getSlackAlert, createSlackAlert, updateSlackAlert,
  archiveSlackAlert, getArchivedSlackAlerts,
  getVapidKey, saveSubscription, getSubscriptions, removeSubscription,
  sendTestNotification,
  getNotifications, getActiveAlerts, acknowledgeNotification,
  exportData
};
