// __tests__/publishNotifications.int.test.js
//
// ✅ Safe for shared/dev DB:
// - No TRUNCATE
// - No UPSERT updates (only DO NOTHING)
// - Uses unique user/template IDs per run
// - Uses a VALID week_code (YYYY-W##) that is confirmed UNUSED in DB before test
// - Cleanup deletes ONLY rows that were actually inserted by this run

jest.mock('../smsService', () => ({
  sendSms: jest.fn().mockResolvedValue(true),
}));

jest.mock('../emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));

const request = require('supertest');
const { app, pool, bootstrap, loadUserNotifyCols, USER_NOTIFY_COLS } = require('../server-test');
const { sendSms } = require('../smsService');
const { sendEmail } = require('../emailService');

function waitFor(fn, { timeoutMs = 5000, intervalMs = 50 } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fn();
        if (res) return resolve(true);
      } catch {}
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timeout'));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function randomInt(min, maxInclusive) {
  return Math.floor(Math.random() * (maxInclusive - min + 1)) + min;
}

/**
 * Picks a VALID week_code (YYYY-W##) that does NOT exist in:
 * - schedule.week_status
 * - schedule.employee_submission_status
 * - schedule.shifts
 *
 * This prevents cleanup from ever touching "real" data by week_code.
 */
async function pickUnusedWeekCode(pool) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const year = randomInt(2090, 2199);      // keep far future to avoid collisions
    const week = randomInt(1, 53);
    const code = `${year}-W${String(week).padStart(2, '0')}`;

    const r = await pool.query(
      `
      SELECT
        EXISTS(SELECT 1 FROM schedule.week_status WHERE week_code=$1) AS has_week_status,
        EXISTS(SELECT 1 FROM schedule.employee_submission_status WHERE week_code=$1) AS has_emp_status,
        EXISTS(SELECT 1 FROM schedule.shifts WHERE week_code=$1) AS has_shifts
      `,
      [code]
    );

    const x = r.rows && r.rows[0];
    if (x && !x.has_week_status && !x.has_emp_status && !x.has_shifts) {
      return code;
    }
  }
  throw new Error('Could not find an unused week_code after many attempts');
}

