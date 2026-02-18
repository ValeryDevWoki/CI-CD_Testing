require('dotenv').config();
const helmet = require('helmet');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB, pool } = require('./db');
const { sendSms } = require('./smsService');
const { sendEmail } = require('./emailService');
const { OAuth2Client } = require('google-auth-library');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cookieParser = require('cookie-parser');
const buildPath = path.join(process.cwd(), 'build');
console.log('Serving static files from:', buildPath);


const app = express();
const DEFAULT_PUBLISH_TEMPLATE_ID = 2;

// ----------------------------------------------------------------------------
// Serve Frontend Static Files
// ----------------------------------------------------------------------------
// Serve static files from the 'build' directory (created after building your frontend)
//app.use(express.static(buildPath));

app.use(
    helmet.contentSecurityPolicy({
        useDefaults: false,
        directives: {
            defaultSrc: ["'self'", "https://accounts.google.com"],
            scriptSrc: ["'self'", "https://accounts.google.com", "https://*.googleusercontent.com"],
            styleSrc:  ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://*.googleusercontent.com"],
            frameSrc:  ["'self'", "https://accounts.google.com"],
            connectSrc:["'self'", "https://accounts.google.com", "https://*.googleusercontent.com"],
            imgSrc:    ["'self'", "data:", "https://*.gstatic.com", "https://*.googleusercontent.com"],
            fontSrc:   ["'self'"],
            objectSrc: ["'none'"],
        },
    })
);




