// netlify/functions/start-call.js

const twilio = require('twilio');

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { to, prompt } = JSON.parse(event.body);
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, BASE_URL } = process.env;

    if (!to || !prompt || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER || !BASE_URL) {
        return { statusCode: 500, body: JSON.stringify({ error: "Ortam değişkenleri eksik." }) };
    }

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    try {
        const encodedPrompt = Buffer.from(prompt).toString('base64');
        const initialUrl = `${BASE_URL}/.netlify/functions/handle-call?prompt=${encodedPrompt}`;

        const call = await client.calls.create({
            url: initialUrl,
            method: 'POST',
            to: to,
            from: TWILIO_PHONE_NUMBER,
        });

        return { statusCode: 200, body: JSON.stringify({ sid: call.sid }) };
    } catch (error) {
        console.error("Twilio API Hatası:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
