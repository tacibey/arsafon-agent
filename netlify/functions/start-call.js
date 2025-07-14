const twilio = require('twilio');

exports.handler = async function(event, context) {
    // Sadece POST isteklerini kabul et
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { to, prompt } = JSON.parse(event.body);

    // Ortam değişkenlerini al
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    // BASE_URL henüz lokalde çalışmayacak ama deploy edince çalışması için kodu ekliyoruz.
    // Lokal test için geçici olarak http://localhost:8888 kullanabilirsiniz.
    const baseUrl = process.env.BASE_URL || 'http://localhost:8888';

    if (!to || !prompt || !accountSid || !authToken || !twilioPhoneNumber) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: "Gerekli ortam değişkenleri veya parametreler eksik." }) 
        };
    }

    const client = twilio(accountSid, authToken);

    try {
        // Prompt'u URL'de güvenli bir şekilde taşımak için Base64 formatına çeviriyoruz.
        const encodedPrompt = Buffer.from(prompt).toString('base64');

        const call = await client.calls.create({
            // Arama cevaplandığında Twilio'nun hangi fonksiyona istek atacağını belirtir.
            // Bu isteğe prompt'u da ekliyoruz.
            url: `${baseUrl}/.netlify/functions/handle-call?prompt=${encodedPrompt}`,
            to: to,
            from: twilioPhoneNumber,
            // Arama bittiğinde ('completed') log-call fonksiyonuna bilgi gönder.
            statusCallback: `${baseUrl}/.netlify/functions/log-call`,
            statusCallbackMethod: 'POST',
            statusCallbackEvent: ['completed'],
            // Twilio'nun konuşmayı yakalaması için gereken ayar (120 saniye timeout)
            machineDetection: 'Enable',
            gather: {
                input: ['speech'],
                timeout: 5, // Kullanıcı konuşmaya başlamazsa 5 saniye bekle
                action: `${baseUrl}/.netlify/functions/handle-call?prompt=${encodedPrompt}&first=false`,
                speechTimeout: 'auto'
            }
        });

        console.log(`Call initiated with SID: ${call.sid}`);
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