// ----------------------------------------------------------------------------
// Middleware & Session Setup
// ----------------------------------------------------------------------------
app.use(cors({
    //origin: process.env.FRONTEND_URL || 'https://yardena.woki.co.il',
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.set('trust proxy', 1);

const sessionStore = new pgSession({
    pool,
    schemaName: 'schedule',
    tableName: 'session',
    createTableIfMissing: true,
    pruneSessionInterval: 15 * 60 * 1000, // auto-clean every 15 minutes
    ttl: 24 * 60 * 60,                    // 24h TTL (matches cookie.maxAge)
});

sessionStore.on('error', (err) => {
    console.error('[session-store] error:', err);
});

app.use(
    session({
        store: sessionStore,
        secret: process.env.SESSION_SECRET || 'PLEASE_CHANGE_ME',
        resave: false,
        saveUninitialized: false,
        name: 'yardena.sid',
        cookie: {
            httpOnly: true,
            secure: 'auto',     // true on HTTPS behind proxy/CDN
            sameSite: 'lax',    // if truly cross-site, use 'none' + HTTPS
            // domain: '.woki.co.il', // uncomment if API+FE are subdomains
            maxAge: 24 * 60 * 60 * 1000,
        },
    })
);


// Configurable delay in milliseconds (default: 5000ms)
const SMS_DELAY = process.env.SMS_DELAY ? parseInt(process.env.SMS_DELAY, 10) : 5000;
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// -------------------- Better notification logs --------------------
const NOTIFY_SEND_TIMEOUT_MS = process.env.NOTIFY_SEND_TIMEOUT_MS
    ? parseInt(process.env.NOTIFY_SEND_TIMEOUT_MS, 10)
    : 20000;

function nowIso() {
    return new Date().toISOString();
}

function mkRunId(prefix, extra = '') {
    return `${prefix}_${extra}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function logEvent(event, data = {}) {
    console.log(JSON.stringify({ ts: nowIso(), event, ...data }));
}

function shortErr(err) {
    const e = err || {};
    const status =
        e?.response?.status ??
        e?.status ??
        e?.statusCode ??
        e?.code;

    const headers = e?.response?.headers || {};
    const requestId =
        headers['x-request-id'] ||
        headers['x-amzn-requestid'] ||
        headers['x-correlation-id'] ||
        e?.requestId ||
        e?.response?.data?.requestId;

    // response body snippet (avoid huge logs)
    let response;
    try {
        const data = e?.response?.data;
        if (data !== undefined) {
            response = typeof data === 'string' ? data.slice(0, 1500) : JSON.stringify(data).slice(0, 1500);
        }
    } catch {}

    return {
        name: e?.name,
        message: e?.message || String(e),
        code: e?.code,
        status,
        requestId,
        response,
        stack: e?.stack ? String(e.stack).split('\n').slice(0, 6).join('\n') : undefined
    };
}

// ---- Optional per-user notification flags (auto-detected) ----
let USER_NOTIFY_COLS = {
    loaded: false,
    smsCol: null,
    emailCol: null,
    globalCol: null,
};

// ---- Optional schedule.shifts_static range columns (auto-detected) ----
let STATIC_SHIFT_COLS = {
    loaded: false,
    hasStartWeek: false,
    hasEndWeek: false,
};


// ---- Auto-migration helpers (best-effort) ----
// We do NOT want the app to crash if DB user lacks ALTER privileges.
// These run once at startup and quietly continue on permission errors.
async function ensureScheduleSchema() {
    // 1) Ensure end_week_code exists on schedule.shifts_static (so we can "stop repeating from this week forward")
    try {
        await pool.query(`ALTER TABLE schedule.shifts_static ADD COLUMN IF NOT EXISTS end_week_code text`);
    } catch (err) {
        logEvent('MIGRATION_WARN_END_WEEK_CODE', { error: shortErr(err) });
    }
}


// ----------------------------------------------------------------------------
// Ensure start_date audit table exists (safe to call on startup)
// ----------------------------------------------------------------------------
async function ensureStartDateAuditTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schedule.user_start_date_audit (
              id bigserial PRIMARY KEY,
              user_id bigint NOT NULL,
              old_start_date date,
              new_start_date date,
              changed_by bigint,
              changed_at timestamptz NOT NULL DEFAULT now()
            );
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_user_start_date_audit_user_id
              ON schedule.user_start_date_audit(user_id);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_user_start_date_audit_changed_at
              ON schedule.user_start_date_audit(changed_at DESC);
        `);
    } catch (e) {
        // Do not crash the server if audit table can't be created (permissions, etc.)
        console.warn('WARN: could not ensure schedule.user_start_date_audit table:', e.message || e);
    }
}

async function loadStaticShiftCols() {
    try {
        const q = await pool.query(
            `SELECT column_name
             FROM information_schema.columns
             WHERE table_schema='schedule' AND table_name='shifts_static'`
        );
        const cols = new Set(q.rows.map(r => r.column_name));
        STATIC_SHIFT_COLS.hasStartWeek = cols.has('start_week_code');
        STATIC_SHIFT_COLS.hasEndWeek = cols.has('end_week_code');
        STATIC_SHIFT_COLS.loaded = true;
    } catch (err) {
        STATIC_SHIFT_COLS.loaded = true;
        logEvent('STATIC_SHIFT_COLUMNS_ERROR', { error: shortErr(err) });
    }
}

async function loadUserNotifyCols() {
    try {
        const q = await pool.query(
            `SELECT column_name
             FROM information_schema.columns
             WHERE table_schema='schedule' AND table_name='users'`
        );
        const cols = new Set(q.rows.map(r => r.column_name));

        // choose first existing column from these candidates
        const pick = (candidates) => candidates.find(c => cols.has(c)) || null;

        USER_NOTIFY_COLS.smsCol = pick([
            'notify_sms', 'sms_enabled', 'is_sms_enabled', 'enable_sms', 'sms_notifications'
        ]);
        USER_NOTIFY_COLS.emailCol = pick([
            'notify_email', 'email_enabled', 'is_email_enabled', 'enable_email', 'email_notifications'
        ]);
        USER_NOTIFY_COLS.globalCol = pick([
            'notifications_enabled', 'notify_enabled', 'is_notifications_enabled', 'enable_notifications'
        ]);

        USER_NOTIFY_COLS.loaded = true;

        //  logEvent('NOTIFY_PREFS_COLUMNS', {
        //    smsCol: USER_NOTIFY_COLS.smsCol,
        //     emailCol: USER_NOTIFY_COLS.emailCol,
        //     globalCol: USER_NOTIFY_COLS.globalCol
        //  });
    } catch (err) {
        // Not fatal
        USER_NOTIFY_COLS.loaded = true;
        logEvent('NOTIFY_PREFS_COLUMNS_ERROR', { error: shortErr(err) });
    }
}

async function withTimeout(promise, ms) {
    let t;
    const timeout = new Promise((_, reject) => {
        t = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(t);
    }
}

// Catch “silent” crashes
process.on('unhandledRejection', (reason) => {
    logEvent('UNHANDLED_REJECTION', { error: shortErr(reason) });
});
process.on('uncaughtException', (err) => {
    logEvent('UNCAUGHT_EXCEPTION', { error: shortErr(err) });
});


// ----------------------------------------------------------------------------
// Permission Helper Function
// ----------------------------------------------------------------------------
async function requirePermission(req, res, permission) {
    if (!req.session.userId) {
        res.status(401).json({ error: 'לא מחובר/ת.' });
        return false;
    }
    const role = req.session.role;
    try {
        const result = await pool.query(
            `SELECT p.permission_name
             FROM schedule.role_permissions rp
                      JOIN schedule.permissions p ON rp.permission_id = p.id
                      JOIN schedule.roles r ON rp.role_id = r.id
             WHERE r.role_name = $1`,
            [role]
        );
        const perms = result.rows.map(row => row.permission_name);
        if (!perms.includes(permission)) {
            res.status(403).json({ error: 'לא מורשה. חסרה הרשאה: ' + permission });
            return false;
        }
        return true;
    } catch (e) {
        console.error("Permission check error", e);
        res.status(500).json({ error: 'שגיאת שרת פנימית' });
        return false;
    }
}

// ----------------------------------------------------------------------------
// Simple Helper Functions (unchanged)
// ----------------------------------------------------------------------------
function getLocalWeekCodeFromDate(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const year = d.getFullYear();
    const jan1 = new Date(year, 0, 1);
    jan1.setHours(0, 0, 0, 0);
    const firstSunday = new Date(jan1);
    firstSunday.setDate(jan1.getDate() - jan1.getDay());
    const diffDays = Math.floor((d - firstSunday) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(diffDays / 7) + 1;
    return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

function getHebrewDayNameFromDateStr(dateStr) {
    // dateStr: "YYYY-MM-DD"
    const d = new Date(dateStr + 'T00:00:00');
    const map = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    return map[d.getDay()] || 'ראשון';
}


function getNextWeekCodeLocal() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return getLocalWeekCodeFromDate(future);
}

function getSundayOfWeek(year, weekNum) {
    const jan1 = new Date(year, 0, 1);
    // Get the first Sunday on or before January 1.
    const firstSunday = new Date(jan1);
    firstSunday.setDate(jan1.getDate() - jan1.getDay());
    firstSunday.setHours(0, 0, 0, 0);
    // Add (weekNum - 1) weeks to the first Sunday.
    firstSunday.setDate(firstSunday.getDate() + (weekNum - 1) * 7);
    return firstSunday;
}

function getDateFromWeekCode(weekCode, dayName) {
    const [yearStr, wPart] = weekCode.split('-W');
    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const week = parseInt(wPart, 10) || 1;

    const dayMapping = {
        'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6,
        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };

    const trimmedDay = (dayName || '').trim();
    const dayIndex = (trimmedDay in dayMapping) ? dayMapping[trimmedDay] : 0;

    // Find January 1st of the current year
    const jan1 = new Date(year, 0, 1);
    jan1.setHours(0, 0, 0, 0);

    // Find the first Sunday of the year (start of the first week)
    const firstSunday = new Date(jan1);
    firstSunday.setDate(jan1.getDate() - jan1.getDay());

    // Calculate target date: start of first week + (week number - 1) * 7 days + day index
    const targetDate = new Date(firstSunday);
    targetDate.setDate(firstSunday.getDate() + (week - 1) * 7 + dayIndex);

    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function computeShiftHours(startTime, endTime) {
    const startMin = parseTimeToMinutes(startTime);
    let   endMin   = parseTimeToMinutes(endTime);

    // if shift rolls past midnight
    if (endMin <= startMin) endMin += 24 * 60;

    // return hours as a float (e.g. 8.9833 for 8h59m)
    return (endMin - startMin) / 60;
}

function expandRange(startH, endH) {
    const arr = [];
    let h = startH;
    do {
        arr.push(h);
        h = (h + 1) % 24;
    } while (h !== endH);
    return arr;
}

async function findBlockConflicts(day_name, dateStr, start_time, end_time) {
    let blockers = [];
    if (day_name) {
        const wQ = await pool.query(
            `SELECT * FROM schedule.blockers WHERE type='weekly' AND day_name=$1`,
            [day_name]
        );
        blockers.push(...wQ.rows);
    }
    if (dateStr) {
        const dQ = await pool.query(
            `SELECT * FROM schedule.blockers WHERE type='date' AND $1::date >= date::date AND $1::date <= COALESCE(end_date::date, date::date)`,
            [dateStr]
        );
        blockers.push(...dQ.rows);
    }
    if (!blockers.length) return [];
    const shiftRange = expandRange(parseInt(start_time.split(':')[0], 10), parseInt(end_time.split(':')[0], 10));
    let conflicts = [];
    for (const b of blockers) {
        const bRange = expandRange(parseInt(b.start_time.split(':')[0], 10), parseInt(b.end_time.split(':')[0], 10));
        if (bRange.some(hour => shiftRange.includes(hour))) {
            conflicts.push({ start_time: b.start_time, end_time: b.end_time, reason: b.reason || '' });
        }
    }
    return conflicts;
}

function getISOWeek(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

function isWeekInPast(weekCode) {
    const [yearStr, weekPart] = weekCode.split('-W');
    const shiftYear = parseInt(yearStr, 10);
    const shiftWeek = parseInt(weekPart, 10);
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentWeek = getISOWeek(now);
    if (shiftYear < currentYear) return true;
    if (shiftYear > currentYear) return false;
    return shiftWeek < currentWeek;
}

async function checkIfLocked() {
    try {
        const result = await pool.query(
            `SELECT week_code FROM schedule.week_lock_status WHERE locked = false AND lock_date IS NOT NULL AND lock_date <= NOW()`
        );
        if (!result.rows.length) return;
        await pool.query(
            `UPDATE schedule.week_lock_status SET locked = true, last_activity = NOW() WHERE locked = false AND lock_date IS NOT NULL AND lock_date <= NOW()`
        );
        console.log(`Auto-locked ${result.rows.length} week(s):`, result.rows.map(r => r.week_code));
    } catch (err) {
        console.error('checkIfLocked error:', err);
    }
}

function scheduleLockCheck() {
    setInterval(checkIfLocked, 60_000);
}

async function sendNotificationsDirect(shiftIds, templateId, channel = 'both') {
    // ---------- tiny structured logger ----------
    function logEvent(event, data = {}) {
        const entry = {
            ts: new Date().toISOString(),
            event,
            ...data,
        };
        console.log(JSON.stringify(entry));
    }

    function maskPhone(p) {
        if (!p) return null;
        const s = String(p);
        if (s.length <= 4) return "***";
        return `${s.slice(0, 2)}***${s.slice(-2)}`;
    }

    function maskEmail(e) {
        if (!e) return null;
        const s = String(e);
        const at = s.indexOf("@");
        if (at <= 1) return "***@***";
        return `${s[0]}***${s.slice(at)}`;
    }

    function shortErr(err) {
        const status =
            err?.response?.status ??
            err?.status ??
            err?.statusCode ??
            err?.code ??
            err?.responseCode ??
            null;

        const headers = err?.response?.headers || {};
        const requestId =
            headers["x-request-id"] ||
            headers["x-amzn-requestid"] ||
            headers["x-correlation-id"] ||
            headers["x-trace-id"] ||
            headers["trace-id"] ||
            headers["request-id"] ||
            null;

        const respData = err?.response?.data;
        let respPreview = null;
        try {
            if (respData != null) {
                const s = typeof respData === "string" ? respData : JSON.stringify(respData);
                respPreview = s.slice(0, 1500);
            }
        } catch {
            respPreview = String(respData).slice(0, 1500);
        }

        return {
            message: err?.message || String(err),
            code: err?.code || null,
            status,
            requestId,
            response: respPreview,
        };
    }

    const runId = `notify_${templateId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // Normalize input
    if (!Array.isArray(shiftIds)) shiftIds = [];
    shiftIds = shiftIds.map(n => Number(n)).filter(n => Number.isInteger(n));

    if (!['sms', 'email', 'both'].includes(channel)) channel = 'both';

    logEvent("NOTIFY_START", { runId, templateId, channel, shiftIdsLen: shiftIds.length });

    // 1) Load template
    const tplQ = await pool.query(`
        SELECT id, template_name, subject, body, opening_text, ending_text
        FROM schedule.templates
        WHERE id = $1
    `, [templateId]);

    if (!tplQ.rows.length) {
        logEvent("NOTIFY_FATAL_NO_TEMPLATE", { runId, templateId });
        return;
    }
    const template = tplQ.rows[0];

    // 2) Load shifts only if shiftIds provided
    let shiftRows = [];
    if (shiftIds.length) {
        const shiftsQ = await pool.query(`
            SELECT s.id AS shift_id,
                   s.week_code,
                   s.day_name,
                   s.start_time,
                   s.end_time,
                   u.id AS employee_id,
                   u.full_name AS employee_name
            FROM schedule.shifts s
                     JOIN schedule.users u ON u.id = s.employee_id
            WHERE s.id = ANY($1)
        `, [shiftIds]);
        shiftRows = shiftsQ.rows || [];
        logEvent("NOTIFY_SHIFTS_LOADED", { runId, rows: shiftRows.length });
    } else {
        // IMPORTANT: do NOT return — we still notify all active employees
        logEvent("NOTIFY_NO_SHIFTIDS", { runId, willNotifyAllActiveEmployees: true });
    }

    // 3) Group shifts by employee
    const mapByEmp = {}; // { [empId]: { employeeName, shiftList: [{dateStr, day_name, start_time, end_time}] } }

    for (const row of shiftRows) {
        const dateStr = getDateFromWeekCode(row.week_code, row.day_name);
        const trimmedDayName = (row.day_name || "").trim();
        const empId = String(row.employee_id);

        if (!mapByEmp[empId]) {
            mapByEmp[empId] = { employeeName: row.employee_name, shiftList: [] };
        }

        mapByEmp[empId].shiftList.push({
            dateStr,
            day_name: trimmedDayName,
            start_time: row.start_time,
            end_time: row.end_time
        });
    }

    // 4) IMPORTANT CHANGE: include ALL active employees, even if they have 0 shifts
    const activeQ = await pool.query(`
        SELECT id, full_name
        FROM schedule.users
        WHERE role='Employee' AND status='Active'
    `);

    for (const u of (activeQ.rows || [])) {
        const empId = String(u.id);
        if (!mapByEmp[empId]) {
            mapByEmp[empId] = { employeeName: u.full_name, shiftList: [] };
        } else if (!mapByEmp[empId].employeeName) {
            mapByEmp[empId].employeeName = u.full_name;
        }
    }

    const empIds = Object.keys(mapByEmp);

    const employeesWithoutShifts = empIds.reduce((acc, id) => {
        const cnt = mapByEmp[id]?.shiftList?.length || 0;
        return acc + (cnt === 0 ? 1 : 0);
    }, 0);

    logEvent("NOTIFY_EMP_GROUPED", {
        runId,
        employeesTotal: empIds.length,
        activeEmployees: (activeQ.rows || []).length,
        employeesWithoutShifts
    });

    // 5) Load contacts + state for all employees in one query

    const numericEmpIds = empIds.map(Number).filter(n => Number.isInteger(n));

    const usersQ = await pool.query(`
        SELECT id, full_name, role, status, phone, email
        FROM schedule.users
        WHERE id = ANY($1)
    `, [empIds.map(Number).filter(Number.isInteger)]);

    const usersById = new Map();
    for (const u of (usersQ.rows || [])) usersById.set(String(u.id), u);

    let sentSms = 0, failSms = 0;
    let sentEmail = 0, failEmail = 0;
    let skippedInvalidState = 0;
    let skippedNoPhone = 0;
    let skippedNoEmail = 0;

    for (const empId of empIds) {
        const group = mapByEmp[empId] || { employeeName: null, shiftList: [] };
        const user = usersById.get(empId);
        const employeeName = group.employeeName || user?.full_name || `Employee#${empId}`;
        const shiftList = group.shiftList || [];

        logEvent("NOTIFY_EMP_START", {
            runId,
            empId: Number(empId),
            employeeName,
            shiftsCount: shiftList.length
        });

        // invalid state (covers users that came from shift rows but are not Active/Employee now)
        if (!user || user.role !== 'Employee' || user.status !== 'Active') {
            skippedInvalidState++;
            logEvent("NOTIFY_EMP_SKIP_INVALID_STATE", {
                runId,
                empId: Number(empId),
                employeeName,
                role: user?.role ?? null,
                status: user?.status ?? null,
                reason: !user ? "user_not_found" : "not_active_employee"
            });
            continue;
        }

        // Build lines (same style you already used)
        let lines = shiftList.map(s => {
            const safeDayName = s.day_name || "???";
            return `${s.dateStr} ${s.start_time}-${s.end_time} (${safeDayName})`;
        });

        if (lines.length === 0) {
            // IMPORTANT: employee has 0 shifts but still should be notified
            lines = ["אין משמרות השבוע"]; // поменяй текст как нужно
            logEvent("NOTIFY_EMP_NO_SHIFTS", { runId, empId: Number(empId), employeeName });
        }

        // Render message using your existing placeholders
        let finalText = (template.body || "")
            .replace("{{employeeName}}", employeeName)
            .replace("{{shifts}}", lines.join("\n"));

        if (template.opening_text) finalText = `${template.opening_text}\n\n${finalText}`;
        if (template.ending_text) finalText += `\n\n${template.ending_text}`;

        logEvent("NOTIFY_EMP_RENDERED", { runId, empId: Number(empId), employeeName, channel });

        // Send SMS
        if (channel === "both" || channel === "sms") {
            if (!user.phone) {
                skippedNoPhone++;
                logEvent("NOTIFY_SMS_SKIP_NO_PHONE", {
                    runId, empId: Number(empId), employeeName
                });
            } else {
                try {
                    logEvent("NOTIFY_SMS_SEND", {
                        runId, empId: Number(empId), employeeName, to: maskPhone(user.phone)
                    });
                    await sendSms(user.phone, finalText);
                    sentSms++;
                    logEvent("NOTIFY_SMS_OK", {
                        runId, empId: Number(empId), employeeName, to: maskPhone(user.phone)
                    });
                } catch (err) {
                    failSms++;
                    logEvent("NOTIFY_SMS_FAIL", {
                        runId, empId: Number(empId), employeeName, to: maskPhone(user.phone),
                        err: shortErr(err)
                    });
                }
                await delay(SMS_DELAY);
            }
        }

        // Send Email
        if (channel === "both" || channel === "email") {
            if (!user.email) {
                skippedNoEmail++;
                logEvent("NOTIFY_EMAIL_SKIP_NO_EMAIL", {
                    runId, empId: Number(empId), employeeName
                });
            } else {
                try {
                    const emailSubject = template.subject || "Notification";
                    logEvent("NOTIFY_EMAIL_SEND", {
                        runId, empId: Number(empId), employeeName, to: maskEmail(user.email)
                    });
                    await sendEmail(user.email, emailSubject, `<pre>${finalText}</pre>`);
                    sentEmail++;
                    logEvent("NOTIFY_EMAIL_OK", {
                        runId, empId: Number(empId), employeeName, to: maskEmail(user.email)
                    });
                } catch (err) {
                    failEmail++;
                    logEvent("NOTIFY_EMAIL_FAIL", {
                        runId, empId: Number(empId), employeeName, to: maskEmail(user.email),
                        err: shortErr(err)
                    });
                }
            }
        }

        logEvent("NOTIFY_EMP_DONE", { runId, empId: Number(empId), employeeName });
    }

    // Basic fail-rate monitoring
    const smsAttempts = sentSms + failSms;
    const emailAttempts = sentEmail + failEmail;

    if (smsAttempts > 0) {
        const smsFailRate = failSms / smsAttempts;
        if (smsFailRate >= 0.10) {
            logEvent("NOTIFY_WARN_SMS_FAIL_RATE", { runId, sentSms, failSms, smsFailRate });
        }
    }
    if (emailAttempts > 0) {
        const emailFailRate = failEmail / emailAttempts;
        if (emailFailRate >= 0.10) {
            logEvent("NOTIFY_WARN_EMAIL_FAIL_RATE", { runId, sentEmail, failEmail, emailFailRate });
        }
    }

    logEvent("NOTIFY_DONE", {
        runId,
        templateId,
        channel,
        employeesTotal: empIds.length,
        employeesWithoutShifts,
        skippedInvalidState,
        skippedNoPhone,
        skippedNoEmail,
        sentSms,
        failSms,
        sentEmail,
        failEmail
    });
}




async function scheduleReminderCheck() {
    setInterval(async () => {
        try {
            const rQ = await pool.query(
                `SELECT r.id, r.week_code, r.template_id, t.template_type
                 FROM schedule.reminders r
                          JOIN schedule.templates t ON t.id=r.template_id
                 WHERE r.is_active=true AND r.is_sent=false AND r.send_at <= NOW()`
            );
            if (!rQ.rows.length) return;
            for (const r of rQ.rows) {
                const sQ = await pool.query(`SELECT id FROM schedule.shifts WHERE week_code=$1`, [r.week_code]);
                const shiftIds = sQ.rows.map(x => x.id);
                await sendNotificationsDirect(shiftIds, r.template_id, r.template_type);
                await pool.query(`UPDATE schedule.reminders SET is_sent=true WHERE id=$1`, [r.id]);
            }
        } catch (err) {
            logEvent('REMINDER_LOOP_ERROR', { error: shortErr(err) });
        }
    }, 60000);
}

function computeNextISOWeekCode() {
    const now = new Date();
    const thisYear = now.getUTCFullYear();
    const thisWeek = getISOWeek(now);
    let nextYear = thisYear;
    let nextWeek = thisWeek + 1;
    if (nextWeek > 53) {
        nextYear++;
        nextWeek = 1;
    }
    return `${nextYear}-W${String(nextWeek).padStart(2, '0')}`;
}

// ─── New Helpers ────────────────────────────────────────────────────────────
function parseTimeToMinutes(timeStr) {
    const [h,m] = timeStr.split(':').map(Number);
    return h*60 + (m||0);
}

function getNightOverlap(startTime, endTime) {
    let s = parseTimeToMinutes(startTime),
        e = parseTimeToMinutes(endTime);
    if (e <= s) e += 24*60;
    let ov = 0;
    for (let m = s; m < e; m++) {
        const mm = m % (24*60);
        if (mm >= 22*60 || mm < 6*60) ov++;
    }
    return ov / 60; // hours
}

// ─── Updated Helper (put this once at the top) ────────────────────────────
function isWeekendShift(dayName, startTime, endTime) {
    // normalize for comparison
    const d = (dayName || '').trim().toLowerCase();
    const fridayNames   = ['friday', 'שישי'];
    const saturdayNames = ['saturday','שבת'];

    const s = parseTimeToMinutes(startTime);
    const e = parseTimeToMinutes(endTime);

    // Friday ≥15:00
    if (fridayNames.includes(d) && s >= 15*60) return true;
    // Saturday ending ≤21:00
    if (saturdayNames.includes(d) && e <= 21*60) return true;

    return false;
}

// Build a Date in local TZ from YYYY-MM-DD + HH:MM
function parseDateTime(dateStr, timeStr) {
    const [Y,M,D] = dateStr.split('-').map(Number);
    const [h,m]   = timeStr.split(':').map(Number);
    return new Date(Y, M-1, D, h, m, 0);
}


// ----------------------------------------------------------------------------
// Initialize DB and Start
// ----------------------------------------------------------------------------
initDB()
    .then(async () => {
        console.log('DB init done.');
        await ensureScheduleSchema();
        await ensureStartDateAuditTable();

        await loadUserNotifyCols();  // ✅ add this
        await loadStaticShiftCols();
        scheduleReminderCheck();
        scheduleLockCheck();
    })
    .catch(err => console.error('DB init error:', err));

// ----------------------------------------------------------------------------
// Routes – ALL FUNCTIONS PRESERVED, WITH PERMISSION CHECKS ADDED
// ----------------------------------------------------------------------------

// --- Employee Routes (manager-level functions on employees) ---
app.get('/api/employees', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_users'))) return;
    try {
        const q = await pool.query(
            `SELECT id, full_name, role, max_hours, max_days
             FROM schedule.users
             WHERE role='Employee' AND status='Active'
             ORDER BY id`
        );
        res.json(q.rows);
    } catch {
        res.status(500).json({ error: 'שגיאה באחזור עובדים' });
    }
});

app.post('/api/employees', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_users'))) return;
    try {
        const { full_name, role, max_hours, max_days } = req.body;
        const ins = await pool.query(
            `INSERT INTO schedule.users (full_name, role, max_hours, max_days)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [full_name, role, max_hours, max_days]
        );
        res.status(201).json(ins.rows[0]);
    } catch {
        res.status(500).json({ error: 'שגיאה ביצירת עובד' });
    }
});

// --- User Routes (for manager-level user management) ---
// --- Start date helpers (avoid timezone shifts) ---
function normalizeIsoDateOrNull(value) {
    if (value === undefined) return undefined; // caller can decide "not provided"
    if (value === null) return null;
    if (typeof value !== 'string') return null;
    const s = value.trim();
    if (!s) return null;
    // Expect YYYY-MM-DD only (HTML date input format)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '__INVALID__';
    const [y, m, d] = s.split('-').map(n => parseInt(n, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    // Validate calendar correctness (e.g. 2024-02-30)
    if (dt.getUTCFullYear() !== y || (dt.getUTCMonth() + 1) !== m || dt.getUTCDate() !== d) return '__INVALID__';
    return s; // keep as string, do NOT new Date() it
}

function isoToday() {
    // compare as YYYY-MM-DD (lexicographic works)
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}


app.get('/api/users', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_users'))) return;
    try {
        const q = await pool.query(
            `SELECT id, full_name, email, phone, role, status, skills, max_hours, max_days,
                    to_char(start_date, 'YYYY-MM-DD') AS start_date
             FROM schedule.users
             ORDER BY id`
        );
        res.json(q.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה באחזור משתמשים' });
    }
});


app.post('/api/users', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_users'))) return;
    try {
        const { full_name, email, phone, role, status, skills, max_hours, max_days, start_date } = req.body;

        const mh = max_hours ?? 8;
        const md = max_days ?? 5;

        const normalizedEmail = (email || '').trim().toLowerCase();
        const cleanPhone = normalizePhoneDigitsOnly(phone);

        if (cleanPhone && cleanPhone.length !== 10) {
            return res.status(400).json({ error: 'מספר טלפון חייב להכיל בדיוק 10 ספרות' });
        }

        const sd = normalizeIsoDateOrNull(start_date);
        if (sd === '__INVALID__') {
            return res.status(400).json({ error: 'תאריך תחילת עבודה לא תקין (YYYY-MM-DD)' });
        }
        if (sd && sd > isoToday()) {
            return res.status(400).json({ error: 'תאריך תחילת עבודה לא יכול להיות בעתיד' });
        }

        const ins = await pool.query(
            `INSERT INTO schedule.users (full_name, email, phone, role, status, skills, max_hours, max_days, start_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::date, CURRENT_DATE))
                 RETURNING id, full_name, email, phone, role, status, skills, max_hours, max_days,
                       to_char(start_date, 'YYYY-MM-DD') AS start_date`,
            [full_name, normalizedEmail, cleanPhone, role, status, skills, mh, md, sd]
        );

        res.status(201).json(ins.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה ביצירת משתמש' });
    }
});

app.put('/api/users/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_users'))) return;

    const userId = parseInt(req.params.id, 10);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'User id לא תקין' });

    try {
        // start_date is optional; if provided, validate and (optionally) require extra permission
        const hasStartDate = Object.prototype.hasOwnProperty.call(req.body, 'start_date');
        const sdRaw = hasStartDate ? req.body.start_date : undefined;
        const sd = normalizeIsoDateOrNull(sdRaw);

        if (sd === '__INVALID__') {
            return res.status(400).json({ error: 'תאריך תחילת עבודה לא תקין (YYYY-MM-DD)' });
        }
        if (sd && sd > isoToday()) {
            return res.status(400).json({ error: 'תאריך תחילת עבודה לא יכול להיות בעתיד' });
        }


        // Fetch old start_date for audit (only if start_date is being updated)
        let oldStartDate = null;
        if (hasStartDate) {
            const qOld = await pool.query(
                `SELECT to_char(start_date, 'YYYY-MM-DD') AS start_date FROM schedule.users WHERE id = $1`,
                [userId]
            );
            if (!qOld.rows.length) return res.status(404).json({ error: 'המשתמש לא נמצא' });
            oldStartDate = qOld.rows[0].start_date || null;
        }

        const { full_name, email, phone, role, status, skills, max_hours, max_days } = req.body;

        const normalizedEmail = (email || '').trim().toLowerCase();
        const cleanPhone = normalizePhoneDigitsOnly(phone);

        if (cleanPhone && cleanPhone.length !== 10) {
            return res.status(400).json({ error: 'מספר טלפון חייב להכיל בדיוק 10 ספרות' });
        }

        // If start_date is being changed, require the dedicated permission (optional enhancement)
        if (hasStartDate) {
            // If you did not create this permission yet, you can comment this check out.
            const ok = await requirePermission(req, res, 'manage_tenure_start_date');
            if (!ok) return; // requirePermission already responded
        }

        // Build dynamic update so we don't accidentally null-out start_date when it wasn't provided
        const fields = [
            ['full_name', full_name],
            ['email', normalizedEmail],
            ['phone', cleanPhone],
            ['role', role],
            ['status', status],
            ['skills', skills],
            ['max_hours', max_hours],
            ['max_days', max_days],
        ];

        const setParts = [];
        const values = [];
        let idx = 1;

        for (const [col, val] of fields) {
            setParts.push(`${col} = $${idx}`);
            values.push(val);
            idx += 1;
        }

        if (hasStartDate) {
            setParts.push(`start_date = $${idx}::date`);
            values.push(sd); // can be null to clear
            idx += 1;
        }

        values.push(userId);

        const sql = `
            UPDATE schedule.users
            SET ${setParts.join(', ')}
            WHERE id = $${idx}
                RETURNING id, full_name, email, phone, role, status, skills, max_hours, max_days,
                      to_char(start_date, 'YYYY-MM-DD') AS start_date
        `;

        const upd = await pool.query(sql, values);

        // Write audit row if start_date changed
        if (hasStartDate) {
            const newStartDate = sd || null;
            if ((oldStartDate || null) !== (newStartDate || null)) {
                try {
                    const actorId = req.session?.userId || null;
                    await pool.query(
                        `INSERT INTO schedule.user_start_date_audit (user_id, old_start_date, new_start_date, changed_by)
                         VALUES ($1, $2::date, $3::date, $4)`,
                        [userId, oldStartDate, newStartDate, actorId]
                    );
                } catch (e) {
                    console.warn('WARN: failed writing user_start_date_audit:', e.message || e);
                }
            }
        }


        if (!upd.rows.length) return res.status(404).json({ error: 'המשתמש לא נמצא' });
        res.json(upd.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה בעדכון המשתמש' });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_users'))) return;
    try {
        const userId = parseInt(req.params.id, 10);
        const del = await pool.query(`DELETE FROM schedule.users WHERE id=$1 RETURNING id`, [userId]);
        if (!del.rows.length) return res.status(404).json({ error: 'המשתמש לא נמצא' });
        res.json({ message: 'User deleted', id: userId });
    } catch {
        res.status(500).json({ error: 'שגיאה במחיקת משתמש' });
    }
});

// --- Roles Endpoints (accessible only by admin) ---
app.get('/api/roles', async (req, res) => {
    if (!(await requirePermission(req, res, 'admin_manage_roles'))) return;
    try {
        const q = await pool.query(`SELECT * FROM schedule.roles ORDER BY id`);
        res.json(q.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה באחזור תפקידים' });
    }
});

app.post('/api/roles', async (req, res) => {
    if (!(await requirePermission(req, res, 'admin_manage_roles'))) return;
    const { role_name } = req.body;
    if (!role_name) return res.status(400).json({ error: 'חסר שם תפקיד' });
    try {
        const ins = await pool.query(
            `INSERT INTO schedule.roles (role_name) VALUES ($1) RETURNING *`,
            [role_name]
        );
        res.status(201).json(ins.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה ביצירת תפקיד' });
    }
});

app.put('/api/roles/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'admin_manage_roles'))) return;
    const roleId = parseInt(req.params.id, 10);
    const { role_name } = req.body;
    if (!role_name) return res.status(400).json({ error: 'חסר שם תפקיד' });
    try {
        const upd = await pool.query(
            `UPDATE schedule.roles SET role_name=$1 WHERE id=$2 RETURNING *`,
            [role_name, roleId]
        );
        if (!upd.rows.length) return res.status(404).json({ error: 'התפקיד לא נמצא' });
        res.json(upd.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה בעדכון התפקיד' });
    }
});

app.delete('/api/roles/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'admin_manage_roles'))) return;
    const roleId = parseInt(req.params.id, 10);
    try {
        const del = await pool.query(`DELETE FROM schedule.roles WHERE id=$1 RETURNING id`, [roleId]);
        if (!del.rows.length) return res.status(404).json({ error: 'התפקיד לא נמצא' });
        res.json({ message: 'Role deleted', id: roleId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה במחיקת התפקיד' });
    }
});

// --- Role Permissions Endpoints (accessible only by admin) ---
// GET all available permissions
app.get('/api/permissions', async (req, res) => {
    if (!(await requirePermission(req, res, 'admin_manage_roles'))) return;
    try {
        const q = await pool.query(`SELECT * FROM schedule.permissions ORDER BY id`);
        res.json(q.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה באחזור הרשאות' });
    }
});

// GET permissions for a specific role (return an array of permission IDs)
app.get('/api/roles/:id/permissions', async (req, res) => {
    if (!(await requirePermission(req, res, 'admin_manage_roles'))) return;
    const roleId = parseInt(req.params.id, 10);
    try {
        const q = await pool.query(
            `SELECT p.id, p.permission_name
             FROM schedule.role_permissions rp
                      JOIN schedule.permissions p ON rp.permission_id = p.id
             WHERE rp.role_id = $1`,
            [roleId]
        );
        // Return only an array of permission IDs:
        res.json(q.rows.map(row => row.id));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה באחזור הרשאות של תפקיד' });
    }
});

// PUT to update permissions for a role
app.put('/api/roles/:id/permissions', async (req, res) => {
    if (!(await requirePermission(req, res, 'admin_manage_roles'))) return;
    const roleId = parseInt(req.params.id, 10);
    const { permissionIds } = req.body;
    if (!Array.isArray(permissionIds)) {
        return res.status(400).json({ error: 'permissionIds חייבים להיות מערך' });
    }
    try {
        // Remove existing permissions
        await pool.query(`DELETE FROM schedule.role_permissions WHERE role_id=$1`, [roleId]);
        // Insert new associations
        for (const pid of permissionIds) {
            await pool.query(
                `INSERT INTO schedule.role_permissions (role_id, permission_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [roleId, pid]
            );
        }
        res.json({ message: 'Permissions updated for role', roleId, permissionIds });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה בעדכון הרשאות התפקיד' });
    }
});


// --- Wanted Routes ---
app.get('/api/wanted/:weekCode', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_wanted'))) return;
    try {
        const q = await pool.query(
            `SELECT id, week_code, day_name, hour, wanted_count
             FROM schedule.wanted
             WHERE week_code=$1
             ORDER BY day_name, hour`,
            [req.params.weekCode]
        );
        res.json(q.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה באחזור המבוקש' });
    }
});

app.put('/api/wanted', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_edit_admin_dashboard'))) return;
    try {
        const { weekCode, dayName, hour, wantedCount } = req.body;
        const upd = await pool.query(
            `UPDATE schedule.wanted
             SET wanted_count = $1
             WHERE week_code = $2 AND day_name = $3 AND hour = $4
                 RETURNING *`,
            [wantedCount, weekCode, dayName, hour]
        );
        if (upd.rows.length) return res.json(upd.rows[0]);
        const ins = await pool.query(
            `INSERT INTO schedule.wanted (week_code, day_name, hour, wanted_count)
             VALUES ($1, $2, $3, $4)
                 RETURNING *`,
            [weekCode, dayName, hour, wantedCount]
        );
        res.json(ins.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה בעדכון המבוקש' });
    }
});

app.get('/api/wanted-total/:weekCode', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_wanted_total'))) return;
    try {
        const q = await pool.query(
            `SELECT id, week_code, day_name, wanted_count
             FROM schedule.wanted_total
             WHERE week_code=$1
             ORDER BY day_name`,
            [req.params.weekCode]
        );
        res.json(q.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה באחזור סך הסכום היומי המבוקש' });
    }
});

app.put('/api/wanted-total', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_wanted_total'))) return;
    try {
        const { weekCode, dayName, wantedCount } = req.body;
        const upd = await pool.query(
            `UPDATE schedule.wanted_total
             SET wanted_count=$1
             WHERE week_code=$2 AND day_name=$3
                 RETURNING *`,
            [wantedCount, weekCode, dayName]
        );
        if (upd.rows.length) {
            return res.json(upd.rows[0]);
        }
        const ins = await pool.query(
            `INSERT INTO schedule.wanted_total (week_code, day_name, wanted_count)
             VALUES ($1, $2, $3) RETURNING *`,
            [weekCode, dayName, wantedCount]
        );
        res.json(ins.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה בשחזור סך הביקושים היומי' });
    }
});

app.post('/api/wanted/copy', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_copy_wanted'))) return;
    try {
        const { fromWeek, toWeek } = req.body;
        if (!fromWeek || !toWeek) {
            return res.status(400).json({ error: 'חסר משבוע/לשבוע' });
        }
        const copySql = `
            INSERT INTO schedule.wanted (week_code, day_name, hour, wanted_count)
            SELECT $2, day_name, hour, wanted_count
            FROM schedule.wanted
            WHERE week_code=$1
            ON CONFLICT (week_code, day_name, hour)
                DO UPDATE SET wanted_count=EXCLUDED.wanted_count
                       RETURNING *;`;
        const result = await pool.query(copySql, [fromWeek, toWeek]);
        res.json({ message: 'Copied coverage', rows: result.rows.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה בהעתקת הסיקור' });
    }
});



// --- Week Lock Routes ---
app.get('/api/week-lock/:weekCode', async (req, res) => {
    // Accessible to all
    try {
        const { weekCode } = req.params;
        const lockQ = await pool.query(`SELECT locked, lock_date FROM schedule.week_lock_status WHERE week_code=$1 LIMIT 1`, [weekCode]);
        if (!lockQ.rows.length) {
            return res.json({ locked: true, lock_date: null });
        }
        const row = lockQ.rows[0];
        res.json({ locked: !!row.locked, lock_date: row.lock_date || null });
    } catch (err) {
        console.error('GET /api/week-lock/:weekCode error:', err);
        res.status(500).json({ error: 'נכשל באחזור סטטוס הנעילה' });
    }
});

app.put('/api/week-lock/:weekCode', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_open_week_registration'))) return;
    try {
        const { weekCode } = req.params;
        const { locked, lock_date } = req.body;
        await pool.query(
            `INSERT INTO schedule.week_lock_status (week_code, locked, lock_date, last_activity)
             VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (week_code)
       DO UPDATE SET locked=EXCLUDED.locked, lock_date=EXCLUDED.lock_date, last_activity=NOW()`,
            [weekCode, !!locked, lock_date || null]
        );
        res.json({ success: true, weekCode, locked, lock_date });
    } catch (err) {
        console.error('PUT /api/week-lock error:', err);
        res.status(500).json({ error: 'נכשל עדכון סטטוס הנעילה' });
    }
});

app.post('/api/week-lock/:weekCode/notify', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_open_week_registration'))) return;

    const { weekCode } = req.params;

    // Optional overrides
    const templateId = Number(req.body?.templateId) || 1;

    // channel can be: 'sms' | 'email' | 'both'
    let channel = (req.body?.channel || req.body?.template_type || req.body?.templateType || 'both');
    if (!['sms', 'email', 'both'].includes(channel)) channel = 'both';

    const bgRunId = mkRunId('weeklock_notify', weekCode);

    // Immediately return a response indicating the process has started
    res.status(202).json({
        success: true,
        message: 'Notification process started',
        bgRunId,
        weekCode,
        templateId,
        channel
    });

    // Process notifications in the background
    (async () => {
        try {
            logEvent('WEEKLOCK_NOTIFY_BG_START', {
                bgRunId,
                weekCode,
                templateId,
                channel,
                mode: 'SEND_ALL_WEEK_SHIFTS'
            });

            // Collect all shifts for this week
            const sQ = await pool.query(
                `SELECT id FROM schedule.shifts WHERE week_code=$1`,
                [weekCode]
            );

            const shiftIds = (sQ.rows || []).map(r => r.id).filter(n => Number.isInteger(n));
            if (!shiftIds.length) {
                logEvent('WEEKLOCK_NOTIFY_BG_NO_SHIFTS', { bgRunId, weekCode, willNotifyAllActiveEmployees: true });
                // DO NOT return — still notify all active employees
            }

            logEvent('WEEKLOCK_NOTIFY_BG_COLLECTED_SHIFTS', {
                bgRunId,
                weekCode,
                shiftIdsLen: shiftIds.length
            });

            // ✅ This is the important part: reuse the unified notification engine
            await sendNotificationsDirect(shiftIds, templateId, channel);

            logEvent('WEEKLOCK_NOTIFY_BG_DONE', {
                bgRunId,
                weekCode,
                shiftIdsLen: shiftIds.length
            });
        } catch (err) {
            logEvent('WEEKLOCK_NOTIFY_BG_ERROR', {
                bgRunId,
                weekCode,
                err: shortErr(err)
            });
        }
    })();
});



