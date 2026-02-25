// src/services/api.js

// Detect preview base path like /pr/14 from current URL.
// In production root site (no /pr/<N>) it returns ''.
function detectBasePath() {
  if (typeof window === 'undefined') return '';

  const match = window.location.pathname.match(/^\/pr\/\d+/);
  return match ? match[0] : '';
}

// In dev you can set REACT_APP_API_BASE=http://localhost:3001
// If not set, we default to localhost:3001 for dev.
// In production/preview we use the detected base path ('' or '/pr/<N>').
const API_BASE =
  process.env.REACT_APP_API_BASE ||
  (process.env.NODE_ENV === 'production'
    ? detectBasePath()
    : 'http://localhost:3001');


/**
 * @param {Response} res
 * @returns {Promise<any>}
 * @throws {Error} with either the `error` field from JSON, or raw text
 */
async function handleResponse(res) {
  const raw = await res.text();

  if (res.ok) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_e) {
      return raw;
    }
  }

  let msg = raw;
  try {
    const payload = raw ? JSON.parse(raw) : null;
    if (payload && typeof payload === 'object' && payload.error) msg = payload.error;
  } catch (_e) {}

  throw new Error(msg || `HTTP ${res.status}`);
}

/* =========================
   EMPLOYEES
   ========================= */
export async function fetchEmployees() {
  const res = await fetch(`${API_BASE}/api/employees`, { credentials: 'include' });
  const data = await handleResponse(res);
  return data.map(emp => ({ ...emp, name: emp.full_name }));
}

export async function createEmployee(empData) {
  const res = await fetch(`${API_BASE}/api/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(empData),
    credentials: 'include'
  });
  return handleResponse(res);
}

/* =========================
   USERS
   ========================= */
export async function fetchAllUsers() {
  const res = await fetch(`${API_BASE}/api/users`, { credentials: 'include' });
  return handleResponse(res);
}

export async function createUser(userData) {
  const res = await fetch(`${API_BASE}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
    credentials: 'include'
  });
  return handleResponse(res);
}

export async function updateUser(userData) {
  if (!userData.id) {
    throw new Error("updateUser requires an id");
  }
  const res = await fetch(`${API_BASE}/api/users/${userData.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
    credentials: 'include'
  });
  return handleResponse(res);
}

export async function deleteUser(userId) {
  const res = await fetch(`${API_BASE}/api/users/${userId}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  return handleResponse(res);
}

/* =========================
   COMPANY DAILY LIMITS
   ========================= */
export async function fetchCompanyDailyLimits() {
  const res = await fetch(`${API_BASE}/api/company-daily-limits`, { credentials: 'include' });
  return handleResponse(res);
}

export async function updateCompanyDailyLimits(limits) {
  const res = await fetch(`${API_BASE}/api/company-daily-limits`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(limits),
    credentials: 'include'
  });
  return handleResponse(res);
}

/* =========================
   EMPLOYEE DAILY LIMITS
   ========================= */
export async function fetchEmployeeDailyLimits(userId) {
  const res = await fetch(`${API_BASE}/api/employee-daily-limits/${userId}`, { credentials: 'include' });
  return handleResponse(res);
}

export async function updateEmployeeDailyLimits(userId, limits) {
  const res = await fetch(`${API_BASE}/api/employee-daily-limits/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(limits),
    credentials: 'include'
  });
  return handleResponse(res);
}

/* =========================
   SHIFTS
   ========================= */
export async function fetchShifts(weekCode) {
  const res = await fetch(`${API_BASE}/api/shifts/${weekCode}`, { credentials: 'include' });
  return handleResponse(res);
}

export async function createShift(shiftData) {
  const res = await fetch(`${API_BASE}/api/shifts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(shiftData),
    credentials: 'include'
  });
  return handleResponse(res);
}

export async function updateShift(shiftData) {
  if (!shiftData.id) throw new Error("updateShift requires an id");
  const res = await fetch(`${API_BASE}/api/shifts/${shiftData.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(shiftData),
    credentials: 'include'
  });
  return handleResponse(res);
}

export async function deleteShift(shiftId) {
  const idStr = String(shiftId ?? '');
  if (!/^\d+$/.test(idStr)) {
    return { skipped: true, reason: 'non-numeric shift id' };
  }
  const res = await fetch(`${API_BASE}/api/shifts/${idStr}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  return handleResponse(res);
}

/* =========================
   WANTED (Hourly)
   ========================= */
export async function fetchWanted(weekCode) {
  const res = await fetch(`${API_BASE}/api/wanted/${weekCode}`, { credentials: 'include' });
  return handleResponse(res);
}

export async function updateWanted({ weekCode, dayName, hour, wantedCount }) {
  const res = await fetch(`${API_BASE}/api/wanted`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weekCode, dayName, hour, wantedCount }),
    credentials: 'include'
  });
  return handleResponse(res);
}

