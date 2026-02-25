// src/services/api.js

// Declare API_BASE only once at the top:
const API_BASE =
  process.env.REACT_APP_API_BASE ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');


/**
 * @param {Response} res
 * @returns {Promise<any>}
 * @throws {Error} with either the `error` field from JSON, or raw text
 */
async function handleResponse(res) {
    // IMPORTANT: a Response body stream can be read only once.
    // Read as text once, then try to parse JSON from it.
    const raw = await res.text();

    // If success, return parsed JSON (or raw text if empty/non-json).
    if (res.ok) {
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (_e) {
            return raw;
        }
    }

    // Error: try to extract { error: "..." } from JSON text.
    let msg = raw;
    try {
        const payload = raw ? JSON.parse(raw) : null;
        if (payload && typeof payload === 'object' && payload.error) msg = payload.error;
    } catch (_e) {
        // keep raw
    }

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
// These functions assume the backend now handles daily limits for the company
// as an array of objects, e.g.,
// [ { day_name: "Sunday", max_hours: 8 }, { day_name: "Monday", max_hours: 9 }, ... ]

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
// For each employee, the daily limit endpoint returns an array like:
// [ { day_name: "Sunday", max_hours: 8 }, { day_name: "Monday", max_hours: 9 }, ... ]
// and the update endpoint accepts a similar array.

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
    // Guard: avoid calling /api/shifts/:id with non-numeric IDs like "static-123"
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

/**
 * updateWeekStatus(weekCode, data)
 * data might be { is_published: true, changedShiftIds?: number[] }
 */
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
        method:'DELETE',
        credentials: 'include'
    });
    return handleResponse(res);
}

/* =========================
   EXTRA SHIFT HELPERS
   ========================= */
export async function fetchShiftsByWeek(weekCode) {
    const res = await fetch(`${API_BASE}/api/shifts/${weekCode}`, { credentials: 'include' });
    return handleResponse(res);
}

export async function markShiftsSent(shiftIds) {
    const numericIds = shiftIds.map(id => parseInt(id, 10)).filter(x => !isNaN(x));
    if (!numericIds.length) {
        throw new Error("No valid numeric shift IDs to send.");
    }

    const res = await fetch(`${API_BASE}/api/shifts/mark-sent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftIds: numericIds }),
        credentials: 'include'
    });
    return handleResponse(res);
}

export async function markShiftsPublished(shiftIds) {
    const numericIds = shiftIds.map(id => parseInt(id, 10)).filter(x => !isNaN(x));
    if (!numericIds.length) {
        throw new Error("No valid numeric shift IDs to publish.");
    }

    const res = await fetch(`${API_BASE}/api/shifts/mark-published`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftIds: numericIds }),
        credentials: 'include'
    });
    return handleResponse(res);
}

/* =========================
   SHIFTS_STATIC
   ========================= */
export async function fetchStaticShifts(activeOnly = false) {
    const url = `${API_BASE}/api/shifts-static?activeOnly=${activeOnly}`;
    const res = await fetch(url, { credentials: 'include' });
    return handleResponse(res);
}

export async function createStaticShift(data) {
    const doReq = async (payload) => {
        const res = await fetch(`${API_BASE}/api/shifts-static`, {
            method:'POST',
            headers: { 'Content-Type':'application/json' },
            body: JSON.stringify(payload),
            credentials: 'include'
        });
        return handleResponse(res);
    };

    try {
        return await doReq(data);
    } catch (err) {
        const msg = String(err?.message || err || '');
        if (data && Object.prototype.hasOwnProperty.call(data, 'start_week_code') && /start_week_code|column.*does not exist|unknown column/i.test(msg)) {
            const { start_week_code, ...rest } = data;
            return doReq(rest);
        }
        throw err;
    }
}

export async function updateStaticShift(id, data) {
    const doReq = async (payload) => {
        const res = await fetch(`${API_BASE}/api/shifts-static/${id}`, {
            method:'PUT',
            headers: { 'Content-Type':'application/json' },
            body: JSON.stringify(payload),
            credentials: 'include'
        });
        return handleResponse(res);
    };

    try {
        return await doReq(data);
    } catch (err) {
        const msg = String(err?.message || err || '');
        if (data && Object.prototype.hasOwnProperty.call(data, 'start_week_code') && /start_week_code|column.*does not exist|unknown column/i.test(msg)) {
            const { start_week_code, ...rest } = data;
            return doReq(rest);
        }
        throw err;
    }
}

export async function deleteStaticShift(id) {
    const res = await fetch(`${API_BASE}/api/shifts-static/${id}`, {
        method:'DELETE',
        credentials: 'include'
    });
    return handleResponse(res);
}

export async function applyStaticShifts({ currentWeek, nextWeek }) {
    const res = await fetch(`${API_BASE}/api/shifts-static/apply`, {
        method:'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ currentWeek, nextWeek }),
        credentials: 'include'
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
        credentials: 'include'
    });
    return handleResponse(res);
}

export async function updateTemplate(id, data) {
    const res = await fetch(`${API_BASE}/api/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
    });
    return handleResponse(res);
}

