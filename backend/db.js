// db.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT
});

/**
 * initDB: create "schedule" schema and all necessary tables if they don't exist
 */
async function initDB() {
    try {
        // 1) Ensure the schema
        await pool.query(`CREATE SCHEMA IF NOT EXISTS schedule;`);

        // 2) Employees
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schedule.employees (
                                                              id SERIAL PRIMARY KEY,
                                                              name TEXT NOT NULL,
                                                              role TEXT NOT NULL,
                                                              max_hours INT,
                                                              max_days INT
            );
        `);

        // 3) Users
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schedule.users (
                                                          id SERIAL PRIMARY KEY,
                                                          full_name TEXT NOT NULL,
                                                          email TEXT UNIQUE NOT NULL,
                                                          phone TEXT,
                                                          role TEXT NOT NULL,
                                                          status TEXT,
                                                          groups TEXT[]
            );
        `);

        // 4) Shifts (includes issent, ispublished by default)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schedule.shifts (
                                                           id SERIAL PRIMARY KEY,
                                                           week_code TEXT NOT NULL,
                                                           day_name TEXT NOT NULL,
                                                           employee_id INT NOT NULL,
                                                           start_time TEXT NOT NULL,
                                                           end_time TEXT NOT NULL,
                                                           note TEXT,
                                                           issent BOOLEAN DEFAULT false,
                                                           ispublished BOOLEAN DEFAULT false,
                                                           CONSTRAINT fk_employee
                                                           FOREIGN KEY (employee_id) REFERENCES schedule.employees(id)
                ON DELETE CASCADE
                );
        `);

        // 5) Blockers
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schedule.blockers (
                                                             id SERIAL PRIMARY KEY,
                                                             type VARCHAR(10) NOT NULL,     -- 'weekly' or 'date'
                day_name VARCHAR(20),
                date DATE,
                start_time VARCHAR(5) NOT NULL,
                end_time VARCHAR(5) NOT NULL,
                reason TEXT
                );
        `);

        // 6) Wanted
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schedule.wanted (
                                                           id SERIAL PRIMARY KEY,
                                                           week_code TEXT NOT NULL,
                                                           day_name TEXT NOT NULL,
                                                           hour INT NOT NULL,
                                                           wanted_count INT NOT NULL
            );
        `);

        // 7) Notes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schedule.notes (
                                                          id SERIAL PRIMARY KEY,
                                                          employee_id INT NOT NULL,
                                                          date TEXT NOT NULL,
                                                          note TEXT,
                                                          status TEXT,
                                                          decision TEXT,
                                                          CONSTRAINT fk_employee2
                                                          FOREIGN KEY (employee_id) REFERENCES schedule.employees(id)
                ON DELETE CASCADE
                );
        `);

        // 8) week_status
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schedule.week_status (
                                                                week_code TEXT PRIMARY KEY,
                                                                is_published BOOLEAN DEFAULT false,
                                                                status_changed_at TIMESTAMP
            );
        `);

        // 9) wanted_total
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schedule.wanted_total (
                id SERIAL PRIMARY KEY,
                week_code TEXT NOT NULL,
                day_name VARCHAR(20) NOT NULL,
                wanted_count INTEGER NOT NULL DEFAULT 0,
                UNIQUE(week_code, day_name)
            );
        `);

        // 10) shifts_static
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schedule.shifts_static (
                                                                  id SERIAL PRIMARY KEY,
                                                                  day_name TEXT NOT NULL,
                                                                  employee_id INT NOT NULL,
                                                                  start_time TEXT NOT NULL,
                                                                  end_time TEXT NOT NULL,
                                                                  isactive BOOLEAN NOT NULL DEFAULT true
            );
        `);

        // 11) employee_submission_status (no arrival_status)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schedule.employee_submission_status (
                                                                               id SERIAL PRIMARY KEY,
                                                                               week_code TEXT NOT NULL,
                                                                               employee_id INT NOT NULL REFERENCES schedule.employees(id) ON DELETE CASCADE,
                opened_at TIMESTAMP,
                registered_at TIMESTAMP,
                submitted_at TIMESTAMP,
                UNIQUE (week_code, employee_id)
                );
        `);

        console.log("DB init: schedule schema & tables ensured.");
    } catch (err) {
        console.error("Error in initDB:", err);
        throw err; // re-throw
    }
}

module.exports = {
    pool,
    initDB
};