// --- Shift Routes ---
app.put('/api/shifts/mark-sent', async (req, res) => {
    if (!['Admin', 'Manager'].includes(req.session.role)) {
        if (!(await requirePermission(req, res, 'employee_send_shifts'))) return;
    }
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'לא מחובר/ת.' });
        const { shiftIds } = req.body;
        const numericIds = shiftIds.map(x => parseInt(x, 10)).filter(n => !isNaN(n));
        if (!numericIds.length) return res.status(400).json({ error: 'אין מזהים מספריים תקפים' });
        const q = await pool.query(`UPDATE schedule.shifts SET issent=true WHERE id=ANY($1) RETURNING *`, [numericIds]);
        if (!['Admin', 'Manager'].includes(req.session.role)) {
            const nextWeek = getNextWeekCodeLocal();
            await pool.query(
                `UPDATE schedule.employee_submission_status
                 SET registered_at = COALESCE(registered_at, NOW())
                 WHERE week_code = $1 AND employee_id = $2`,
                [nextWeek, req.session.userId]
            );
        }
        res.json({ message: 'Shifts marked as sent', rows: q.rows });
    } catch {
        res.status(500).json({ error: 'שגיאה בסימון משמרות שנשלחו' });
    }
});

app.put('/api/shifts/mark-published', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_publish_shifts'))) return;
    try {
        const { shiftIds } = req.body;
        if (!Array.isArray(shiftIds) || !shiftIds.length) {
            return res.status(400).json({ error: 'לא סופקו מזהי משמרות' });
        }
        const q = await pool.query(`UPDATE schedule.shifts SET ispublished=true WHERE id=ANY($1) RETURNING *`, [shiftIds]);
        res.json({ message: 'Shifts published', rows: q.rows });
    } catch {
        res.status(500).json({ error: 'שגיאה בסימון משמרות שפורסמו' });
    }
});