export async function deleteTemplate(id) {
    const res = await fetch(`${API_BASE}/api/templates/${id}`, {
        method: 'DELETE',
        credentials: 'include'
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
        credentials: 'include'
    });
    return handleResponse(res);
}

/**
 * updateReminder(id, data)
 * data => { template_id?, send_at?, is_sent?, reminder_frequency?, is_active? }
 */
export async function updateReminder(id, data) {
    if (!id) throw new Error("updateReminder requires an id");
    const res = await fetch(`${API_BASE}/api/reminders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
    });
    return handleResponse(res);
}

export async function deleteReminder(id) {
    const res = await fetch(`${API_BASE}/api/reminders/${id}`, {
        method: 'DELETE',
        credentials: 'include'
    });
    return handleResponse(res);
}

/**
 * Manual send => pick a template, list of employees, etc.
 * POST /api/reminders/manual-send => { template_id, employeeIds }
 */
export async function manualSendReminder(data) {
    const res = await fetch(`${API_BASE}/api/reminders/manual-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
    });
    return handleResponse(res);
}

/* =========================
   DAILY ARRIVAL
   ========================= */
export async function fetchDailyArrival(start, end) {
    const url = `${API_BASE}/api/arrival?start=${start}&end=${end}`;
    const res = await fetch(url, { credentials: 'include' });
    return handleResponse(res);
}

export async function createDailyArrival({ employee_id, date, status }) {
    const res = await fetch(`${API_BASE}/api/arrival`, {
        method:'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id, date, status }),
        credentials: 'include'
    });
    return handleResponse(res);
}

export async function updateDailyArrival(id, { date, status }) {
    const res = await fetch(`${API_BASE}/api/arrival/${id}`, {
        method:'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, status }),
        credentials: 'include'
    });
    return handleResponse(res);
}

export async function deleteDailyArrival(id) {
    const res = await fetch(`${API_BASE}/api/arrival/${id}`, {
        method:'DELETE',
        credentials: 'include'
    });
    return handleResponse(res);
}

/* =========================
   WEEKLY REGISTRATION (Opened/Registered/Sent)
   ========================= */

/**
 * GET /api/employee-submission-status/:weekCode
 */
export async function fetchWeeklyStatus(weekCode) {
    const url = `${API_BASE}/api/employee-submission-status/${weekCode}`;
    const res = await fetch(url, { credentials: 'include' });
    return handleResponse(res);
}

/**
 * PUT /api/employee-submission-status/:id
 * data => { opened_at?, registered_at?, submitted_at? }
 */
export async function updateWeeklyStatus(id, data) {
    const res = await fetch(`${API_BASE}/api/employee-submission-status/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
    });
    return handleResponse(res);
}

export async function fetchDailyArrivalByWeek(weekCode) {
    const res = await fetch(`${API_BASE}/api/arrival/week/${weekCode}`, { credentials: 'include' });
    return handleResponse(res);
}

export async function upsertDailyArrival({ employee_id, date, status, week_code }) {
    const res = await fetch(`${API_BASE}/api/arrival`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id, date, status, week_code }),
        credentials: 'include'
    });
    return handleResponse(res);
}

/* =========================
   WEEK LOCK (NEW)
   ========================= */

// GET /api/week-lock/:weekCode => { locked: boolean, lock_date?: string }
export async function fetchWeekLockStatus(weekCode) {
    const res = await fetch(`${API_BASE}/api/week-lock/${weekCode}`, { credentials: 'include' });
    return handleResponse(res);
}

// PUT /api/week-lock/:weekCode => { locked, lock_date }
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

// POST /api/week-lock/:weekCode/notify => sends Template #1
export async function sendRegistrationReminder(weekCode) {
    const res = await fetch(`${API_BASE}/api/week-lock/${weekCode}/notify`, {
        method: 'POST',
        credentials: 'include'
    });
    return handleResponse(res);
}

/* =========================
   ROLES (Role Management)
   ========================= */

// GET all roles (admin only)
export async function fetchRoles() {
    const res = await fetch(`${API_BASE}/api/roles`, { credentials: 'include' });
    return handleResponse(res);
}

// POST a new role (admin only)
// roleData should be an object like: { role_name: "NewRole" }
export async function createRole(roleData) {
    const res = await fetch(`${API_BASE}/api/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roleData),
        credentials: 'include'
    });
    return handleResponse(res);
}

