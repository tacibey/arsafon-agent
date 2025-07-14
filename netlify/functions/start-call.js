const twilio = require('twilio');

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { to, prompt } = JSON.parse(event.body);
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    const baseUrl = process.env.BASE_URL;

    if (!to || !prompt || !accountSid || !authToken || !twilioPhoneNumber || !baseUrl) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Gerekli ortam değişkenleri veya parametreler eksik." }) 
        };
    }

    const client = twilio(accountSid, authToken);

    try {
        const encodedPrompt = Buffer.from(prompt).toString('base64');
        const call = await client.calls.create({
            url: `${baseUrl}/.netlify/functions/handle-call?prompt=${encodedPrompt}&first=true`,
            to: to,
            from: twilioPhoneNumber,
            statusCallback: `${baseUrl}/.netlify/functions/log-call`,
            statusCallbackMethod: 'POST',
            statusCallbackEvent: ['completed'],
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ sid: call.sid }),
        };
    } catch (error) {
        console.error("Twilio API Hatası:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