export async function copyWantedCoverage(fromWeek, toWeek) {
  const res = await fetch(`${API_BASE}/api/wanted/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromWeek, toWeek }),
    credentials: 'include'
  });
  return handleResponse(res);
}

/* =========================
   WANTED TOTAL (Daily)
   ========================= */
export async function fetchWantedTotal(weekCode) {
  const res = await fetch(`${API_BASE}/api/wanted-total/${weekCode}`, { credentials: 'include' });
  return handleResponse(res);
}

export async function updateWantedTotal({ weekCode, dayName, wantedCount }) {
  const res = await fetch(`${API_BASE}/api/wanted-total`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weekCode, dayName, wantedCount }),
    credentials: 'include'
  });
  return handleResponse(res);
}

/* =========================
   NOTES
   ========================= */
export async function fetchNotes() {
  const res = await fetch(`${API_BASE}/api/notes`, { credentials: 'include' });
  return handleResponse(res);
}

export async function createNote(noteData) {
  const res = await fetch(`${API_BASE}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(noteData),
    credentials: 'include'
  });
  return handleResponse(res);
}

export async function updateNote({ id, status, decision, handled_by, note }) {
  if (!id) throw new Error("updateNote requires an id");
  const body = {};
  if (status !== undefined) body.status = status;
  if (decision !== undefined) body.decision = decision;
  if (handled_by !== undefined) body.handled_by = handled_by;
  if (note !== undefined) body.note = note;

  const res = await fetch(`${API_BASE}/api/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include'
  });
  return handleResponse(res);
}

/* =========================
   WEEK STATUS (Publish)
   ========================= */
export async function fetchWeekStatus(weekCode) {
  const res = await fetch(`${API_BASE}/api/week-status/${weekCode}`, { credentials: 'include' });
  return handleResponse(res);
}

export async function updateWeekStatus(weekCode, data) {
  const res = await fetch(`${API_BASE}/api/week-status/${weekCode}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include'
  });
  return handleResponse(res);
}

/* =========================
   BLOCKERS
   ========================= */
export async function fetchBlockers() {
  const res = await fetch(`${API_BASE}/api/blockers`, { credentials: 'include' });
  return handleResponse(res);
}

export async function createBlocker(blockData) {
  const res = await fetch(`${API_BASE}/api/blockers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blockData),
    credentials: 'include'
  });
  return handleResponse(res);
}

export async function updateBlocker(id, blockData) {
  const res = await fetch(`${API_BASE}/api/blockers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blockData),
    credentials: 'include'
  });
  return handleResponse(res);
}
// src/services/api.js

// Detect preview base path like /pr/14 from current URL.
// In production root site (no /pr/<N>) it returns ''.
function detectBasePath() {
  if (typeof window === 'undefined') return '';

  const match = window.location.pathname.match(/^\/pr\/\d+/);
  return match ? match[0] : '';
}

// In dev you can set REACT_APP_API_BASE=http://localhost:3001
// If not set, we default to localhost:3001 for dev.
// In production/preview we use the detected base path ('' or '/pr/<N>').
const API_BASE =
  process.env.REACT_APP_API_BASE ||
  (process.env.NODE_ENV === 'production'
    ? detectBasePath()
    : 'http://localhost:3001');

/**
 * @param {Response} res
 * @returns {Promise<any>}
 * @throws {Error} with either the `error` field from JSON, or raw text
 */
async function handleResponse(res) {
  const raw = await res.text();

  if (res.ok) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_e) {
      return raw;
    }
  }

  let msg = raw;
  try {
    const payload = raw ? JSON.parse(raw) : null;
    if (payload && typeof payload === 'object' && payload.error) msg = payload.error;
  } catch (_e) {}

  throw new Error(msg || `HTTP ${res.status}`);
}

/**
 * Small helpers so we don't repeat URL/credentials everywhere.
 * Paths must start with '/' (e.g. '/permissions' => `${API_BASE}/api/permissions`)
 */
async function apiGet(path) {
  const res = await fetch(`${API_BASE}/api${path}`, { credentials: 'include' });
  return handleResponse(res);
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  return handleResponse(res);
}

async function apiPut(path, body) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  return handleResponse(res);
}

async function apiDelete(path) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   EMPLOYEES
   ========================= */
export async function fetchEmployees() {
  const data = await apiGet('/employees');
  return data.map((emp) => ({ ...emp, name: emp.full_name }));
}

export async function createEmployee(empData) {
  return apiPost('/employees', empData);
}

/* =========================
   USERS
   ========================= */
export async function fetchAllUsers() {
  return apiGet('/users');
}

export async function createUser(userData) {
  return apiPost('/users', userData);
}

export async function updateUser(userData) {
  if (!userData.id) {
    throw new Error('updateUser requires an id');
  }
  return apiPut(`/users/${userData.id}`, userData);
}

export async function deleteUser(userId) {
  return apiDelete(`/users/${userId}`);
}

/* =========================
   COMPANY DAILY LIMITS
   ========================= */
export async function fetchCompanyDailyLimits() {
  return apiGet('/company-daily-limits');
}

export async function updateCompanyDailyLimits(limits) {
  return apiPut('/company-daily-limits', limits);
}

/* =========================
   EMPLOYEE DAILY LIMITS
   ========================= */
