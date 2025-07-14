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
            body: JSON.stringify({ error: "Ortam değişkenleri eksik. Lütfen Netlify ayarlarını kontrol edin." }) 
        };
    }

    const client = twilio(accountSid, authToken);

    try {
        const encodedPrompt = Buffer.from(prompt).toString('base64');
        
        // --- NİHAİ DÜZELTME ---
        // Artık URL'e manuel hiçbir şey eklemiyoruz. Twilio,
        // CallSid'yi kendisi otomatik olarak ekleyecektir.
        const initialUrl = `${baseUrl}/.netlify/functions/handle-call?prompt=${encodedPrompt}&first=true`;

        const call = await client.calls.create({
            url: initialUrl, // Sadece bu basit URL'i kullan
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
