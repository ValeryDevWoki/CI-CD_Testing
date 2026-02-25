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