require('dotenv').config();
const axios = require('axios');

/**
 * Simple delay function (ms in milliseconds)
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Normalize an Israeli phone number:
 * - "0545555555" → "+972545555555"
 * - "+972545555555" → "+972545555555"
 * - "972545555555" → "+972545555555"
 */
function normalizePhone(phone) {
    let p = phone.trim();
    // strip any leading '+'
    if (p.startsWith('+')) {
        p = p.slice(1);
    }
    // if local leading zero, convert to country code
    if (p.startsWith('0')) {
        p = '972' + p.slice(1);
    }
    return '+' + p;
}

// Pulseem configuration (from your .env)
const PULSEEM_ENDPOINT    = process.env.PULSEEM_ENDPOINT;
const PULSEEM_API_TOKEN   = process.env.PULSEEM_API_TOKEN;
const PULSEEM_SENDER_NAME = process.env.PULSEEM_SENDER_NAME;

/**
 * Low-level SMS send via Pulseem.
 *
 * @param {string} rawPhone  e.g. "0545555555" or "+972545555555"
 * @param {string} message   Plain-text SMS content
 */
async function _sendSms(rawPhone, message) {
    const phoneNumber = normalizePhone(rawPhone);
    console.log('[smsService] _sendSms() →', { phoneNumber, message });

    // Build a unique sendId including the cleaned phone (<=50 chars)
    const cleanPhone = phoneNumber.replace(/\D+/g, '');
    const sendId     = `sms-${cleanPhone}-${Date.now()}`;

    // Pulseem payload
    const payload = {
        sendId,
        isAsync: false,
        smsSendData: {
            fromNumber:    PULSEEM_SENDER_NAME,
            toNumberList:  [ phoneNumber ],
            referenceList: [ `${sendId}-0` ],
            textList:      [ message ]
        }
    };

    try {
        const response = await axios.post(
            PULSEEM_ENDPOINT,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'APIKey':        PULSEEM_API_TOKEN
                }
            }
        );
        console.log('[smsService] Pulseem response:', response.data);
    } catch (err) {
        console.error(
            '[smsService] Pulseem SMS error:',
            err.response?.status,
            err.response?.data || err.message
        );
        throw err;
    }
}

/**
 * In-memory queue to handle SMS sending sequentially.
 */
const smsQueue = [];
let processingQueue = false;

/**
 * Processes the SMS queue one by one.
 */
async function processSmsQueue() {
    if (processingQueue) return;
    processingQueue = true;

    while (smsQueue.length > 0) {
        const { phoneNumber, message, resolve, reject } = smsQueue.shift();
        try {
            await _sendSms(phoneNumber, message);

            // Wait for configured delay (default 5000ms)
            const delayMs = process.env.SMS_DELAY
                ? parseInt(process.env.SMS_DELAY, 10)
                : 5000;
            await delay(delayMs);

            resolve();
        } catch (err) {
            reject(err);
        }
    }

    processingQueue = false;
}

/**
 * Public API: queue an SMS. Returns a Promise that resolves when sent.
 *
 * @param {string} phoneNumber
 * @param {string} message
 * @returns {Promise<void>}
 */
function sendSms(phoneNumber, message) {
    return new Promise((resolve, reject) => {
        smsQueue.push({ phoneNumber, message, resolve, reject });
        processSmsQueue();
    });
}

module.exports = {
    sendSms,
};