app.get('/api/shifts/:weekCode', async (req, res) => {
    try {
        const { weekCode } = req.params;
        const orderClause = `
          ORDER BY CASE day_name
              WHEN 'Sunday' THEN 1 WHEN 'ראשון' THEN 1
              WHEN 'Monday' THEN 2 WHEN 'שני' THEN 2
              WHEN 'Tuesday' THEN 3 WHEN 'שלישי' THEN 3
              WHEN 'Wednesday' THEN 4 WHEN 'רביעי' THEN 4
              WHEN 'Thursday' THEN 5 WHEN 'חמישי' THEN 5
              WHEN 'Friday' THEN 6 WHEN 'שישי' THEN 6
              WHEN 'Saturday' THEN 7 WHEN 'שבת' THEN 7
              ELSE 8
          END, start_time
        `;

        // 1) Fetch shifts
        // Attach static info (is_static + static_id) with start/end range if those columns exist.
        const weekNumExpr = `(split_part($1, '-W', 1)::int*100 + split_part($1, '-W', 2)::int)`;
        const ssWeekNum = (col) => `(split_part(${col}, '-W', 1)::int*100 + split_part(${col}, '-W', 2)::int)`;
        const rangeConds = [];
        if (STATIC_SHIFT_COLS.loaded && STATIC_SHIFT_COLS.hasStartWeek) {
            rangeConds.push(`(ss.start_week_code IS NULL OR ${ssWeekNum('ss.start_week_code')} <= ${weekNumExpr})`);
        }
        if (STATIC_SHIFT_COLS.loaded && STATIC_SHIFT_COLS.hasEndWeek) {
            rangeConds.push(`(ss.end_week_code IS NULL OR ${ssWeekNum('ss.end_week_code')} >= ${weekNumExpr})`);
        }
        const rangeSql = rangeConds.length ? ` AND ${rangeConds.join(' AND ')}` : '';

        const staticIdSql = `(SELECT ss.id FROM schedule.shifts_static ss
                               WHERE ss.employee_id = s.employee_id
                                 AND ss.day_name = s.day_name
                                 AND ss.start_time = s.start_time
                                 AND ss.end_time = s.end_time
                                 AND ss.isactive = true${rangeSql}
                               LIMIT 1)`;

        let shiftsQ;
        if (req.session.role === 'Employee') {
            if (!(await requirePermission(req, res, 'employee_view_dashboard'))) return;
            shiftsQ = await pool.query(
                `SELECT s.*,
                        ${staticIdSql} as static_id,
                        (${staticIdSql} IS NOT NULL) as is_static
                 FROM schedule.shifts s
                 WHERE s.week_code=$1 AND s.employee_id=$2 ${orderClause.replace(/day_name/g, 's.day_name').replace(/start_time/g, 's.start_time')}`,
                [weekCode, req.session.userId]
            );
        } else {
            if (!(await requirePermission(req, res, 'manager_view_employees_schedule'))) return;
            shiftsQ = await pool.query(
                `SELECT s.*,
                        ${staticIdSql} as static_id,
                        (${staticIdSql} IS NOT NULL) as is_static
                 FROM schedule.shifts s
                 WHERE s.week_code=$1 ${orderClause.replace(/day_name/g, 's.day_name').replace(/start_time/g, 's.start_time')}`,
                [weekCode]
            );
        }
        const shifts = shiftsQ.rows;

        // 2) Fetch notes for this week to merge them in JS (safer than complex SQL)
        // We'll fetch all notes for the employees involved in these shifts
        const employeeIds = [...new Set(shifts.map(s => s.employee_id))];
        let notes = [];
        if (employeeIds.length > 0) {
            // Fixed: added explicit ::date type casting for correct comparison in PostgreSQL
            const notesQ = await pool.query(
                `SELECT employee_id, date, note FROM schedule.notes
                 WHERE employee_id = ANY($1)
                   AND date::date >= (SELECT (date_trunc('week', (split_part($2, '-W', 1) || '-01-01')::date) + (split_part($2, '-W', 2)::int - 1) * interval '1 week')::date)
                   AND date::date <= (SELECT (date_trunc('week', (split_part($2, '-W', 1) || '-01-01')::date) + (split_part($2, '-W', 2)::int - 1) * interval '1 week' + interval '7 days')::date)`,
                [employeeIds, weekCode]
            );
            notes = notesQ.rows;
        }

        // 3) Merge notes into shifts
        const enrichedShifts = shifts.map(s => {
            const shiftDate = getDateFromWeekCode(s.week_code, s.day_name);
            const matchingNote = notes.find(n =>
                n.employee_id === s.employee_id &&
                new Date(n.date).toISOString().split('T')[0] === shiftDate
            );

            if (req.session.role === 'Employee') {
                // Employee sees THEIR note from schedule.notes as the primary note
                return { ...s, note: matchingNote ? matchingNote.note : '', is_static: s.is_static };
            } else {
                // Manager sees shifts.note AND employee_note
                return { ...s, employee_note: matchingNote ? matchingNote.note : '', is_static: s.is_static };
            }
        });

        if (req.session.role === 'Employee') {
            const lockQ = await pool.query(`SELECT locked FROM schedule.week_lock_status WHERE week_code=$1 LIMIT 1`, [weekCode]);
            let lockedVal = !lockQ.rows.length || (lockQ.rows[0].locked === true);
            return res.json({ locked: lockedVal, shifts: enrichedShifts });
        } else {
            return res.json({ locked: false, shifts: enrichedShifts });
        }
    } catch (err) {
        console.error('Error fetching shifts:', err);
        res.status(500).json({ error: 'שגיאה באחזור המשמרות' });
    }
});

app.post('/api/shifts', async (req, res) => {
    if (!req.session.userId)
        return res.status(401).json({ error: 'לא מחובר/ת.' });

    const isManager = ['Admin','Manager'].includes(req.session.role);
    if (isManager) {
        if (!(await requirePermission(req, res, 'manager_add_shift'))) return;
    } else {
        if (!(await requirePermission(req, res, 'employee_create_shift'))) return;
        if (parseInt(req.body.employee_id,10) !== req.session.userId) {
            return res.status(403).json({ error: "עובדים יכולים ליצור רק משמרות משלהם." });
        }
    }

    try {
        const { week_code, day_name, employee_id, start_time, end_time, note } = req.body;
        if (!isManager && await checkIfLocked(week_code)) {
            return res.status(400).json({ error: 'נעול לשבוע הזה.' });
        }

        const dateStr = getDateFromWeekCode(week_code, day_name);
        const shiftLen = computeShiftHours(start_time, end_time);

        // 1) Employee exists
        const empQ = await pool.query(`
            SELECT id FROM schedule.users WHERE id=$1
        `, [employee_id]);
        if (!empQ.rows.length) {
            return res.status(400).json({ error: 'העובד לא נמצא' });
        }

        // 2) Daily limits
        const compQ = await pool.query(`
            SELECT max_hours FROM schedule.company_daily_limits WHERE day_name=$1
        `, [day_name]);
        if (!compQ.rows.length) {
            return res.status(400).json({ error: `אין הגבלת חברה עבור ${day_name}` });
        }
        const companyMax = compQ.rows[0].max_hours;
        const ovQ = await pool.query(`
            SELECT max_hours FROM schedule.employee_daily_limits
            WHERE user_id=$1 AND day_name=$2
        `, [employee_id, day_name]);
        const dailyMax = ovQ.rows.length ? ovQ.rows[0].max_hours : companyMax;
        if (shiftLen > dailyMax) {
            return res.status(400).json({
                error: `עולה על המקסימום ${dailyMax} שעות ליום ${day_name}.`
            });
        }

        // 3) Blockers
        const conflicts = await findBlockConflicts(day_name, dateStr, start_time, end_time);
        if (conflicts.length) {
            return res.status(400).json({ error: 'זמן זה חסום', conflicts });
        }

        // 4) 12h rest *after* any prior night shift
        const allShifts = (await pool.query(`
            SELECT start_time,end_time,week_code,day_name
            FROM schedule.shifts
            WHERE employee_id=$1
        `, [employee_id])).rows;

        const priorNights = allShifts.filter(s =>
            getNightOverlap(s.start_time, s.end_time) >= 2
        );
        for (const s of priorNights) {
            let prevEnd = parseDateTime(
                getDateFromWeekCode(s.week_code, s.day_name),
                s.end_time
            );
            if (parseTimeToMinutes(s.end_time) <= parseTimeToMinutes(s.start_time)) {
                prevEnd.setDate(prevEnd.getDate() + 1);
            }
            const newStart = parseDateTime(dateStr, start_time);
            if (newStart - prevEnd < 12*60*60*1000) {
                return res.status(400).json({
                    error: 'לאחר משמרת לילה חובה הפרש של 12 שעות עד המשמרת הבאה'
                });
            }
        }

        // 5) If this NEW shift is itself a night shift, enforce 12h gap BEFORE any FUTURE shift
        const nightOv = getNightOverlap(start_time, end_time);
        const isNight = nightOv >= 2;
        if (isNight) {
            // compute this new-shift’s true end Date
            let thisEnd = parseDateTime(dateStr, end_time);
            if (parseTimeToMinutes(end_time) <= parseTimeToMinutes(start_time)) {
                thisEnd.setDate(thisEnd.getDate() + 1);
            }

            // fetch any existing shifts for user
            const futureShifts = allShifts;  // we already have them above
            for (const f of futureShifts) {
                // ignore ones that end before this new shift even starts
                const fStart = parseDateTime(
                    getDateFromWeekCode(f.week_code, f.day_name),
                    f.start_time
                );
                if (fStart > thisEnd && (fStart - thisEnd) < 12*60*60*1000) {
                    return res.status(400).json({
                        error: 'לאחר משמרת לילה חובה הפרש של 12 שעות עד המשמרת הבאה'
                    });
                }
            }
        }

        // 6) Weekend vs. Night caps
        const isWknd  = !isNight && isWeekendShift(day_name, start_time, end_time);

        if (isNight && shiftLen > 7) {
            return res.status(400).json({ error: 'עולה על המקסימום 7 שעות במשמרת לילה.' });
        }
        if (isWknd && shiftLen > 8.5) {
            return res.status(400).json({ error: 'עולה על המקסימום 8.5 שעות בסופ"ש.' });
        }

        // 7) Insert
        const ins = await pool.query(`
            INSERT INTO schedule.shifts
            (week_code,day_name,employee_id,start_time,end_time,note,issent,ispublished)
            VALUES($1,$2,$3,$4,$5,$6,$7,false)
                RETURNING *
        `, [week_code, day_name, employee_id, start_time, end_time, note||'', isManager]);

        // Return is_static if it was requested
        const resultRow = { ...ins.rows[0], is_static: !!req.body.is_static };

        if (!isManager) {
            await pool.query(`
                UPDATE schedule.employee_submission_status
                SET registered_at=COALESCE(registered_at,NOW())
                WHERE week_code=$1 AND employee_id=$2
            `, [week_code, employee_id]);
        }

        // 8) Sync note to schedule.notes if employee is creating
        if (!isManager && note && note.trim() !== '') {
            const noteDate = getDateFromWeekCode(week_code, day_name);
            const existingNoteQ = await pool.query(
                `SELECT id FROM schedule.notes WHERE employee_id=$1 AND date=$2`,
                [employee_id, noteDate]
            );

            if (existingNoteQ.rows.length) {
                // Update existing note (shouldn't happen often, but safe)
                await pool.query(
                    `UPDATE schedule.notes SET note=$1 WHERE id=$2`,
                    [note, existingNoteQ.rows[0].id]
                );

            }
        }

        res.status(201).json(resultRow);
    }
    catch (err) {
        console.error('POST /api/shifts error:', err);
        res.status(500).json({ error: 'שגיאה ביצירת המשמרת' });
    }
});

