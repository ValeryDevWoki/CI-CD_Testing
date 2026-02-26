// src/services/api.js

function getPrPrefixFromPathname(pathname) {
  // "/pr/14/admin-dashboard" => "/pr/14"
  const m = String(pathname || '').match(/^\/pr\/\d+(?=\/|$)/);
  return m ? m[0] : '';
}

// Optional override (absolute URL or relative prefix like "/pr/14")
const ENV_BASE = (process.env.REACT_APP_API_BASE || '').trim();

// Detect preview prefix at runtime
const PR_PREFIX =
  typeof window !== 'undefined' ? getPrPrefixFromPathname(window.location.pathname) : '';

// Final API base:
// - if REACT_APP_API_BASE is set -> use it
// - else in production -> use "/pr/<n>" (or "" for main site)
// - else (local dev) -> localhost backend
const API_BASE =
  ENV_BASE ||
  (process.env.NODE_ENV === 'production' ? PR_PREFIX : 'http://localhost:3001');

/**
 * @param {Response} res
 * @returns {Promise<any>}
 * @throws {Error} with either the `error` field from JSON, or raw text
 */
async function handleResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (res.ok) {
    if (res.status === 204) return null;
    return isJson ? res.json() : res.text();
  }

  // error case
  let message = `Request failed: ${res.status}`;
  try {
    if (isJson) {
      const data = await res.json();
      message = data?.error || data?.message || JSON.stringify(data);
    } else {
      const text = await res.text();
      if (text) message = text;
    }
  } catch (_) {
    // ignore parsing error
  }

  const err = new Error(message);
  err.status = res.status;
  throw err;
}

/* =========================
   EMPLOYEES / USERS
   ========================= */

export async function fetchEmployees() {
  const res = await fetch(`${API_BASE}/api/employees`, { credentials: 'include' });
  return handleResponse(res);
}