// PUT (update) an existing role (admin only)
// roleId is the numeric ID and roleData is an object like: { role_name: "UpdatedName" }
export async function updateRole(roleId, roleData) {
    const res = await fetch(`${API_BASE}/api/roles/${roleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roleData),
        credentials: 'include'
    });
    return handleResponse(res);
}

// DELETE a role (admin only)
export async function deleteRole(roleId) {
    const res = await fetch(`${API_BASE}/api/roles/${roleId}`, {
        method: 'DELETE',
        credentials: 'include'
    });
    return handleResponse(res);
}

/* =========================
   ROLE PERMISSIONS
   ========================= */
// Update the permissions assigned to a role (admin only).
// permissionIds should be an array of permission ID numbers.
export async function updateRolePermissions(roleId, permissionIds) {
    const res = await fetch(`${API_BASE}/api/roles/${roleId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionIds }), // key must be "permissionIds"
        credentials: 'include'
    });
    return handleResponse(res);
}



export async function fetchAllPermissions() {
    const res = await fetch(`${API_BASE}/api/permissions`, { credentials: 'include' });
    return handleResponse(res);
}

// Logged-in user's permission names (for enabling/disabling UI controls)
export async function fetchMyPermissions() {
    const res = await fetch(`${API_BASE}/api/my-permissions`, { credentials: 'include' });
    return handleResponse(res);
}

export async function fetchRolePermissions(roleId) {
    const res = await fetch(`${API_BASE}/api/roles/${roleId}/permissions`, { credentials: 'include' });
    return handleResponse(res);
}


// =========================
// SKILLS (Skills Management)
// =========================

export async function fetchSkills() {
    const res = await fetch(`${API_BASE}/api/skills`, { credentials: 'include' });
    return handleResponse(res);
}

export async function createSkill(skillData) {
    const res = await fetch(`${API_BASE}/api/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skillData),
        credentials: 'include'
    });
    return handleResponse(res);
}

export async function updateSkill(skillId, skillData) {
    const res = await fetch(`${API_BASE}/api/skills/${skillId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skillData),
        credentials: 'include'
    });
    return handleResponse(res);
}

export async function deleteSkill(skillId) {
    const res = await fetch(`${API_BASE}/api/skills/${skillId}`, {
        method: 'DELETE',
        credentials: 'include'
    });
    return handleResponse(res);
}

// MANAGER CATEGORIES
export async function fetchManagerCategories() {
    const res = await fetch(`${API_BASE}/api/manager-categories`, { credentials: 'include' });
    return handleResponse(res);
}
export async function createManagerCategory({ title }) {
    const res = await fetch(`${API_BASE}/api/manager-categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
        credentials: 'include'
    });
    return handleResponse(res);
}
export async function updateManagerCategory(id, { title }) {
    const res = await fetch(`${API_BASE}/api/manager-categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
        credentials: 'include'
    });
    return handleResponse(res);
}
export async function deleteManagerCategory(id) {
    const res = await fetch(`${API_BASE}/api/manager-categories/${id}`, {
        method: 'DELETE',
        credentials: 'include'
    });
    return handleResponse(res);
}

// MANAGERS CRUD
export async function fetchManagers() {
    const res = await fetch(`${API_BASE}/api/managers`, { credentials: 'include' });
    return handleResponse(res);
}
export async function createManager({ full_name, category_id }) {
    const res = await fetch(`${API_BASE}/api/managers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name, category_id }),
        credentials: 'include'
    });
    return handleResponse(res);
}
export async function updateManager(id, { full_name, category_id }) {
    const res = await fetch(`${API_BASE}/api/managers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name, category_id }),
        credentials: 'include'
    });
    return handleResponse(res);
}
export async function deleteManager(id) {
    const res = await fetch(`${API_BASE}/api/managers/${id}`, {
        method: 'DELETE',
        credentials: 'include'
    });
    return handleResponse(res);
}

// EMPLOYEE-MANAGER ASSIGNMENT
export async function assignEmployeeManager({ employee_id, manager_id }) {
    const res = await fetch(`${API_BASE}/api/employee-manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id, manager_id }),
        credentials: 'include'
    });
    return handleResponse(res);
}
export async function unassignEmployeeManager(employee_id) {
    const res = await fetch(`${API_BASE}/api/employee-manager/${employee_id}`, {
        method: 'DELETE',
        credentials: 'include'
    });
    return handleResponse(res);
}

// USERS+MANAGERS: Get all employees with their manager + own manager info
export async function fetchEmployeesWithManager() {
    const res = await fetch(`${API_BASE}/api/employees-with-manager`, { credentials: 'include' });
    return handleResponse(res);
}