export async function fetchEmployeeDailyLimits(userId) {
  return apiGet(`/employee-daily-limits/${userId}`);
}

export async function updateEmployeeDailyLimits(userId, limits) {
  return apiPut(`/employee-daily-limits/${userId}`, limits);
}

/* =========================
   SHIFTS
   ========================= */
export async function fetchShifts(weekCode) {
  return apiGet(`/shifts/${weekCode}`);
}

export async function createShift(shiftData) {
  // keep the same content-type as you had
  const res = await fetch(`${API_BASE}/api/shifts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(shiftData),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateShift(shiftData) {
  if (!shiftData.id) throw new Error('updateShift requires an id');
  const res = await fetch(`${API_BASE}/api/shifts/${shiftData.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(shiftData),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function deleteShift(shiftId) {
  const idStr = String(shiftId ?? '');
  if (!/^\d+$/.test(idStr)) {
    return { skipped: true, reason: 'non-numeric shift id' };
  }
  return apiDelete(`/shifts/${idStr}`);
}

/* =========================
   WANTED (Hourly)
   ========================= */
export async function fetchWanted(weekCode) {
  return apiGet(`/wanted/${weekCode}`);
}

export async function updateWanted({ weekCode, dayName, hour, wantedCount }) {
  return apiPut('/wanted', { weekCode, dayName, hour, wantedCount });
}

export async function copyWantedCoverage(fromWeek, toWeek) {
  return apiPost('/wanted/copy', { fromWeek, toWeek });
}

/* =========================
   WANTED TOTAL (Daily)
   ========================= */
export async function fetchWantedTotal(weekCode) {
  return apiGet(`/wanted-total/${weekCode}`);
}

export async function updateWantedTotal({ weekCode, dayName, wantedCount }) {
  return apiPut('/wanted-total', { weekCode, dayName, wantedCount });
}

/* =========================
   NOTES
   ========================= */
export async function fetchNotes() {
  return apiGet('/notes');
}

export async function createNote(noteData) {
  return apiPost('/notes', noteData);
}

export async function updateNote({ id, status, decision, handled_by, note }) {
  if (!id) throw new Error('updateNote requires an id');

  const body = {};
  if (status !== undefined) body.status = status;
  if (decision !== undefined) body.decision = decision;
  if (handled_by !== undefined) body.handled_by = handled_by;
  if (note !== undefined) body.note = note;

  return apiPut(`/notes/${id}`, body);
}

/* =========================
   WEEK STATUS (Publish)
   ========================= */
export async function fetchWeekStatus(weekCode) {
  return apiGet(`/week-status/${weekCode}`);
}

export async function updateWeekStatus(weekCode, data) {
  return apiPut(`/week-status/${weekCode}`, data);
}

/* =========================
   BLOCKERS
   ========================= */
export async function fetchBlockers() {
  return apiGet('/blockers');
}

export async function createBlocker(blockData) {
  return apiPost('/blockers', blockData);
}

export async function updateBlocker(id, blockData) {
  return apiPut(`/blockers/${id}`, blockData);
}

export async function deleteBlocker(id) {
  return apiDelete(`/blockers/${id}`);
}

/* =========================
   WEEK LOCK (NEW)
   ========================= */
export async function fetchWeekLockStatus(weekCode) {
  return apiGet(`/week-lock/${weekCode}`);
}

export async function updateWeekLock(weekCode, { locked, lock_date }) {
  return apiPut(`/week-lock/${weekCode}`, { locked, lock_date });
}

export async function sendRegistrationReminder(weekCode) {
  // This endpoint is POST with no body
  const res = await fetch(`${API_BASE}/api/week-lock/${weekCode}/notify`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   PERMISSIONS (fix build error)
   ========================= */
// GET all available permissions
export async function fetchAllPermissions() {
  // backend: GET /api/permissions
  return apiGet('/permissions');
}

// GET permissions for a specific role (array of permission IDs)
export async function fetchRolePermissions(roleId) {
  return apiGet(`/roles/${roleId}/permissions`);
}

// PUT update permissions for a role
// Expecting body: { permissionIds: number[] } (adjust if your backend expects a different field name)
export async function updateRolePermissions(roleId, permissionIds) {
  return apiPut(`/roles/${roleId}/permissions`, { permissionIds });
}
export async function deleteBlocker(id) {
  const res = await fetch(`${API_BASE}/api/blockers/${id}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  return handleResponse(res);
}

/* =========================
   WEEK LOCK (NEW)
   ========================= */
export async function fetchWeekLockStatus(weekCode) {
  const res = await fetch(`${API_BASE}/api/week-lock/${weekCode}`, { credentials: 'include' });
  return handleResponse(res);
}

export async function updateWeekLock(weekCode, { locked, lock_date }) {
  const body = { locked, lock_date };
  const res = await fetch(`${API_BASE}/api/week-lock/${weekCode}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include'
  });
  return handleResponse(res);
}

export async function sendRegistrationReminder(weekCode) {
  const res = await fetch(`${API_BASE}/api/week-lock/${weekCode}/notify`, {
    method: 'POST',
    credentials: 'include'
  });
  return handleResponse(res);
}