// ─── PUT /api/shifts/:id ────────────────────────────────────────────────────
app.put('/api/shifts/:id', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'לא מחובר/ת.' });
    }

    try {
        const shiftId = parseInt(req.params.id, 10);
        if (!Number.isInteger(shiftId)) {
            return res.status(400).json({ error: 'Invalid shift id' });
        }

        // 1) Load existing shift
        const oldRes = await pool.query(
            `SELECT * FROM schedule.shifts WHERE id = $1`,
            [shiftId]
        );
        if (!oldRes.rows.length) {
            return res.status(404).json({ error: 'המשמרת לא נמצאה' });
        }
        const old = oldRes.rows[0];

        // 2) Prevent editing past published shifts
        if (old.ispublished && isWeekInPast(old.week_code)) {
            return res.status(400).json({ error: 'לא ניתן לשנות משמרת שפורסמה בעבר.' });
        }

        const isManager = ['Admin','Manager'].includes(req.session.role);

        // 3) Lock check
        if (!isManager && await checkIfLocked(old.week_code)) {
            return res.status(400).json({ error: 'נעול לשבוע הזה.' });
        }

        // 4) Ownership & permission
        if (!isManager && old.employee_id !== req.session.userId) {
            return res.status(403).json({ error: 'עובדים יכולים לשנות רק את המשמרות שלהם עצמם.' });
        }
        if (isManager) {
            if (!(await requirePermission(req, res, 'manager_edit_shift'))) return;
        } else {
            if (!(await requirePermission(req, res, 'employee_edit_own_shift'))) return;
        }

        // 5) Determine new values
        const day_name   = req.body.day_name   ?? old.day_name;
        const start_time = req.body.start_time ?? old.start_time;
        const end_time   = req.body.end_time   ?? old.end_time;
        const note       = req.body.note       ?? old.note;
        const dateStr    = getDateFromWeekCode(old.week_code, day_name);
        const shiftLen   = computeShiftHours(start_time, end_time);

        // 6) Daily limits
        const compRes = await pool.query(
            `SELECT max_hours
             FROM schedule.company_daily_limits
             WHERE day_name = $1`,
            [day_name]
        );
        if (!compRes.rows.length) {
            return res.status(400).json({ error: `אין הגבלת חברה עבור ${day_name}` });
        }
        const companyMax = compRes.rows[0].max_hours;

        const empLimitRes = await pool.query(
            `SELECT max_hours
             FROM schedule.employee_daily_limits
             WHERE user_id = $1 AND day_name = $2`,
            [old.employee_id, day_name]
        );
        const dailyMax = empLimitRes.rows.length
            ? empLimitRes.rows[0].max_hours
            : companyMax;

        if (shiftLen > dailyMax) {
            return res.status(400).json({
                error: `עולה על המקסימום ${dailyMax} שעות ליום ${day_name}.`
            });
        }

        // 7) Blocker conflicts
        const conflicts = await findBlockConflicts(day_name, dateStr, start_time, end_time);
        if (conflicts.length) {
            return res.status(400).json({ error: 'זמן זה חסום', conflicts });
        }

        // 8) Fetch all other shifts for this employee
        const allRes = await pool.query(
            `SELECT id, start_time, end_time, week_code, day_name
             FROM schedule.shifts
             WHERE employee_id = $1 AND id <> $2`,
            [old.employee_id, shiftId]
        );
        const allShifts = allRes.rows;

        // ─── 9) 12h rest AFTER any PRIOR night shift ───────────────────────────────
        // Find all existing night shifts (>= 2h overlap with 22:00–06:00)
        const priorNights = allShifts.filter(s =>
            getNightOverlap(s.start_time, s.end_time) >= 2
        );

        // Compute the new shift’s start as a Date in local TZ
        const newStart = parseDateTime(dateStr, start_time);

        for (const s of priorNights) {
            // Build the end DateTime of that old night shift
            let prevEnd = parseDateTime(
                getDateFromWeekCode(s.week_code, s.day_name),
                s.end_time
            );
            // If the old shift rolled past midnight, bump its end date by 1
            if (
                parseTimeToMinutes(s.end_time) <=
                parseTimeToMinutes(s.start_time)
            ) {
                prevEnd.setDate(prevEnd.getDate() + 1);
            }

            // ONLY enforce a gap if this “prior” night actually ended *before* our new start
            if (prevEnd <= newStart) {
                if (newStart - prevEnd < 12 * 60 * 60 * 1000) {
                    return res.status(400).json({
                        error: 'לאחר משמרת לילה חובה הפרש של 12 שעות עד המשמרת הבאה'
                    });
                }
            }
            // If prevEnd > newStart, that night shift is actually in the future—skip it
        }

        // 10) If this shift itself is a night shift, enforce 12h gap BEFORE any FUTURE shift
        const nightOv = getNightOverlap(start_time, end_time);
        const isNight = nightOv >= 2;
        if (isNight) {
            let thisEnd = parseDateTime(dateStr, end_time);
            if (
                parseTimeToMinutes(end_time) <=
                parseTimeToMinutes(start_time)
            ) {
                thisEnd.setDate(thisEnd.getDate() + 1);
            }
            for (const f of allShifts) {
                const fStart = parseDateTime(
                    getDateFromWeekCode(f.week_code, f.day_name),
                    f.start_time
                );
                if (
                    fStart > thisEnd &&
                    (fStart - thisEnd) < 12 * 60 * 60 * 1000
                ) {
                    return res.status(400).json({
                        error: 'לאחר משמרת לילה חובה הפרש של 12 שעות עד המשמרת הבאה'
                    });
                }
            }
        }

        // 11) Weekend vs. Night length caps
        const isWknd = !isNight && isWeekendShift(day_name, start_time, end_time);
        if (isNight && shiftLen > 7) {
            return res.status(400).json({
                error: 'עולה על המקסימום 7 שעות במשמרת לילה.'
            });
        }
        if (isWknd && shiftLen > 8.5) {
            return res.status(400).json({
                error: 'עולה על המקסימום 8.5 שעות בסופ"ש.'
            });
        }

        // 12) Perform update
        const updRes = await pool.query(
            `UPDATE schedule.shifts
             SET day_name   = $1,
                 start_time = $2,
                 end_time   = $3,
                 note       = $4
             WHERE id = $5
                 RETURNING *`,
            [day_name, start_time, end_time, note, shiftId]
        );

        // Return is_static if it was requested
        const resultRow = { ...updRes.rows[0], is_static: !!req.body.is_static };

        // 13) Sync note to schedule.notes if employee is updating
        // 13) Sync note to schedule.notes if employee is updating
// IMPORTANT: notes are created via /api/notes. Here we only update if exists.
        if (!isManager) {
            const noteDate = getDateFromWeekCode(old.week_code, day_name);

            if (note && note.trim() !== '') {
                await pool.query(
                    `UPDATE schedule.notes
                     SET note=$1
                     WHERE employee_id=$2 AND date=$3`,
                    [note, old.employee_id, noteDate]
                );
            }
        }


        res.json(resultRow);
    } catch (err) {
        console.error('PUT /api/shifts/:id error:', err);
        res.status(500).json({ error: 'שגיאה בעדכון המשמרת' });
    }
});

app.delete('/api/shifts/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'לא מחובר/ת.' });
    try {
        const shiftId = parseInt(req.params.id, 10);
        const shiftQ = await pool.query(`SELECT employee_id FROM schedule.shifts WHERE id=$1`, [shiftId]);
        if (!shiftQ.rows.length) return res.status(404).json({ error: 'המשמרת לא נמצאה' });
        const shift = shiftQ.rows[0];
        if (req.session.role === 'Employee') {
            if (shift.employee_id !== req.session.userId) return res.status(403).json({ error: 'עובדים יכולים למחוק רק את המשמרות שלהם.' });
            if (!(await requirePermission(req, res, 'employee_delete_own_shift'))) return;
        } else {
            if (!(await requirePermission(req, res, 'manager_delete_shift'))) return;
        }
        const del = await pool.query(`DELETE FROM schedule.shifts WHERE id=$1 RETURNING id`, [shiftId]);
        if (!del.rows.length) return res.status(404).json({ error: 'המשמרת לא נמצאה' });
        res.json({ message: 'Shift deleted', id: shiftId });
    } catch {
        res.status(500).json({ error: 'שגיאה במחיקת המשמרת' });
    }
});

app.post('/api/shifts/submit-final', async (req, res) => {
    if (!(await requirePermission(req, res, 'employee_send_shifts'))) return;
    try {
        if (!req.session.userId) return res.status(401).json({ error: 'לא מחובר/ת.' });
        let actualWeekCode = req.body.week_code;
        const { employee_id } = req.body;
        if (!employee_id) return res.status(400).json({ error: 'חסר employee_id.' });
        if (parseInt(employee_id, 10) !== req.session.userId) return res.status(403).json({ error: 'עובדים יכולים להגיש רק את המשמרות שלהם.' });
        actualWeekCode = computeNextISOWeekCode();
        if (!(await checkIfLocked(actualWeekCode))) return res.status(400).json({ error: 'Lock time not reached.' });
        const shiftsQ = await pool.query(`SELECT id FROM schedule.shifts WHERE week_code=$1 AND employee_id=$2`, [actualWeekCode, employee_id]);
        if (!shiftsQ.rows.length) return res.status(404).json({ error: 'לא נמצאו משמרות.' });
        const mgrQ = await pool.query(`SELECT phone FROM schedule.users WHERE role='Manager' LIMIT 1`);
        if (!mgrQ.rows.length) return res.status(500).json({ error: 'לא נמצא מנהל.' });
        const shiftIds = shiftsQ.rows.map(r => r.id).join(', ');
        try {
            await sendSms(mgrQ.rows[0].phone, `Employee ${employee_id} final submission for week ${actualWeekCode}.\nShifts: ${shiftIds}`);
        } catch {
            return res.status(500).json({ error: 'שליחת הודעת SMS למנהל נכשלה.' });
        }
        await pool.query(
            `UPDATE schedule.employee_submission_status
             SET submitted_at=NOW()
             WHERE week_code=$1 AND employee_id=$2`,
            [actualWeekCode, employee_id]
        );
        res.json({ message: 'Final submission sent.', shiftIds });
    } catch {
        res.status(500).json({ error: 'שגיאה במסלול ההגשה הסופי.' });
    }
});

// --- Notes Routes ---
app.get('/api/notes', async (req, res) => {
    try {
        let query, params;

        if (req.session.role === 'Employee') {
            if (!(await requirePermission(req, res, 'employee_view_own_notes'))) return;
            query = `
                SELECT n.id, n.employee_id, u.full_name AS employee_name,
                       n.date, n.note, n.status, n.decision, n.handled_by
                FROM schedule.notes n
                         JOIN schedule.users u ON u.id = n.employee_id
                WHERE n.employee_id = $1
                ORDER BY n.id DESC`; // reverse order (latest first)
            params = [req.session.userId];
        } else {
            if (!(await requirePermission(req, res, 'manager_view_notes'))) return;
            query = `
                SELECT n.id, n.employee_id, u.full_name AS employee_name,
                       n.date, n.note, n.status, n.decision, n.handled_by
                FROM schedule.notes n
                         JOIN schedule.users u ON u.id = n.employee_id
                ORDER BY n.id DESC`; // reverse order (latest first)
            params = [];
        }

        const q = await pool.query(query, params);
        res.json(q.rows);
    } catch (err) {
        console.error('Error fetching notes:', err);
        res.status(500).json({ error: 'שגיאה באחזור הערות' });
    }
});


app.post('/api/notes', async (req, res) => {
    const { employee_id } = req.body;
    if (req.session.role === 'Employee') {
        if (!(await requirePermission(req, res, 'employee_create_own_note'))) return;
        if (parseInt(employee_id, 10) !== req.session.userId) return res.status(403).json({ error: 'עובדים יכולים ליצור רק הערות משלהם.' });
    } else {
        if (!(await requirePermission(req, res, 'manager_handle_notes'))) return;
    }

    // IMPORTANT: without a UNIQUE constraint on (employee_id, date), concurrent requests can create duplicates.
    // We prevent that by serializing writes per (employee_id, date) using pg_advisory_xact_lock.
    const client = await pool.connect();
    try {
        let { date, note, status, decision } = req.body;

        // Normalize to YYYY-MM-DD (avoid duplicates caused by time component)
        const normDate = String(date ?? '').slice(0, 10);
        status = status ?? 'new';
        decision = decision ?? 'pending';

        await client.query('BEGIN');

        // Serialize inserts/updates for the same employee+date (prevents duplicates without DB unique index)
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${employee_id}:${normDate}`]);

        const existing = await client.query(
            `SELECT id FROM schedule.notes WHERE employee_id=$1 AND date::text=$2 LIMIT 1`,
            [employee_id, normDate]
        );

        if (existing.rows.length) {
            const id = existing.rows[0].id;
            const upd = await client.query(
                `UPDATE schedule.notes
                 SET note=$1, status=$2, decision=$3, handled_by=NULL
                 WHERE id=$4
                     RETURNING *`,
                [note ?? '', status, decision, id]
            );
            await client.query('COMMIT');
            return res.status(200).json(upd.rows[0]);
        }

        const ins = await client.query(
            `INSERT INTO schedule.notes (employee_id, date, note, status, decision, handled_by)
             VALUES($1, $2, $3, $4, $5, NULL)
                 RETURNING *`,
            [employee_id, normDate, note ?? '', status, decision]
        );

        await client.query('COMMIT');
        return res.status(201).json(ins.rows[0]);
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) {}
        console.error('POST /api/notes error:', err);
        return res.status(500).json({ error: 'שגיאה ביצירת הערה' });
    } finally {
        client.release();
    }
});


app.put('/api/notes/:id', async (req, res) => {
    const noteId = parseInt(req.params.id, 10);

    try {
        const oldQ = await pool.query(`SELECT * FROM schedule.notes WHERE id=$1`, [noteId]);
        if (!oldQ.rows.length) {
            return res.status(404).json({ error: 'הערה לא נמצאה' });
        }
        const old = oldQ.rows[0];

        // ---- permissions ----
        if (req.session.role === 'Employee') {
            if (!(await requirePermission(req, res, 'employee_edit_own_note'))) return;
            if (old.employee_id !== req.session.userId) {
                return res.status(403).json({ error: 'עובדים יכולים לעדכן רק את ההערות שלהם.' });
            }
        } else {
            if (!(await requirePermission(req, res, 'manager_handle_notes'))) return;
        }

        const incomingNote = req.body.note;
        const incomingStatus = req.body.status;
        const incomingDecision = req.body.decision;

        // ✅ SPECIAL CASE: Employee cleared note =>
        // 1) notes.note => "הערה נמחקה ע\"י הנציג"
        // 2) shifts.note => '' (clear) for same employee/week/day
        // Do NOT change decision/handled_by.
        if (req.session.role === 'Employee' && incomingNote !== undefined && String(incomingNote).trim() === "") {
            const deletedMsg = 'הערה נמחקה ע"י הנציג';

            // update schedule.notes.note (and status only if provided)
            const updNote = await pool.query(
                `UPDATE schedule.notes
                 SET note = $1,
                     status = COALESCE($2, status)
                 WHERE id = $3
                     RETURNING *`,
                [deletedMsg, incomingStatus ?? null, noteId]
            );

            // clear schedule.shifts.note (best-effort)
            try {
                const weekCode = getLocalWeekCodeFromDate(old.date);   // e.g. "2026-W04"
                const dayHeb = getHebrewDayNameFromDateStr(old.date);  // e.g. "ראשון"

                // Clear note only for shifts belonging to the employee on that day
                await pool.query(
                    `UPDATE schedule.shifts
                     SET note = ''
                     WHERE employee_id = $1
                       AND week_code = $2
                       AND day_name = $3`,
                    [old.employee_id, weekCode, dayHeb]
                );
            } catch (e) {
                console.error('[notes-clear] failed to clear shifts.note:', e);
            }

            return res.json(updNote.rows[0]);
        }

        // ---- normal logic ----
        let newNote = old.note;
        let newStatus = old.status;
        let newDecision = old.decision;
        let newHandledBy = old.handled_by;

        if (incomingNote !== undefined) newNote = incomingNote;
        if (incomingStatus !== undefined) newStatus = incomingStatus;

        if (req.session.role === 'Employee') {
            // Employee: keep decision/handled_by as-is (only note/status changes)
        } else {
            // Manager: can change decision and handled_by
            if (incomingDecision !== undefined) {
                newDecision = incomingDecision;
                const managerName = req.session.full_name || "Unknown Manager";
                newHandledBy = (newDecision === "accepted" || newDecision === "denied")
                    ? managerName
                    : null;
            }

            // optional: if manager clears note => delete row
            if (incomingNote !== undefined && String(incomingNote).trim() === "") {
                await pool.query(`DELETE FROM schedule.notes WHERE id=$1`, [noteId]);
                return res.json({ deleted: true, id: noteId });
            }
        }

        const upd = await pool.query(
            `UPDATE schedule.notes
             SET note=$1, status=$2, decision=$3, handled_by=$4
             WHERE id=$5
                 RETURNING *`,
            [newNote, newStatus, newDecision, newHandledBy, noteId]
        );

        res.json(upd.rows[0]);
    } catch (err) {
        console.error('PUT /api/notes/:id error:', err);
        res.status(500).json({ error: 'Error updating note' });
    }
});




// --- Company Daily Limits ---
app.get('/api/company-daily-limits', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_company_limits'))) return;
    try {
        const q = await pool.query(
            `SELECT day_name, max_hours
             FROM schedule.company_daily_limits
             ORDER BY CASE day_name
                          WHEN 'Sunday' THEN 1 WHEN 'Monday' THEN 2 WHEN 'Tuesday' THEN 3
                          WHEN 'Wednesday' THEN 4 WHEN 'Thursday' THEN 5 WHEN 'Friday' THEN 6
                          WHEN 'Saturday' THEN 7 ELSE 8 END`
        );
        res.json(q.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה באחזור מגבלות יומיות של החברה' });
    }
});

app.put('/api/company-daily-limits', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_company_limits'))) return;
    try {
        const limits = req.body;
        if (!Array.isArray(limits)) return res.status(400).json({ error: 'צפוי מערך של מגבלות יומיות' });
        await pool.query('BEGIN');
        for (const limit of limits) {
            const { day_name, max_hours } = limit;
            await pool.query(
                `INSERT INTO schedule.company_daily_limits (day_name, max_hours, updated_at)
                 VALUES ($1, $2, NOW())
                     ON CONFLICT (day_name)
         DO UPDATE SET max_hours = EXCLUDED.max_hours, updated_at = NOW()`,
                [day_name, max_hours]
            );
        }
        await pool.query('COMMIT');
        const q = await pool.query(
            `SELECT day_name, max_hours
             FROM schedule.company_daily_limits
             ORDER BY CASE day_name
                          WHEN 'Sunday' THEN 1 WHEN 'Monday' THEN 2 WHEN 'Tuesday' THEN 3
                          WHEN 'Wednesday' THEN 4 WHEN 'Thursday' THEN 5 WHEN 'Friday' THEN 6
                          WHEN 'Saturday' THEN 7 ELSE 8 END`
        );
        res.json(q.rows);
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'שגיאה בעדכון מגבלות יומיות של החברה' });
    }
});

// --- Employee Daily Limits ---
app.get('/api/employee-daily-limits/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (req.session.role === 'Employee' && userId !== req.session.userId) {
        return res.status(403).json({ error: 'עובדים יכולים לראות רק את המגבלות שלהם עצמם.' });
    }
    if (req.session.role !== 'Employee') {
        if (!(await requirePermission(req, res, 'manager_manage_employee_limits'))) return;
    }
    try {
        const q = await pool.query(
            `SELECT day_name, max_hours
             FROM schedule.employee_daily_limits
             WHERE user_id = $1
             ORDER BY CASE day_name
                          WHEN 'Sunday' THEN 1 WHEN 'Monday' THEN 2 WHEN 'Tuesday' THEN 3
                          WHEN 'Wednesday' THEN 4 WHEN 'Thursday' THEN 5 WHEN 'Friday' THEN 6
                          WHEN 'Saturday' THEN 7 ELSE 8 END`,
            [userId]
        );
        res.json(q.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה באחזור מגבלות יומיות של עובדים' });
    }
});

app.put('/api/employee-daily-limits/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (req.session.role === 'Employee' && userId !== req.session.userId) {
        return res.status(403).json({ error: 'עובדים יכולים לעדכן רק את המגבלות שלהם.' });
    }
    if (req.session.role !== 'Employee') {
        if (!(await requirePermission(req, res, 'manager_manage_employee_limits'))) return;
    }
    try {
        const limits = req.body;
        if (!Array.isArray(limits)) return res.status(400).json({ error: 'צפוי מערך של מגבלות יומיות' });
        await pool.query('BEGIN');
        for (const limit of limits) {
            const { day_name, max_hours } = limit;
            await pool.query(
                `INSERT INTO schedule.employee_daily_limits (user_id, day_name, max_hours, updated_at)
                 VALUES ($1, $2, $3, NOW())
                     ON CONFLICT (user_id, day_name)
         DO UPDATE SET max_hours = EXCLUDED.max_hours, updated_at = NOW()`,
                [userId, day_name, max_hours]
            );
        }
        await pool.query('COMMIT');
        const q = await pool.query(
            `SELECT day_name, max_hours
             FROM schedule.employee_daily_limits
             WHERE user_id = $1
             ORDER BY CASE day_name
                          WHEN 'Sunday' THEN 1 WHEN 'Monday' THEN 2 WHEN 'Tuesday' THEN 3
                          WHEN 'Wednesday' THEN 4 WHEN 'Thursday' THEN 5 WHEN 'Friday' THEN 6
                          WHEN 'Saturday' THEN 7 ELSE 8 END`,
            [userId]
        );
        res.json(q.rows);
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'שגיאה בעדכון מגבלות יומיות של עובדים' });
    }
});

// --- Blockers ---
app.get('/api/blockers', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_blockers'))) return;
    try {
        const q = await pool.query(`SELECT * FROM schedule.blockers ORDER BY type, day_name, date, start_time`);
        res.json(q.rows);
    } catch {
        res.status(500).json({ error: 'שגיאה באחזור חוסמים' });
    }
});

app.post('/api/blockers', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_blockers'))) return;
    try {
        const { type, day_name, date, end_date, start_time, end_time, reason } = req.body;
        const ins = await pool.query(
            `INSERT INTO schedule.blockers (type, day_name, date, end_date, start_time, end_time, reason)
             VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [type || 'weekly', day_name || null, date || null, end_date || null, start_time, end_time, reason || '']
        );
        res.status(201).json(ins.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'שגיאה ביצירת חוסם' });
    }
});

