require('dotenv').config();
const { pool } = require('./db');
const { sendEmail } = require('./emailService');
const { sendSms } = require('./smsService');

/**
 * 1) Automatic Reminder Checking:
 *    - Every 60 seconds, we find reminders that are is_active, not sent, and send_at <= NOW().
 *    - Then we send notifications and set is_sent=true.
 */
function scheduleReminderCheck() {
    setInterval(async () => {
        try {
            const remindersQ = await pool.query(`
        SELECT id, week_code, template_id
        FROM schedule.reminders
        WHERE is_active=true
          AND is_sent=false
          AND send_at <= NOW()
      `);
            if (remindersQ.rows.length === 0) return;

            for (const r of remindersQ.rows) {
                // Example: notify all shifts in that week, or you can store shift IDs separately
                const shiftIdsQ = await pool.query(`
          SELECT id
          FROM schedule.shifts
          WHERE week_code=$1
        `, [r.week_code]);
                const shiftIds = shiftIdsQ.rows.map(x => x.id);

                if (shiftIds.length > 0) {
                    await sendNotificationsDirect(shiftIds, r.template_id, 'both');
                }

                // Mark the reminder as sent
                await pool.query(`
          UPDATE schedule.reminders
          SET is_sent=true
          WHERE id=$1
        `, [r.id]);

                console.log(`Auto reminder ${r.id} sent for week ${r.week_code}`);
            }
        } catch (err) {
            console.error('Error in scheduleReminderCheck:', err);
        }
    }, 60_000); // every minute
}

/**
 * 2) sendNotificationsDirect(shiftIds, templateId, channel, [optionalEmployees])
 *    - If shiftIds is not null, we fetch employees from those shifts.
 *    - If optionalEmployees array is provided, we use that list directly.
 *    - Then we load template from DB, build messages, and send via emailService / smsService.
 *    - channel can be 'email', 'sms', or 'both'.
 */
async function sendNotificationsDirect(shiftIds, templateId, channel = 'both', optionalEmployees) {
    // 1) Get the template
    const tplQ = await pool.query(`
    SELECT id, template_name, subject, body, opening_text, ending_text
    FROM schedule.templates
    WHERE id=$1
  `, [templateId]);
    if (tplQ.rows.length === 0) {
        console.log(`Template ${templateId} not found, cannot send notifications.`);
        return;
    }
    const template = tplQ.rows[0];

    // If we have an explicit employees array, use that
    // else gather from shiftIds => employees
    let employees = [];
    if (Array.isArray(optionalEmployees) && optionalEmployees.length > 0) {
        employees = optionalEmployees; // must have {id, name, ...}
    } else if (Array.isArray(shiftIds) && shiftIds.length > 0) {
        // fetch from shifts
        const shiftsQ = await pool.query(`
      SELECT s.id AS shift_id, e.id AS employee_id, e.name AS employee_name
      FROM schedule.shifts s
      JOIN schedule.employees e ON e.id=s.employee_id
      WHERE s.id=ANY($1)
    `, [shiftIds]);
        if (shiftsQ.rows.length === 0) {
            console.log('No shifts found for those IDs.');
            return;
        }
        // group by employee_id
        const empMap = new Map();
        for (const row of shiftsQ.rows) {
            if (!empMap.has(row.employee_id)) {
                empMap.set(row.employee_id, row.employee_name);
            }
        }
        // create employees array of { id, name }
        employees = Array.from(empMap.entries()).map(([id, name]) => ({
            id,
            name
        }));
    } else {
        // nothing to do
        console.log('No shiftIds or employees to send notifications to.');
        return;
    }

    // 2) For each employee, find user record for email/phone
    //    Then build the message from the template and send
    for (const emp of employees) {
        const userQ = await pool.query(`
      SELECT email, phone
      FROM schedule.users
      WHERE full_name=$1
      LIMIT 1
    `, [emp.name]);
        let email = '';
        let phone = '';
        if (userQ.rows.length > 0) {
            email = userQ.rows[0].email || '';
            phone = userQ.rows[0].phone || '';
        }

        // In a real system, you might also gather the shift times to put in the message
        // But let's just do a basic "body" replacement
        let msgBody = template.body || '';
        msgBody = msgBody.replace('{{employeeName}}', emp.name);
        msgBody = msgBody.replace('{{shifts}}', ''); // or build from shift details

        if (template.opening_text) {
            msgBody = template.opening_text + '\n\n' + msgBody;
        }
        if (template.ending_text) {
            msgBody += '\n\n' + template.ending_text;
        }

        // Email subject
        const subject = template.subject || `Shifts for ${emp.name}`;
        const htmlBody = msgBody.replace(/\n/g, '<br>');

        // Send email if channel is 'both' or 'email'
        if ((channel === 'both' || channel === 'email') && email) {
            await sendEmail(email, subject, htmlBody);
        }

        // Send SMS if channel is 'both' or 'sms'
        if ((channel === 'both' || channel === 'sms') && phone) {
            // Typically an SMS is shorter, so we might just do the basic msgBody or truncated
            let smsMsg = template.body || '';
            smsMsg = smsMsg.replace('{{employeeName}}', emp.name);
            smsMsg = smsMsg.replace('{{shifts}}', '');
            await sendSms(phone, smsMsg);
        }
    }
}

module.exports = {
    scheduleReminderCheck,
    sendNotificationsDirect,
};
