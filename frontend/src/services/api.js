// frontend/src/services/api.js

// Detect preview base path like /pr/14 from current URL.
// In production root site (no /pr/<N>) it returns ''.
function detectBasePath() {
  if (typeof window === 'undefined') return '';
  const match = window.location.pathname.match(/^\/pr\/\d+/);
  return match ? match[0] : '';
}

// If you set REACT_APP_API_BASE it overrides everything (useful for local dev).
// Otherwise:
// - production/preview: use detected base path ('' or '/pr/<N>')
// - dev: default to http://localhost:3001
const API_BASE =
  process.env.REACT_APP_API_BASE ||
  (process.env.NODE_ENV === 'production' ? detectBasePath() : 'http://localhost:3001');

/**
 * @param {Response} res
 * @returns {Promise<any>}
 * @throws {Error} with either JSON.error or raw text
 */
async function handleResponse(res) {
  const raw = await res.text();

  if (res.ok) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  let msg = raw;
  try {
    const payload = raw ? JSON.parse(raw) : null;
    if (payload && typeof payload === 'object' && payload.error) msg = payload.error;
  } catch {}

  throw new Error(msg || `HTTP ${res.status}`);
}

// Helpers: pass path like '/skills' => `${API_BASE}/api/skills`
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
  if (!userData.id) throw new Error('updateUser requires an id');
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
  if (!/^\d+$/.test(idStr)) return { skipped: true, reason: 'non-numeric shift id' };
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
   WEEK STATUS
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
   WEEK LOCK
   ========================= */
export async function fetchWeekLockStatus(weekCode) {
  return apiGet(`/week-lock/${weekCode}`);
}

export async function updateWeekLock(weekCode, { locked, lock_date }) {
  return apiPut(`/week-lock/${weekCode}`, { locked, lock_date });
}

export async function sendRegistrationReminder(weekCode) {
  const res = await fetch(`${API_BASE}/api/week-lock/${weekCode}/notify`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   PERMISSIONS ✅
   ========================= */
export async function fetchAllPermissions() {
  return apiGet('/permissions'); // backend: GET /api/permissions
}

export async function fetchRolePermissions(roleId) {
  return apiGet(`/roles/${roleId}/permissions`);
}

export async function updateRolePermissions(roleId, permissionIds) {
  return apiPut(`/roles/${roleId}/permissions`, { permissionIds });
}

/* =========================
   SKILLS ✅
   ========================= */
export async function fetchSkills() {
  return apiGet('/skills'); // backend: GET /api/skills
}

export async function createSkill(skillName) {
  // backend ожидает { skill_name }
  return apiPost('/skills', { skill_name: skillName });
}

export async function updateSkill(id, newSkillName) {
  // backend: PUT /api/skills/:id
  return apiPut(`/skills/${id}`, { skill_name: newSkillName });
}

export async function deleteSkill(id) {
  // backend: DELETE /api/skills/:id
  return apiDelete(`/skills/${id}`);
}