app.put('/api/blockers/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_blockers'))) return;
    try {
        const blockerId = parseInt(req.params.id, 10);
        const oldQ = await pool.query(`SELECT * FROM schedule.blockers WHERE id=$1`, [blockerId]);
        if (!oldQ.rows.length) return res.status(404).json({ error: 'חוסם לא נמצא' });
        const old = oldQ.rows[0];
        const newType = req.body.type ?? old.type;
        const newDay = req.body.day_name ?? old.day_name;
        const newDate = req.body.date ?? old.date;
        const newEndDate = req.body.end_date ?? old.end_date;
        const newStart = req.body.start_time ?? old.start_time;
        const newEnd = req.body.end_time ?? old.end_time;
        const newReason = req.body.reason ?? old.reason;
        const upd = await pool.query(
            `UPDATE schedule.blockers SET type=$1, day_name=$2, date=$3, end_date=$4, start_time=$5, end_time=$6, reason=$7
             WHERE id=$8 RETURNING *`,
            [newType, newDay, newDate, newEndDate, newStart, newEnd, newReason, blockerId]
        );
        res.json(upd.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'שגיאה בעדכון חוסם' });
    }
});

app.delete('/api/blockers/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_blockers'))) return;
    try {
        const blockerId = parseInt(req.params.id, 10);
        const del = await pool.query(`DELETE FROM schedule.blockers WHERE id=$1 RETURNING id`, [blockerId]);
        if (!del.rows.length) return res.status(404).json({ error: 'חוסם לא נמצא' });
        res.json({ message: 'Blocker deleted', id: blockerId });
    } catch {
        res.status(500).json({ error: 'שגיאה במחיקת חוסם' });
    }
});

// --- Week Status ---

function normalizePhoneDigitsOnly(v) {
    return String(v ?? '').replace(/\D/g, ''); // оставляет только цифры
}


function getTodayDateStr() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
app.get('/api/week-status/:weekCode', async (req, res) => {
    try {
        const q = await pool.query(
            `SELECT week_code, is_published, status_changed_at FROM schedule.week_status WHERE week_code=$1`,
            [req.params.weekCode]
        );
        if (!q.rows.length) {
            return res.json({ week_code: req.params.weekCode, is_published: false, status_changed_at: null });
        }
        res.json(q.rows[0]);
    } catch {
        res.status(500).json({ error: 'שגיאה באחזור סטטוס השבוע' });
    }
});

app.put('/api/week-status/:weekCode', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_open_week_registration'))) return;
    try {
        const { weekCode } = req.params;
        const { is_published, changedShiftIds } = req.body;
        let resultRow;

        // If publishing, update all shifts for that week
        if (is_published) {
            await pool.query(`UPDATE schedule.shifts SET ispublished=true WHERE week_code=$1`, [weekCode]);
        }

        // Update or insert the week_status record
        const old = await pool.query(
            `SELECT week_code, is_published FROM schedule.week_status WHERE week_code=$1`,
            [weekCode]
        );
        if (old.rows.length) {
            const upd = await pool.query(
                `UPDATE schedule.week_status SET is_published=$1, status_changed_at=NOW() WHERE week_code=$2 RETURNING *`,
                [is_published, weekCode]
            );
            resultRow = upd.rows[0];
        } else {
            const ins = await pool.query(
                `INSERT INTO schedule.week_status (week_code, is_published, status_changed_at)
                 VALUES ($1, $2, NOW()) RETURNING *`,
                [weekCode, is_published]
            );
            resultRow = ins.rows[0];
        }

        // For published weeks, perform additional updates
        if (is_published) {
            // Insert employee submission status records if needed
            await pool.query(
                `INSERT INTO schedule.employee_submission_status (week_code, employee_id)
                 SELECT $1, u.id FROM schedule.users u
                 WHERE LOWER(u.status)='active' AND u.role='Employee'
                     ON CONFLICT (week_code, employee_id) DO NOTHING`,
                [weekCode]
            );
            // Create missing shifts from static shifts (Only for today and future days)
            // Create missing shifts from static shifts, respecting start/end week range if configured
            let staticSql = `SELECT * FROM schedule.shifts_static WHERE isactive=true`;
            const params = [];
            const weekNum = `(split_part($1, '-W', 1)::int*100 + split_part($1, '-W', 2)::int)`;
            const ssWeekNum = (col) => `(split_part(${col}, '-W', 1)::int*100 + split_part(${col}, '-W', 2)::int)`;
            const conds = [];
            if (STATIC_SHIFT_COLS.loaded && STATIC_SHIFT_COLS.hasStartWeek) {
                conds.push(`(start_week_code IS NULL OR ${ssWeekNum('start_week_code')} <= ${weekNum})`);
            }
            if (STATIC_SHIFT_COLS.loaded && STATIC_SHIFT_COLS.hasEndWeek) {
                conds.push(`(end_week_code IS NULL OR ${ssWeekNum('end_week_code')} >= ${weekNum})`);
            }
            if (conds.length) {
                staticSql += ` AND ` + conds.join(' AND ');
                params.push(weekCode);
            }
            const sQ = params.length ? await pool.query(staticSql, params) : await pool.query(staticSql);

            // Use local server date for comparison
            const todayStr = getTodayDateStr();

            for (const st of sQ.rows) {
                const shiftDateStr = getDateFromWeekCode(weekCode, st.day_name);

                // If shift date is before today - skip
                // Compare YYYY-MM-DD strings for reliability
                if (shiftDateStr < todayStr) {
                    console.log(`[Static Shift Gen] Skipping past date: ${shiftDateStr} (Today is ${todayStr})`);
                    continue;
                }

                const check = await pool.query(
                    `SELECT id FROM schedule.shifts WHERE week_code=$1 AND day_name=$2 AND employee_id=$3`,
                    [weekCode, st.day_name, st.employee_id]
                );
                if (!check.rows.length) {
                    await pool.query(
                        `INSERT INTO schedule.shifts (week_code, day_name, employee_id, start_time, end_time, note, issent, ispublished)
                         VALUES ($1, $2, $3, $4, $5, $6, true, true)`,
                        [weekCode, st.day_name, st.employee_id, st.start_time, st.end_time, '']
                    );
                }
            }
        }

        // Immediately return a response indicating success
        res.status(202).json(resultRow);

        // If published, process notifications in the background
        if (is_published) {
            const bgRunId = mkRunId('publish', weekCode);

            (async () => {
                try {
                    logEvent('PUBLISH_BG_START', {
                        bgRunId,
                        weekCode,
                        changedShiftIdsLen: (changedShiftIds || []).length,
                        templateId: req.body.templateId || DEFAULT_PUBLISH_TEMPLATE_ID,
                        mode: 'SEND_ALL_WEEK_SHIFTS'
                    });

                    const allQ = await pool.query(
                        `SELECT id FROM schedule.shifts WHERE week_code=$1`,
                        [weekCode]
                    );
                    const allShiftIds = allQ.rows.map(r => r.id);

                    logEvent('PUBLISH_BG_SHIFTIDS_READY', {
                        bgRunId,
                        weekCode,
                        allShiftIdsLen: allShiftIds.length
                    });

                    if (!allShiftIds.length) {
                        logEvent('PUBLISH_BG_NO_SHIFTS', { bgRunId, weekCode, willNotifyAllActiveEmployees: true });
                        // DO NOT return — still notify all active employees
                    }

                    await sendNotificationsDirect(
                        allShiftIds,
                        req.body.templateId || DEFAULT_PUBLISH_TEMPLATE_ID,
                        'both'
                    );

                    logEvent('PUBLISH_BG_DONE', { bgRunId, weekCode });
                } catch (err) {
                    logEvent('PUBLISH_BG_ERROR', { bgRunId, weekCode, error: shortErr(err) });
                }
            })();
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה בעדכון סטטוס השבוע' });
    }
});

// --- Shifts Static, Templates, Reminders, Arrival, etc. ---
// (For these endpoints, add similar permission checks as needed. Here is an example for static shifts.)

app.get('/api/shifts-static', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_static_shifts'))) return;
    try {
        const activeOnly = req.query.activeOnly === 'true';
        const q = activeOnly
            ? await pool.query(
                `SELECT * FROM schedule.shifts_static WHERE isactive=true ORDER BY employee_id, day_name, start_time`
            )
            : await pool.query(`SELECT * FROM schedule.shifts_static ORDER BY employee_id, day_name, start_time`);
        res.json(q.rows);
    } catch {
        res.status(500).json({ error: 'שגיאה באחזור משמרות סטטיות' });
    }
});