describe('Publish -> notifications integration', () => {
  // === Unique IDs per run (your requested approach) ===
  const RUN = Date.now();
  const TEMPLATE_ID = 900000 + (RUN % 100000); // 900000..999999

  // user ids: 910000 + (RUN % 10000) gives base, then + i
  const USER_BASE_ID = 910000 + (RUN % 10000);

  // Shift marker for safest cleanup (delete by marker)
  const SHIFT_NOTE_MARKER = `__jest_publishNotifications__${RUN}`;

  // Week code must be VALID: YYYY-W##
  let TEST_WEEK_CODE;

  const USERS = [
    { id: USER_BASE_ID + 1, full_name: 'Emp With Shift',      role: 'Employee',         status: 'Active',   phone: '0500000001', email: 'e1@test.com', notify_sms: true,  notify_email: true,  notifications_enabled: true,  timezone: 'Asia/Jerusalem' },
    { id: USER_BASE_ID + 2, full_name: 'Emp No Shift',        role: 'Employee',         status: 'Active',   phone: '0500000002', email: 'e2@test.com', notify_sms: true,  notify_email: true,  notifications_enabled: true,  timezone: 'America/New_York' },
    { id: USER_BASE_ID + 3, full_name: 'Emp No Phone',        role: 'Employee',         status: 'Active',   phone: null,         email: 'e3@test.com', notify_sms: true,  notify_email: true,  notifications_enabled: true,  timezone: null },
    { id: USER_BASE_ID + 4, full_name: 'Emp Multi Role',      role: 'Employee,Manager', status: 'Active',   phone: '0500000004', email: 'e4@test.com', notify_sms: true,  notify_email: true,  notifications_enabled: true,  timezone: null },
    { id: USER_BASE_ID + 5, full_name: 'Manager Only',        role: 'Manager',          status: 'Active',   phone: '0500000005', email: 'm1@test.com', notify_sms: true,  notify_email: true,  notifications_enabled: true,  timezone: null },
    { id: USER_BASE_ID + 6, full_name: 'Inactive Employee',   role: 'Employee',         status: 'Inactive', phone: '0500000006', email: 'e6@test.com', notify_sms: true,  notify_email: true,  notifications_enabled: true,  timezone: null },
    { id: USER_BASE_ID + 7, full_name: 'Emp Sms Disabled',    role: 'Employee',         status: 'Active',   phone: '0500000007', email: 'e7@test.com', notify_sms: false, notify_email: true,  notifications_enabled: true,  timezone: null },
    { id: USER_BASE_ID + 8, full_name: 'Emp Global Disabled', role: 'Employee',         status: 'Active',   phone: '0500000008', email: 'e8@test.com', notify_sms: true,  notify_email: true,  notifications_enabled: false, timezone: null },
  ];

  // Track exactly what THIS run inserted, so cleanup never deletes foreign rows.
  const created = {
    template: false,
    users: new Set(),
    shift: false,
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.TEST_BYPASS_PERMS = '1';

    await bootstrap();

    // Ensure notify columns exist (safe: doesn't delete/overwrite data).
    await pool.query(`
      ALTER TABLE schedule.users
      ADD COLUMN IF NOT EXISTS notify_sms boolean,
      ADD COLUMN IF NOT EXISTS notify_email boolean,
      ADD COLUMN IF NOT EXISTS notifications_enabled boolean,
      ADD COLUMN IF NOT EXISTS timezone text
    `);

    USER_NOTIFY_COLS.loaded = false;
    await loadUserNotifyCols();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    created.template = false;
    created.users.clear();
    created.shift = false;

    // Pick a VALID week_code that is confirmed unused in DB
    TEST_WEEK_CODE = await pickUnusedWeekCode(pool);

    // Insert a dedicated test template (unique ID) - no UPDATE of existing rows.
    {
      const r = await pool.query(
        `
        INSERT INTO schedule.templates (id, template_name, template_type, subject, body, opening_text, ending_text)
        VALUES ($1, $2, 'both', 'Shifts Published', 'Hello {{employeeName}}\n{{shifts}}', NULL, NULL)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
        `,
        [TEMPLATE_ID, `Publish template ${RUN}`]
      );
      created.template = r.rowCount === 1;
    }

    // Insert dedicated test users (unique IDs) - no UPDATE of existing rows.
    for (const u of USERS) {
      const r = await pool.query(
        `
        INSERT INTO schedule.users (id, full_name, role, status, phone, email, notify_sms, notify_email, notifications_enabled, timezone)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
        `,
        [u.id, u.full_name, u.role, u.status, u.phone, u.email, u.notify_sms, u.notify_email, u.notifications_enabled, u.timezone]
      );
      if (r.rowCount === 1) created.users.add(u.id);
    }

    // One shift for one employee in the test week (with unique marker for safe cleanup)
    {
      const r = await pool.query(
        `
        INSERT INTO schedule.shifts (week_code, day_name, employee_id, start_time, end_time, note, issent, ispublished)
        VALUES ($1, 'Sunday', $2, '09:00', '17:00', $3, true, false)
        RETURNING employee_id
        `,
        [TEST_WEEK_CODE, USERS[0].id, SHIFT_NOTE_MARKER]
      );
      created.shift = r.rowCount === 1;
    }
  });

  afterEach(async () => {
    // Clean up ONLY the data we inserted/created for this test run.
    // week_* tables: safe because week_code was guaranteed unused before this run.
    try {
      await pool.query(`DELETE FROM schedule.employee_submission_status WHERE week_code = $1`, [TEST_WEEK_CODE]);
    } catch {}

    try {
      await pool.query(`DELETE FROM schedule.week_status WHERE week_code = $1`, [TEST_WEEK_CODE]);
    } catch {}

    // shifts: safest delete by unique marker
    if (created.shift) {
      try {
        await pool.query(`DELETE FROM schedule.shifts WHERE note = $1`, [SHIFT_NOTE_MARKER]);
      } catch {}
    }

    // template: delete only if we actually inserted it
    if (created.template) {
      try {
        await pool.query(`DELETE FROM schedule.templates WHERE id = $1`, [TEMPLATE_ID]);
      } catch {}
    }

    // users: delete only those we actually inserted
    if (created.users.size) {
      const ids = Array.from(created.users);
      try {
        await pool.query(`DELETE FROM schedule.users WHERE id = ANY($1::int[])`, [ids]);
      } catch {}
    }
  });

  test('publish triggers notifications to all eligible employees (including zero shifts)', async () => {
    const res = await request(app)
      .put(`/api/week-status/${TEST_WEEK_CODE}`)
      .send({ is_published: true, templateId: TEMPLATE_ID, changedShiftIds: [] });

    expect(res.status).toBe(202);

    await waitFor(() => sendSms.mock.calls.length === 3, { timeoutMs: 5000 });
    await waitFor(() => sendEmail.mock.calls.length === 5, { timeoutMs: 5000 });

    const smsPhones = sendSms.mock.calls.map(c => c[0]);
    expect(smsPhones).toEqual(expect.arrayContaining(['0500000001', '0500000002', '0500000004']));
    expect(smsPhones).not.toEqual(expect.arrayContaining(['0500000005', '0500000006', '0500000007', '0500000008']));
    expect(smsPhones).not.toEqual(expect.arrayContaining([null]));

    const emailTos = sendEmail.mock.calls.map(c => c[0]);
    expect(emailTos).toEqual(expect.arrayContaining(['e1@test.com', 'e2@test.com', 'e3@test.com', 'e4@test.com', 'e7@test.com']));
    expect(emailTos).not.toEqual(expect.arrayContaining(['m1@test.com', 'e6@test.com', 'e8@test.com']));

    const smsCall102 = sendSms.mock.calls.find(c => c[0] === '0500000002');
    expect(smsCall102).toBeTruthy();
    expect(String(smsCall102[1])).toContain('אין משמרות השבוע');
  });

  afterAll(async () => {
    await pool.end();
  });
});
