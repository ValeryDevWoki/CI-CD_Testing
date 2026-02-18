const nodemailer = require('nodemailer');

// 1) Create a transporter object using your main Gmail or Google Workspace account
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        // Important: this is your *primary* Gmail address, not the alias
        user: 'verify@woki.co.il',
        // If 2-Step Verification is on, use the 16-char App Password here
        pass: 'nggp tcgm lqjg zrfy'
    }
});

// 2) Set the From address to your *alias*
const mailOptions = {
    from: 'Yardena <yardena@woki.co.il>',  // <--- your alias
    to: 'dev@woki.co.il',
    subject: 'המשמרות שלך לשבוע הקרוב!',
    text: 'Hello from my Gmail alias using Node.js + SMTP!'
};

// 3) Send the email
transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        return console.error('Error sending email:', error);
    }
    console.log('Email sent:', info.response);
});
