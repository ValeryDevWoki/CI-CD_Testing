require('dotenv').config();
const nodemailer = require('nodemailer');

/**
 * Sends an email using environment-based credentials.
 * No built-in templates; pass the subject and message from your own logic/DB.
 *
 * @param {string} to - Recipient email address
 * @param {string} subject - Subject line
 * @param {string} message - The email body (HTML or text)
 */
async function sendEmail(to, subject, message) {
    console.log('[emailService] sendEmail() called with:');
    console.log('[emailService]  to:', to);
    console.log('[emailService]  subject:', subject);
    console.log('[emailService]  message:', message);

    // 1) Read credentials from .env
    const mainGmailUser = process.env.MAIN_GMAIL_USER; // e.g. 'myprimary@gmail.com'
    const mainGmailPass = process.env.MAIN_GMAIL_PASS; // e.g. '16-char-app-password'
    const aliasFrom = process.env.GMAIL_ALIAS_FROM;    // e.g. 'My Name <alias@mydomain.com>'

    // For debugging
    console.log('[emailService] Using MAIN_GMAIL_USER:', mainGmailUser);
    console.log('[emailService] Using aliasFrom:', aliasFrom);

    // 2) Create a Nodemailer transporter
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: mainGmailUser,
            pass: mainGmailPass,
        },
    });

    // 3) Build mail options
    const mailOptions = {
        from: aliasFrom,
        to,
        subject,
        // If you only want plain text, switch to `text: message`.
        // If you want HTML formatting, use `html: message`.
        // You can also differentiate if needed.
        html: message,
    };

    // 4) Send the email and handle errors
    try {
        console.log('[emailService] About to send email...');
        const info = await transporter.sendMail(mailOptions);
        console.log('[emailService] Email sent:', info.response);
    } catch (err) {
        console.error('[emailService] Error sending email:', err);
        throw err;
    }
}

module.exports = {
    sendEmail,
};