app.post('/api/shifts-static', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_static_shifts'))) return;
    try {
        const { day_name, employee_id, start_time, end_time, isactive, start_week_code } = req.body;
        const activeVal = isactive === undefined ? true : !!isactive;

        // helper: 2026-W04 -> 202604
        const toWeekNum = (wk) => {
            const m = /^(\d{4})-W(\d{1,2})$/.exec((wk || '').trim());
            if (!m) return null;
            return (parseInt(m[1], 10) * 100) + parseInt(m[2], 10);
        };

        // Ищем "такую же" постоянную смену (по сути шаблон)
        const existQ = await pool.query(
            `SELECT * FROM schedule.shifts_static
             WHERE day_name=$1 AND employee_id=$2 AND start_time=$3 AND end_time=$4
                 LIMIT 1`,
            [day_name, employee_id, start_time, end_time]
        );

        if (existQ.rows.length > 0) {
            const existing = existQ.rows[0];

            // Логика старта:
            // - если у существующей NULL -> она "всегда" (самая ранняя), оставляем NULL
            // - если новая NULL -> делаем NULL (значит "с самого начала")
            // - иначе берём более раннюю неделю из двух
            let finalStart = existing.start_week_code ?? null;

            if (start_week_code == null || start_week_code === '') {
                finalStart = null;
            } else if (finalStart == null) {
                finalStart = null;
            } else {
                const a = toWeekNum(finalStart);
                const b = toWeekNum(start_week_code);
                if (a != null && b != null && b < a) finalStart = start_week_code;
            }

            // When re-activating a static shift, also clear end_week_code (if column exists)
            let upd;
            if (STATIC_SHIFT_COLS.loaded && STATIC_SHIFT_COLS.hasEndWeek) {
                upd = await pool.query(
                    `UPDATE schedule.shifts_static
                     SET isactive=true, start_week_code=$1, end_week_code=NULL
                     WHERE id=$2
                         RETURNING *`,
                    [finalStart, existing.id]
                );
            } else {
                upd = await pool.query(
                    `UPDATE schedule.shifts_static
                     SET isactive=true, start_week_code=$1
                     WHERE id=$2
                         RETURNING *`,
                    [finalStart, existing.id]
                );
            }

            return res.status(200).json(upd.rows[0]);
        }

        // Создаём новую
        const ins = await pool.query(
            `INSERT INTO schedule.shifts_static (day_name, employee_id, start_time, end_time, isactive, start_week_code)
             VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
            [day_name, employee_id, start_time, end_time, activeVal, start_week_code || null]
        );
        res.status(201).json(ins.rows[0]);
    } catch (err) {
        console.error('Error creating static shift:', err);
        res.status(500).json({ error: 'שגיאה ביצירת הזזה סטטית' });
    }
});

app.put('/api/shifts-static/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid static id' });

    const { day_name, employee_id, start_time, end_time, isactive, start_week_code, end_week_code } = req.body;

    try {
        // 1) fetch current row
        const cur = await pool.query(
            `SELECT id, end_week_code FROM schedule.shifts_static WHERE id=$1`,
            [id]
        );
        if (!cur.rowCount) return res.status(404).json({ error: 'Static shift not found' });

        const existingEnd = cur.rows[0].end_week_code;

        // 2) block rewriting end_week_code
        if (end_week_code && existingEnd && existingEnd !== end_week_code) {
            return res.status(409).json({
                error: 'end_week_code_already_set',
                message: `Static shift already ended at ${existingEnd}. Changing it is not allowed.`
            });
        }

        // 3) update (allow setting end_week_code only once, or same value)
        const updated = await pool.query(
            `
                UPDATE schedule.shifts_static
                SET
                    day_name = COALESCE($2, day_name),
                    employee_id = COALESCE($3, employee_id),
                    start_time = COALESCE($4, start_time),
                    end_time = COALESCE($5, end_time),
                    isactive = COALESCE($6, isactive),
                    start_week_code = COALESCE($7, start_week_code),
                    end_week_code = COALESCE($8, end_week_code)
                WHERE id=$1
                    RETURNING *
            `,
            [id, day_name, employee_id, start_time, end_time, isactive, start_week_code, end_week_code]
        );

        return res.json(updated.rows[0]);
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.delete('/api/shifts-static/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_static_shifts'))) return;
    try {
        const staticId = parseInt(req.params.id, 10);
        const del = await pool.query(`DELETE FROM schedule.shifts_static WHERE id=$1 RETURNING id`, [staticId]);
        if (!del.rows.length) return res.status(404).json({ error: 'לא נמצא' });
        res.json({ message: 'Static shift deleted', id: staticId });
    } catch {
        res.status(500).json({ error: 'שגיאה במחיקת המשמרת הסטטית' });
    }
});

// --- Templates ---
app.get('/api/templates', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_templates'))) return;
    try {
        const q = await pool.query(`SELECT * FROM schedule.templates ORDER BY id`);
        res.json(q.rows);
    } catch {
        res.status(500).json({ error: 'שגיאה באחזור תבניות' });
    }
});

app.post('/api/templates', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_templates'))) return;
    try {
        const { template_name, template_type, subject, body, opening_text, ending_text } = req.body;
        if (!template_name || !template_type || !body) return res.status(400).json({ error: 'שדות חובה חסרים' });
        const ins = await pool.query(
            `INSERT INTO schedule.templates (template_name, template_type, subject, body, opening_text, ending_text)
             VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
            [template_name, template_type, subject || null, body, opening_text || null, ending_text || null]
        );
        res.json(ins.rows[0]);
    } catch {
        res.status(500).json({ error: 'שגיאה ביצירת התבנית' });
    }
});

app.put('/api/templates/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_templates'))) return;
    try {
        const id = parseInt(req.params.id, 10);
        const oldQ = await pool.query(`SELECT * FROM schedule.templates WHERE id=$1`, [id]);
        if (!oldQ.rows.length) return res.status(404).json({ error: 'התבנית לא נמצאה' });
        const oldT = oldQ.rows[0];
        const newName = req.body.template_name ?? oldT.template_name;
        const newType = req.body.template_type ?? oldT.template_type;
        const newSubject = req.body.subject ?? oldT.subject;
        const newBody = req.body.body ?? oldT.body;
        const newOpen = req.body.opening_text ?? oldT.opening_text;
        const newEnd = req.body.ending_text ?? oldT.ending_text;
        const upd = await pool.query(
            `UPDATE schedule.templates
             SET template_name=$1, template_type=$2, subject=$3, body=$4,
                 opening_text=$5, ending_text=$6, updated_at=NOW()
             WHERE id=$7 RETURNING *`,
            [newName, newType, newSubject, newBody, newOpen, newEnd, id]
        );
        res.json(upd.rows[0]);
    } catch {
        res.status(500).json({ error: 'שגיאה בעדכון התבנית' });
    }
});

app.delete('/api/templates/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_templates'))) return;
    try {
        const id = parseInt(req.params.id, 10);
        const del = await pool.query(`DELETE FROM schedule.templates WHERE id=$1 RETURNING id`, [id]);
        if (!del.rows.length) return res.status(404).json({ error: 'התבנית לא נמצאה' });
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'שגיאה במחיקת התבנית' });
    }
});

// --- Reminders ---
app.get('/api/reminders/:weekCode', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_reminders'))) return;
    try {
        const q = await pool.query(
            `SELECT r.*, t.template_name, t.template_type
             FROM schedule.reminders r JOIN schedule.templates t ON t.id=r.template_id
             WHERE r.week_code=$1 ORDER BY r.send_at`,
            [req.params.weekCode]
        );
        res.json(q.rows);
    } catch {
        res.status(500).json({ error: 'שגיאה באחזור תזכורות' });
    }
});