export async function createEmployee(empData) {
  const res = await fetch(`${API_BASE}/api/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(empData),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function fetchAllUsers() {
  const res = await fetch(`${API_BASE}/api/users`, { credentials: 'include' });
  return handleResponse(res);
}

export async function createUser(userData) {
  const res = await fetch(`${API_BASE}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateUser(userData) {
  const res = await fetch(`${API_BASE}/api/users/${userData.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function deleteUser(userId) {
  const res = await fetch(`${API_BASE}/api/users/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   DAILY LIMITS
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
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function fetchEmployeeDailyLimits(userId) {
  const res = await fetch(`${API_BASE}/api/employee-daily-limits/${userId}`, {
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateEmployeeDailyLimits(userId, limits) {
  const res = await fetch(`${API_BASE}/api/employee-daily-limits/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(limits),
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   AUTH
   ========================= */

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function checkAuth() {
  const res = await fetch(`${API_BASE}/api/check-auth`, { credentials: 'include' });
  return handleResponse(res);
}

export async function logout() {
  const res = await fetch(`${API_BASE}/api/logout`, { credentials: 'include' });
  return handleResponse(res);
}

export async function fetchCurrentUser() {
  const res = await fetch(`${API_BASE}/api/current-user`, { credentials: 'include' });
  return handleResponse(res);
}

/* =========================
   SCHEDULE / SHIFTS
   ========================= */

export async function fetchSchedule(weekCode) {
  const res = await fetch(`${API_BASE}/api/shifts/${weekCode}`, { credentials: 'include' });
  return handleResponse(res);
}

export async function createShift(shiftData) {
  const res = await fetch(`${API_BASE}/api/shifts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(shiftData),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateShift(shiftData) {
  const res = await fetch(`${API_BASE}/api/shifts/${shiftData.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(shiftData),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function deleteShift(shiftId) {
  const res = await fetch(`${API_BASE}/api/shifts/${shiftId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   WANTED COVERAGE
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
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function copyWantedCoverage(fromWeek, toWeek) {
  const res = await fetch(`${API_BASE}/api/wanted/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromWeek, toWeek }),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function fetchWantedTotal(weekCode) {
  const res = await fetch(`${API_BASE}/api/wanted-total/${weekCode}`, { credentials: 'include' });
  return handleResponse(res);
}

export async function updateWantedTotal({ weekCode, dayName, wantedCount }) {
  const res = await fetch(`${API_BASE}/api/wanted-total`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weekCode, dayName, wantedCount }),
    credentials: 'include',
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
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateNote({ id, status, decision, handled_by, note }) {
  const res = await fetch(`${API_BASE}/api/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, decision, handled_by, note }),
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   WEEK STATUS
   ========================= */

export async function fetchWeekStatus(weekCode) {
  const res = await fetch(`${API_BASE}/api/week-status/${weekCode}`, { credentials: 'include' });
  return handleResponse(res);
}

export async function updateWeekStatus(weekCode, data) {
  const res = await fetch(`${API_BASE}/api/week-status/${weekCode}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
    credentials: 'include',
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
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateBlocker(id, blockData) {
  const res = await fetch(`${API_BASE}/api/blockers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blockData),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function deleteBlocker(id) {
  const res = await fetch(`${API_BASE}/api/blockers/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   STATIC SHIFTS
   ========================= */

export async function fetchStaticShifts(activeOnly = false) {
  const res = await fetch(`${API_BASE}/api/shifts-static?activeOnly=${activeOnly ? '1' : '0'}`, {
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function createStaticShift(data) {
  const res = await fetch(`${API_BASE}/api/shifts-static`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateStaticShift(id, data) {
  const res = await fetch(`${API_BASE}/api/shifts-static/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function deleteStaticShift(id) {
  const res = await fetch(`${API_BASE}/api/shifts-static/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function applyStaticShifts({ currentWeek, nextWeek }) {
  const res = await fetch(`${API_BASE}/api/shifts-static/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentWeek, nextWeek }),
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   TEMPLATES
   ========================= */

export async function fetchTemplates() {
  const res = await fetch(`${API_BASE}/api/templates`, { credentials: 'include' });
  return handleResponse(res);
}

export async function createTemplate(data) {
  const res = await fetch(`${API_BASE}/api/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateTemplate(id, data) {
  const res = await fetch(`${API_BASE}/api/templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function deleteTemplate(id) {
  const res = await fetch(`${API_BASE}/api/templates/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   REMINDERS
   ========================= */

export async function fetchReminders(weekCode) {
  const res = await fetch(`${API_BASE}/api/reminders/${weekCode}`, { credentials: 'include' });
  return handleResponse(res);
}

export async function createReminder(data) {
  const res = await fetch(`${API_BASE}/api/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateReminder(id, data) {
  const res = await fetch(`${API_BASE}/api/reminders/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function deleteReminder(id) {
  const res = await fetch(`${API_BASE}/api/reminders/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function manualSendReminder(data) {
  const res = await fetch(`${API_BASE}/api/reminders/manual-send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function sendRegistrationReminder(weekCode) {
  const res = await fetch(`${API_BASE}/api/reminders/send-registration/${weekCode}`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   ARRIVAL
   ========================= */

export async function fetchDailyArrival(start, end) {
  const res = await fetch(`${API_BASE}/api/arrival?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function createDailyArrival({ employee_id, date, status }) {
  const res = await fetch(`${API_BASE}/api/arrival`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee_id, date, status }),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateDailyArrival(id, { date, status }) {
  const res = await fetch(`${API_BASE}/api/arrival/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, status }),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function deleteDailyArrival(id) {
  const res = await fetch(`${API_BASE}/api/arrival/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   WEEK LOCK
   ========================= */

export async function fetchWeekLockStatus(weekCode) {
  const res = await fetch(`${API_BASE}/api/week-lock/${weekCode}`, { credentials: 'include' });
  return handleResponse(res);
}

export async function updateWeekLock(weekCode, { locked, lock_date }) {
  const res = await fetch(`${API_BASE}/api/week-lock/${weekCode}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locked, lock_date }),
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   ROLES / PERMISSIONS
   ========================= */

export async function fetchRoles() {
  const res = await fetch(`${API_BASE}/api/roles`, { credentials: 'include' });
  return handleResponse(res);
}

export async function createRole(roleData) {
  const res = await fetch(`${API_BASE}/api/roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(roleData),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateRole(roleId, roleData) {
  const res = await fetch(`${API_BASE}/api/roles/${roleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(roleData),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function deleteRole(roleId) {
  const res = await fetch(`${API_BASE}/api/roles/${roleId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateRolePermissions(roleId, permissionIds) {
  const res = await fetch(`${API_BASE}/api/roles/${roleId}/permissions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissionIds }),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function fetchAllPermissions() {
  const res = await fetch(`${API_BASE}/api/permissions`, { credentials: 'include' });
  return handleResponse(res);
}

export async function fetchMyPermissions() {
  const res = await fetch(`${API_BASE}/api/my-permissions`, { credentials: 'include' });
  return handleResponse(res);
}

export async function fetchRolePermissions(roleId) {
  const res = await fetch(`${API_BASE}/api/roles/${roleId}/permissions`, { credentials: 'include' });
  return handleResponse(res);
}

/* =========================
   SKILLS
   ========================= */

export async function fetchSkills() {
  const res = await fetch(`${API_BASE}/api/skills`, { credentials: 'include' });
  return handleResponse(res);
}

export async function createSkill(skillData) {
  const res = await fetch(`${API_BASE}/api/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skillData),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateSkill(skillId, skillData) {
  const res = await fetch(`${API_BASE}/api/skills/${skillId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skillData),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function deleteSkill(skillId) {
  const res = await fetch(`${API_BASE}/api/skills/${skillId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

/* =========================
   MANAGERS
   ========================= */

export async function fetchManagerCategories() {
  const res = await fetch(`${API_BASE}/api/manager-categories`, { credentials: 'include' });
  return handleResponse(res);
}

export async function createManagerCategory({ title }) {
  const res = await fetch(`${API_BASE}/api/manager-categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateManagerCategory(id, { title }) {
  const res = await fetch(`${API_BASE}/api/manager-categories/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function deleteManagerCategory(id) {
  const res = await fetch(`${API_BASE}/api/manager-categories/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function fetchManagers() {
  const res = await fetch(`${API_BASE}/api/managers`, { credentials: 'include' });
  return handleResponse(res);
}

export async function createManager({ full_name, category_id }) {
  const res = await fetch(`${API_BASE}/api/managers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name, category_id }),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateManager(id, { full_name, category_id }) {
  const res = await fetch(`${API_BASE}/api/managers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name, category_id }),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function deleteManager(id) {
  const res = await fetch(`${API_BASE}/api/managers/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function assignEmployeeManager({ employee_id, manager_id }) {
  const res = await fetch(`${API_BASE}/api/employee-manager`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employee_id, manager_id }),
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function unassignEmployeeManager(employee_id) {
  const res = await fetch(`${API_BASE}/api/employee-manager/${employee_id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function fetchEmployeesWithManager() {
  const res = await fetch(`${API_BASE}/api/employees-with-manager`, { credentials: 'include' });
  return handleResponse(res);
}

/* =========================
   COMPAT ALIASES (do not break old imports)
   ========================= */

// ✅ Fix build: some components import { fetchShifts } from '../services/api'
export async function fetchShifts(weekCode) {
  return fetchSchedule(weekCode);
}

// ✅ Alias: some components import fetchShiftsByWeek
export async function fetchShiftsByWeek(weekCode) {
  return fetchSchedule(weekCode);
}

// ✅ Mark shifts as sent (expects { shiftIds: number[] })
export async function markShiftsSent(shiftIds) {
  const res = await fetch(`${API_BASE}/api/shifts/mark-sent`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shiftIds }),
    credentials: 'include',
  });
  return handleResponse(res);
}

// ✅ Weekly submission status (employee submission status)
export async function fetchWeeklyStatus(weekCode) {
  const res = await fetch(`${API_BASE}/api/employee-submission-status/${weekCode}`, {
    credentials: 'include',
  });
  return handleResponse(res);
}

export async function updateWeeklyStatus(id, data) {
  const res = await fetch(`${API_BASE}/api/employee-submission-status/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
    credentials: 'include',
  });
  return handleResponse(res);
}

// ✅ Daily arrival helpers
export async function fetchDailyArrivalByWeek(weekCode) {
  const res = await fetch(`${API_BASE}/api/arrival/week/${weekCode}`, {
    credentials: 'include',
  });
  return handleResponse(res);
}

// Upsert-style endpoint used by some UI flows
export async function upsertDailyArrival(data) {
  const res = await fetch(`${API_BASE}/api/arrival`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
    credentials: 'include',
  });
  return handleResponse(res);
}