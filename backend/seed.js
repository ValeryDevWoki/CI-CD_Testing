// seed.js
require('dotenv').config();
const { pool } = require('./db');
const { allEmployees, users } = require('./mock/mockData');

// The 5 weeks we want to fill: previous, current, +3 future
const WEEK_CODES = ["2025-W-1", "2025-W00", "2025-W01", "2025-W02", "2025-W03"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// We'll assume each day has 14 or 15 "shifts" for coverage. We'll do random hours for "wanted".
const SHIFTSPERDAY = { Sunday: 14, Monday: 15, Tuesday: 15, Wednesday: 14, Thursday: 14, Friday: 14, Saturday: 14 };
const HOURS = 24;

async function seed() {
    try {
        console.log("Seeding DB with random data...");

        // 1) Clear existing data (only for dev/test)
        await pool.query("TRUNCATE TABLE schedule.notes RESTART IDENTITY CASCADE;");
        await pool.query("TRUNCATE TABLE schedule.wanted RESTART IDENTITY CASCADE;");
        await pool.query("TRUNCATE TABLE schedule.shifts RESTART IDENTITY CASCADE;");
        await pool.query("TRUNCATE TABLE schedule.employees RESTART IDENTITY CASCADE;");
        await pool.query("TRUNCATE TABLE schedule.users RESTART IDENTITY CASCADE;");

        // 2) Insert employees from "allEmployees"
        for (const emp of allEmployees) {
            await pool.query(`
        INSERT INTO schedule.employees (name, role, max_hours, max_days)
        VALUES ($1, $2, $3, $4);
      `, [emp.name, emp.role, emp.maxHours, emp.maxDays]);
        }

        // 3) Insert users from "users"
        for (const usr of users) {
            await pool.query(`
                INSERT INTO schedule.users (full_name, email, phone, role, status, groups)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                usr.fullName,
                usr.email,
                usr.phone || '',
                usr.role,
                usr.status || 'Active',
                usr.groups || []
            ]);
        }

        // 4) Generate SHIFT data for each of the 5 weeks
        //    (like you do in front end multi-week coverage)
        // We'll produce 100 shift assignments / week (20 employees * 5 days).
        for (const wcode of WEEK_CODES) {
            // build array of 100 employee IDs
            let assignArr = [];
            allEmployees.forEach(e => {
                for (let i = 0; i < e.maxDays; i++) {
                    assignArr.push(e.id);
                }
            });
            // shuffle
            for (let i = assignArr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i+1));
                [assignArr[i], assignArr[j]] = [assignArr[j], assignArr[i]];
            }

            let idx = 0;
            for (const day of DAYS) {
                const numShifts = SHIFTSPERDAY[day];
                // spacing to not exceed 16:00 as last shift start
                const spacing = (24 - 8) / (numShifts - 1);

                for (let i = 0; i < numShifts; i++) {
                    const empId = assignArr[idx++];
                    // random start time based on spacing
                    const startHour = Math.floor(i * spacing);
                    const endHour = (startHour + (Math.random()<0.5 ? 8 : 9)) % 24;

                    const formatTime = h => (h<10 ? '0'+h : h)+':00';
                    const startTime = formatTime(startHour);
                    const endTime   = formatTime(endHour);

                    await pool.query(`
            INSERT INTO schedule.shifts (week_code, day_name, employee_id, start_time, end_time)
            VALUES ($1, $2, $3, $4, $5);
          `, [wcode, day, empId, startTime, endTime]);
                }
            }
        }

        // 5) Generate WANTED data for each of the 5 weeks
        //    (like your admin dashboard of wanted employees each hour)
        for (const wcode of WEEK_CODES) {
            for (const day of DAYS) {
                for (let hour=0; hour<HOURS; hour++) {
                    // random wanted count between 3 and 10
                    const wantedCount = 3 + Math.floor(Math.random()*8);
                    await pool.query(`
            INSERT INTO schedule.wanted (week_code, day_name, hour, wanted_count)
            VALUES ($1, $2, $3, $4);
          `, [wcode, day, hour, wantedCount]);
                }
            }
        }

        // 6) Insert some NOTES for employees
        //    E.g. random half day requests
        //    We'll just create a few
        const noteInserts = [
            { employeeId: 1, date: '2025-01-06', note: 'Half day request', status: 'pending', decision: 'pending' },
            { employeeId: 2, date: '2025-01-07', note: 'Doctor appointment', status: 'not handled', decision: 'pending' },
            { employeeId: 3, date: '2025-01-10', note: 'Wants shift swap', status: 'handled', decision: 'accepted' },
            { employeeId: 4, date: '2025-01-11', note: 'Full day off request', status: 'not handled', decision: 'pending' }
        ];
        for (const nt of noteInserts) {
            await pool.query(`
        INSERT INTO schedule.notes (employee_id, date, note, status, decision)
        VALUES ($1, $2, $3, $4, $5);
      `, [nt.employeeId, nt.date, nt.note, nt.status, nt.decision]);
        }

        console.log("Seeding complete!");
        process.exit(0);
    } catch(err) {
        console.error("Error seeding DB:", err);
        process.exit(1);
    }
}

seed();