app.post('/api/reminders', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_reminders'))) return;
    try {
        const { week_code, template_id, send_at, lock_at, reminder_frequency, is_active } = req.body;
        if (!week_code || !template_id || !send_at) return res.status(400).json({ error: 'שדות חובה חסרים' });
        const freq = reminder_frequency || null;
        const activeVal = is_active === undefined ? true : !!is_active;
        const ins = await pool.query(
            `INSERT INTO schedule.reminders (week_code, template_id, send_at, lock_at, reminder_frequency, is_active)
             VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
            [week_code, template_id, send_at, lock_at || null, freq, activeVal]
        );
        res.json(ins.rows[0]);
    } catch {
        res.status(500).json({ error: 'שגיאה ביצירת תזכורת' });
    }
});

app.put('/api/reminders/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_reminders'))) return;
    try {
        const id = parseInt(req.params.id, 10);
        const oldQ = await pool.query(`SELECT * FROM schedule.reminders WHERE id=$1`, [id]);
        if (!oldQ.rows.length) return res.status(404).json({ error: 'התזכורת לא נמצאה' });
        const old = oldQ.rows[0];
        const { template_id, send_at, is_sent, lock_at, reminder_frequency, is_active } = req.body;
        const upd = await pool.query(
            `UPDATE schedule.reminders
             SET template_id=$1, send_at=$2, is_sent=$3, reminder_frequency=$4,
                 is_active=$5, lock_at=$6, updated_at=NOW()
             WHERE id=$7 RETURNING *`,
            [template_id ?? old.template_id, send_at ?? old.send_at, is_sent ?? old.is_sent, reminder_frequency ?? old.reminder_frequency, is_active ?? old.is_active, lock_at ?? old.lock_at, id]
        );
        res.json(upd.rows[0]);
    } catch {
        res.status(500).json({ error: 'שגיאה בעדכון התזכורת' });
    }
});

app.delete('/api/reminders/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_reminders'))) return;
    try {
        const id = parseInt(req.params.id, 10);
        const del = await pool.query(`DELETE FROM schedule.reminders WHERE id=$1 RETURNING id`, [id]);
        if (!del.rows.length) return res.status(404).json({ error: 'התזכורת לא נמצאה' });
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'שגיאה במחיקת התזכורת' });
    }
});

app.post('/api/reminders/manual-send', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_send_manual_notification'))) return;

    // Immediately respond to avoid blocking
    res.status(202).json({ message: 'Manual reminder process started' });

    // Process in background
    (async () => {
        try {
            const { template_id, employeeIds, week_code } = req.body;
            if (!template_id || !Array.isArray(employeeIds) || !employeeIds.length) {
                console.error('Missing template_id or employeeIds.');
                return;
            }

            // Fetch template
            const tplQ = await pool.query(
                `SELECT id, template_name, template_type, subject, body, opening_text, ending_text
                 FROM schedule.templates
                 WHERE id=$1`,
                [template_id]
            );
            if (!tplQ.rows.length) {
                console.error('Template not found.');
                return;
            }
            const template = tplQ.rows[0];

            // If a week_code was provided, fetch shifts
            let shiftsByEmp = {};
            if (week_code) {
                const sQ = await pool.query(
                    `SELECT s.id, s.week_code, s.day_name, s.start_time, s.end_time,
                            u.id AS employee_id, u.full_name AS employee_name
                     FROM schedule.shifts s
                              JOIN schedule.users u ON u.id = s.employee_id
                     WHERE s.week_code=$1 AND u.id = ANY($2)`,
                    [week_code, employeeIds]
                );

                for (const row of sQ.rows) {
                    if (!shiftsByEmp[row.employee_id]) {
                        shiftsByEmp[row.employee_id] = [];
                    }
                    const dateStr = getDateFromWeekCode(row.week_code, row.day_name);

                    shiftsByEmp[row.employee_id].push({
                        dateStr,
                        day_name: row.day_name,
                        start_time: row.start_time,
                        end_time: row.end_time
                    });
                }
            }

            // 2) For each employee ID, build and send the message
            const empQ = await pool.query(
                `SELECT id, full_name AS name
                 FROM schedule.users
                 WHERE id = ANY($1)`,
                [employeeIds]
            );
            if (!empQ.rows.length) {
                console.error('No matching employees.');
                return;
            }

            // Helper to parse "HH:MM"
            function parseTimeToMinutes(t) {
                const [h, m] = t.split(':').map(Number);
                return h * 60 + (m || 0);
            }

            for (const e of empQ.rows) {
                // Look up phone/email
                const extraCols = [];
                if (USER_NOTIFY_COLS.smsCol) extraCols.push(`${USER_NOTIFY_COLS.smsCol} AS notify_sms_flag`);
                if (USER_NOTIFY_COLS.emailCol) extraCols.push(`${USER_NOTIFY_COLS.emailCol} AS notify_email_flag`);
                if (USER_NOTIFY_COLS.globalCol) extraCols.push(`${USER_NOTIFY_COLS.globalCol} AS notify_global_flag`);

                const userSelectSql = `
                    SELECT phone, email, status, role
                        ${extraCols.length ? ',' + extraCols.join(',') : ''}
                    FROM schedule.users
                    WHERE id = $1
                `;

                const userQ = await pool.query(userSelectSql, [e.id]);
                if (!userQ.rows.length) continue;
                const { phone, email } = userQ.rows[0];

                // Build the body
                let msgText = (template.body || '').replace('{{employeeName}}', e.name);

                // If we have a week_code, build a sorted shift list for this employee
                if (week_code) {
                    const userShifts = shiftsByEmp[e.id] || [];

                    // SORT the user's shift list by date + start_time
                    userShifts.sort((a, b) => {
                        const dateA = new Date(a.dateStr);
                        const dateB = new Date(b.dateStr);
                        const dDiff = dateA - dateB;
                        if (dDiff !== 0) return dDiff;
                        return parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time);
                    });

                    // Format lines
                    const lines = userShifts.map(s => {
                        const trimmedDay = (s.day_name || '').trim() || '???';
                        return `${s.dateStr} ${s.start_time}-${s.end_time} (${trimmedDay})`;
                    });
                    // Insert them into msgText
                    msgText = msgText.replace('{{shifts}}', lines.join('\n'));
                } else {
                    // If no week_code, remove the placeholder
                    msgText = msgText.replace('{{shifts}}', '');
                }

                if (template.opening_text) {
                    msgText = `${template.opening_text}\n\n${msgText}`;
                }
                if (template.ending_text) {
                    msgText += `\n\n${template.ending_text}`;
                }

                // Send it, depending on template_type
                if (template.template_type === 'sms') {
                    if (phone) {
                        await sendSms(phone, msgText);
                        await delay(SMS_DELAY);
                    }
                } else if (template.template_type === 'email') {
                    if (email) {
                        const subj = template.subject || 'Notification';
                        await sendEmail(email, subj, `<pre>${msgText}</pre>`);
                    }
                } else if (template.template_type === 'both') {
                    if (phone) {
                        await sendSms(phone, msgText);
                        await delay(SMS_DELAY);
                    }
                    if (email) {
                        const subj = template.subject || 'Notification';
                        await sendEmail(email, subj, `<pre>${msgText}</pre>`);
                    }
                }
            }
        } catch (err) {
            console.error('Error in background manual reminder process:', err);
        }
    })();
});

// --- Employee Submission Status ---
app.get('/api/employee-submission-status/:weekCode', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_submission_status'))) return;
    try {
        const q = await pool.query(
            `SELECT ess.id, ess.week_code, ess.employee_id, u.full_name AS employee_name,
                    ess.opened_at, ess.registered_at, ess.submitted_at
             FROM schedule.employee_submission_status ess JOIN schedule.users u ON u.id = ess.employee_id
             WHERE ess.week_code=$1 ORDER BY u.full_name`,
            [req.params.weekCode]
        );
        res.json(q.rows);
    } catch {
        res.status(500).json({ error: 'שגיאה באחזור סטטוס ההגשה' });
    }
});

app.put('/api/employee-submission-status/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_submission_status'))) return;
    try {
        const statusId = parseInt(req.params.id, 10);
        const oldQ = await pool.query(`SELECT * FROM schedule.employee_submission_status WHERE id=$1`, [statusId]);
        if (!oldQ.rows.length) return res.status(404).json({ error: 'לא נמצא' });
        const oldRow = oldQ.rows[0];
        const newOpened = req.body.opened_at ?? oldRow.opened_at;
        const newReg = req.body.registered_at ?? oldRow.registered_at;
        const newSub = req.body.submitted_at ?? oldRow.submitted_at;
        const upd = await pool.query(
            `UPDATE schedule.employee_submission_status SET opened_at=$1, registered_at=$2, submitted_at=$3 WHERE id=$4 RETURNING *`,
            [newOpened, newReg, newSub, statusId]
        );
        res.json(upd.rows[0]);
    } catch {
        res.status(500).json({ error: 'שגיאה בעדכון סטטוס ההגשה' });
    }
});

// --- Arrival Routes ---
app.get('/api/arrival', async (req, res) => {
    if (req.session.role === 'Employee') {
        if (!(await requirePermission(req, res, 'employee_view_arrival'))) return;
    } else {
        if (!(await requirePermission(req, res, 'manager_manage_arrivals'))) return;
    }
    try {
        const { start, end } = req.query;
        if (!start || !end) return res.status(400).json({ error: 'טווח תאריכים חסר' });
        const q = await pool.query(
            `SELECT a.id, a.employee_id, u.full_name AS employee_name, a.date, a.status
             FROM schedule.employee_arrival a JOIN schedule.users u ON u.id = a.employee_id
             WHERE a.date >= $1 AND a.date <= $2 ORDER BY a.date, u.full_name`,
            [start, end]
        );
        res.json(q.rows);
    } catch {
        res.status(500).json({ error: 'שגיאה באחזור נתוני הגעה' });
    }
});

app.get('/api/arrival/week/:weekCode', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_arrivals'))) return;
    try {
        const result = await pool.query(
            `SELECT a.id, a.employee_id, u.full_name AS employee_name, to_char(a.date, 'YYYY-MM-DD') AS date, a.status, a.week_code
             FROM schedule.employee_arrival a JOIN schedule.users u ON u.id = a.employee_id
             WHERE a.week_code = $1 ORDER BY a.date, u.full_name`,
            [req.params.weekCode]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error in GET /api/arrival/week/:weekCode:', err);
        res.status(500).json({ error: 'שגיאה באחזור נתוני הגעה' });
    }
});

app.post('/api/arrival', async (req, res) => {
    if (req.session.role === 'Employee') {
        if (!(await requirePermission(req, res, 'employee_create_arrival'))) return;
        if (parseInt(req.body.employee_id, 10) !== req.session.userId) {
            return res.status(403).json({ error: 'עובדים יכולים ליצור רק רישומי הגעה משלהם.' });
        }
    } else {
        if (!(await requirePermission(req, res, 'manager_manage_arrivals'))) return;
    }
    try {
        const { employee_id, date, status, week_code } = req.body;
        if (!employee_id || !date || !status || !week_code) return res.status(400).json({ error: 'שדות חסרים.' });
        const upsert = await pool.query(
            `INSERT INTO schedule.employee_arrival (employee_id, date, status, week_code)
             VALUES ($1,$2,$3,$4)
                 ON CONFLICT (employee_id, week_code, date)
       DO UPDATE SET status=EXCLUDED.status RETURNING *`,
            [employee_id, date, status, week_code]
        );
        res.status(201).json(upsert.rows[0]);
    } catch {
        res.status(500).json({ error: 'שגיאה בעדכון רשומת ההגעה' });
    }
});

app.put('/api/arrival/:id', async (req, res) => {
    if (req.session.role === 'Employee') {
        if (!(await requirePermission(req, res, 'employee_update_arrival'))) return;
    } else {
        if (!(await requirePermission(req, res, 'manager_manage_arrivals'))) return;
    }
    try {
        const arrivalId = parseInt(req.params.id, 10);
        const oldQ = await pool.query(`SELECT * FROM schedule.employee_arrival WHERE id=$1`, [arrivalId]);
        if (!oldQ.rows.length) return res.status(404).json({ error: 'לא נמצא' });
        const old = oldQ.rows[0];
        const newDate = req.body.date ?? old.date;
        const newStatus = req.body.status ?? old.status;
        const upd = await pool.query(
            `UPDATE schedule.employee_arrival SET date=$1, status=$2 WHERE id=$3 RETURNING *`,
            [newDate, newStatus, arrivalId]
        );
        res.json(upd.rows[0]);
    } catch {
        res.status(500).json({ error: 'שגיאה בעדכון ההגעה' });
    }
});

app.delete('/api/arrival/:id', async (req, res) => {
    if (req.session.role === 'Employee') {
        if (!(await requirePermission(req, res, 'employee_delete_arrival'))) return;
    } else {
        if (!(await requirePermission(req, res, 'manager_manage_arrivals'))) return;
    }
    try {
        const arrivalId = parseInt(req.params.id, 10);
        const del = await pool.query(`DELETE FROM schedule.employee_arrival WHERE id=$1 RETURNING id`, [arrivalId]);
        if (!del.rows.length) return res.status(404).json({ error: 'לא נמצא' });
        res.json({ message: 'Arrival record deleted', id: arrivalId });
    } catch {
        res.status(500).json({ error: 'שגיאה במחיקת רשומת הגעה' });
    }
});

// --- Skills Endpoints (accessible only by admin/manager) ---

// GET all skills
app.get('/api/skills', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_skills'))) return;
    try {
        const q = await pool.query(`SELECT * FROM schedule.skills ORDER BY id`);
        res.json(q.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה באחזור מיומנויות' });
    }
});

// POST create a new skill
app.post('/api/skills', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_skills'))) return;
    const { skill_name } = req.body;
    if (!skill_name) return res.status(400).json({ error: 'חסר שם מיומנות' });
    try {
        const ins = await pool.query(
            `INSERT INTO schedule.skills (skill_name)
             VALUES ($1)
                 RETURNING *`,
            [skill_name]
        );
        res.status(201).json(ins.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה ביצירת המיומנות' });
    }
});

// PUT update an existing skill
app.put('/api/skills/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_skills'))) return;

    const skillId = parseInt(req.params.id, 10);
    const { skill_name: newSkillName } = req.body;
    if (!newSkillName) {
        return res.status(400).json({ error: 'חסר שם מיומנות' });
    }

    try {
        // Start a transaction so we can either do everything or rollback
        await pool.query('BEGIN');

        // 1) Get the old skill name
        const oldSkillQuery = await pool.query(
            `SELECT skill_name
             FROM schedule.skills
             WHERE id=$1
                 LIMIT 1`,
            [skillId]
        );

        if (!oldSkillQuery.rows.length) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'המיומנות לא נמצאה' });
        }
        const oldSkillName = oldSkillQuery.rows[0].skill_name;

        // 2) Update the skill name in the skills table
        const upd = await pool.query(
            `UPDATE schedule.skills
             SET skill_name = $1
             WHERE id = $2
                 RETURNING *`,
            [newSkillName, skillId]
        );
        if (!upd.rows.length) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'המיומנות לא נמצאה' });
        }

        // 3) Update the skill name in every user's array of skills
        //    array_replace(skills, 'OldName', 'NewName')
        await pool.query(
            `UPDATE schedule.users
             SET skills = array_replace(skills, $1, $2)
             WHERE $1 = ANY(skills)`,
            [oldSkillName, newSkillName]
        );

        // Commit the transaction
        await pool.query('COMMIT');

        // Return the updated skill row
        res.json(upd.rows[0]);
    } catch (err) {
        // If something goes wrong, rollback the transaction
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'שגיאה בעדכון המיומנות' });
    }
});


// DELETE a skill
app.delete('/api/skills/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_skills'))) return;
    const skillId = parseInt(req.params.id, 10);
    try {
        const del = await pool.query(
            `DELETE FROM schedule.skills WHERE id = $1 RETURNING id`,
            [skillId]
        );
        if (!del.rows.length) return res.status(404).json({ error: 'המיומנות לא נמצאה' });
        res.json({ message: 'Skill deleted', id: skillId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'שגיאה במחיקת המיומנות' });
    }
});

// Get all manager categories
app.get('/api/manager-categories', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_users'))) return;
    try {
        const q = await pool.query('SELECT id, title FROM schedule.manager_categories ORDER BY id');
        res.json(q.rows);
    } catch (err) {
        res.status(500).json({ error: 'שגיאה באחזור קטגוריות מנהלים' });
    }
});

// Create manager category
app.post('/api/manager-categories', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_managers'))) return;
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Missing manager category title' });
    try {
        const q = await pool.query(
            `INSERT INTO schedule.manager_categories (title) VALUES ($1) RETURNING *`,
            [title]
        );
        res.status(201).json(q.rows[0]);
    } catch {
        res.status(500).json({ error: 'שגיאה ביצירת קטגוריית מנהל' });
    }
});

// Update manager category
app.put('/api/manager-categories/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_managers'))) return;
    const { id } = req.params;
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Missing title' });
    try {
        const q = await pool.query(
            `UPDATE schedule.manager_categories SET title=$1 WHERE id=$2 RETURNING *`,
            [title, id]
        );
        if (!q.rows.length) return res.status(404).json({ error: 'קטגוריה לא נמצאה' });
        res.json(q.rows[0]);
    } catch {
        res.status(500).json({ error: 'שגיאה בעדכון קטגוריה' });
    }
});

// Delete manager category
app.delete('/api/manager-categories/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_managers'))) return;
    const { id } = req.params;
    try {
        const q = await pool.query(
            `DELETE FROM schedule.manager_categories WHERE id=$1 RETURNING id`,
            [id]
        );
        if (!q.rows.length) return res.status(404).json({ error: 'קטגוריה לא נמצאה' });
        res.json({ message: 'Manager category deleted', id: id });
    } catch {
        res.status(500).json({ error: 'שגיאה במחיקת קטגוריה' });
    }
});

// Get all managers with their category
app.get('/api/managers', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_users'))) return;
    try {
        const q = await pool.query(
            `SELECT m.id, m.full_name, m.category_id, c.title AS category_title
             FROM schedule.managers m
                      JOIN schedule.manager_categories c ON m.category_id = c.id
             ORDER BY m.id`
        );
        res.json(q.rows);
    } catch {
        res.status(500).json({ error: 'שגיאה באחזור מנהלים' });
    }
});

// Create manager
app.post('/api/managers', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_managers'))) return;
    const { full_name, category_id } = req.body;
    if (!full_name || !category_id)
        return res.status(400).json({ error: 'Missing manager name or category_id' });
    try {
        const q = await pool.query(
            `INSERT INTO schedule.managers (full_name, category_id)
             VALUES ($1, $2) RETURNING *`,
            [full_name, category_id]
        );
        res.status(201).json(q.rows[0]);
    } catch {
        res.status(500).json({ error: 'שגיאה ביצירת מנהל' });
    }
});

// Update manager
app.put('/api/managers/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_managers'))) return;
    const { id } = req.params;
    const { full_name, category_id } = req.body;
    try {
        const q = await pool.query(
            `UPDATE schedule.managers SET full_name=$1, category_id=$2 WHERE id=$3 RETURNING *`,
            [full_name, category_id, id]
        );
        if (!q.rows.length) return res.status(404).json({ error: 'מנהל לא נמצא' });
        res.json(q.rows[0]);
    } catch {
        res.status(500).json({ error: 'שגיאה בעדכון מנהל' });
    }
});

// Delete manager
app.delete('/api/managers/:id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_managers'))) return;
    const { id } = req.params;
    try {
        const q = await pool.query(
            `DELETE FROM schedule.managers WHERE id=$1 RETURNING id`,
            [id]
        );
        if (!q.rows.length) return res.status(404).json({ error: 'מנהל לא נמצא' });
        res.json({ message: 'Manager deleted', id: id });
    } catch {
        res.status(500).json({ error: 'שגיאה במחיקת מנהל' });
    }
});

// Assign a manager to an employee
app.post('/api/employee-manager', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_managers'))) return;
    const { employee_id, manager_id } = req.body;
    if (!employee_id || !manager_id)
        return res.status(400).json({ error: 'Missing employee_id or manager_id' });
    try {
        await pool.query(
            `INSERT INTO schedule.employee_manager (employee_id, manager_id)
             VALUES ($1, $2)
                 ON CONFLICT (employee_id) DO UPDATE SET manager_id=EXCLUDED.manager_id`,
            [employee_id, manager_id]
        );
        res.json({ message: 'Assigned employee to manager' });
    } catch (err) {
        res.status(500).json({ error: 'שגיאה בשיוך עובד למנהל' });
    }
});

// Remove an assignment (unassign employee from manager)
app.delete('/api/employee-manager/:employee_id', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_managers'))) return;
    const { employee_id } = req.params;
    try {
        await pool.query(
            `DELETE FROM schedule.employee_manager WHERE employee_id = $1`,
            [employee_id]
        );
        res.json({ message: 'Unassigned employee from manager' });
    } catch {
        res.status(500).json({ error: 'שגיאה בהסרת שיוך עובד' });
    }
});

// List all employees with their manager (name + category)
app.get('/api/employees-with-manager', async (req, res) => {
    if (!(await requirePermission(req, res, 'manager_manage_users'))) return;
    try {
        const q = await pool.query(
            `SELECT u.id AS employee_id, u.full_name AS employee_name,
                    m.id AS manager_id, m.full_name AS manager_name,
                    c.title AS manager_category
             FROM schedule.users u
                      LEFT JOIN schedule.employee_manager em ON em.employee_id = u.id
                      LEFT JOIN schedule.managers m ON em.manager_id = m.id
                      LEFT JOIN schedule.manager_categories c ON m.category_id = c.id
             ORDER BY u.id`
        );
        res.json(q.rows);
    } catch {
        res.status(500).json({ error: 'שגיאה באחזור עובדים עם מנהלים' });
    }
});


// --- Google Login / Logout ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
    || '588713129121-jf63q7kq2v2fkokbimksb6lqhd5263vc.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

app.post('/api/login/google', async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) return res.status(400).json({ error: 'Missing Google credential.' });

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID, // MUST match frontend
        });
        const payload = ticket.getPayload();

        if (!payload?.email) {
            return res.status(401).json({ error: 'Invalid Google token (no email).' });
        }

        // (Optional hardening: issuer/audience check)
        const issOk = payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com';
        const audOk = payload.aud === GOOGLE_CLIENT_ID;
        if (!issOk || !audOk) {
            console.warn('[google-login] bad iss/aud', { iss: payload.iss, aud: payload.aud });
            return res.status(401).json({ error: 'Google token issuer/audience mismatch.' });
        }

        const normalizedEmail = String(payload.email).trim().toLowerCase();
        const userQ = await pool.query(
            `SELECT id, full_name, email, role, status
             FROM schedule.users
             WHERE lower(trim(email)) = $1`,
            [normalizedEmail]
        );

        if (!userQ.rows.length) {
            return res.status(403).json({ error: 'User not found in DB.', email: normalizedEmail });
        }

        const user = userQ.rows[0];
        if (user.role === 'Manager') user.role = 'Admin';
        if (user.role === 'Employee' && user.status !== 'Active') {
            return res.status(403).json({ error: 'Inactive user.' });
        }

        // establish session
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.full_name = user.full_name;

        // await the write to the session store (this is where store problems show up)
        await new Promise((resolve, reject) => {
            req.session.save(err => (err ? reject(err) : resolve()));
        });

        // employee open tracking
        if (user.role === 'Employee') {
            const nextWeek = getNextWeekCodeLocal();
            await pool.query(
                `INSERT INTO schedule.employee_submission_status
                     (week_code, employee_id, opened_at)
                 VALUES ($1, $2, NOW())
                     ON CONFLICT (week_code, employee_id) DO NOTHING`,
                [nextWeek, user.id]
            );
        }

        res.json({ id: user.id, role: user.role, name: user.full_name });
    } catch (err) {
        const msg = String(err?.message || '');
        const looksAuth  = /audience|issuer|jwt|token|expired|invalid/i.test(msg);
        const looksStore = /connect-pg-simple|session|pg|ECONN|timeout/i.test(msg);

        console.error('[login/google] error:', { msg, stack: err?.stack });

        if (looksAuth)  return res.status(401).json({ error: 'Google auth failed.' });
        if (looksStore) return res.status(503).json({ error: 'Session store unavailable.' });
        return res.status(500).json({ error: 'Server error.' });
    }
});


app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: 'לא ניתן היה להתנתק.' });
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// ----------------------------------------------------------------------------
// Catch-All Route (Client-Side Routing)
// ----------------------------------------------------------------------------
/*app.get('*', (req, res, next) => {
    const indexFile = path.join(buildPath, 'index.html');
    res.sendFile(indexFile, (err) => {
        if (err) {
            console.error('Error sending index file:', err);
            next(err);
        }
    });
});*/
// ----------------------------------------------------------------------------
// Start Server
// ----------------------------------------------------------------------------
const port = process.env.PORT || 3001;
app.listen(port, () => {
    console.log(`Backend server running on port ${port}`);
});
