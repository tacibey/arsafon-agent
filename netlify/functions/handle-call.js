// netlify/functions/handle-call.js

const twilio = require('twilio');

exports.handler = async function(event, context) {
    const twiml = new twilio.twiml.VoiceResponse();
    const headers = { 'Content-Type': 'text/xml' };
    
    // --- TEŞHİS ADIMI ---
    // Fonksiyonun hangi ortam değişkenlerini gördüğünü loglayalım.
    // Bu, sorunun kaynağını bize KESİN olarak gösterecek.
    console.log("--- ORTAM DEĞİŞKENLERİ KONTROLÜ ---");
    console.log("process.env.SITE_ID:", process.env.SITE_ID);
    console.log("process.env.NETLIFY_API_TOKEN:", process.env.NETLIFY_API_TOKEN);
    console.log("process.env.GROQ_API_KEY:", process.env.GROQ_API_KEY ? 'Mevcut' : 'Mevcut DEĞİL');
    console.log("------------------------------------");

    const bodyParams = new URLSearchParams(event.body);
    const callSid = bodyParams.get('CallSid');

    // Bu teşhis adımında, hata vermesi normaldir.
    // Tek amacımız yukarıdaki logları görmektir.
    try {
        const { SITE_ID, NETLIFY_API_TOKEN } = process.env;

        // Kodun hata vermesini ve logları oluşturmasını bekliyoruz.
        if (!SITE_ID || !NETLIFY_API_TOKEN) {
            // Bu hata mesajını bilerek oluşturuyoruz ki logları görebilelim.
            throw new Error("SITE_ID veya NETLIFY_API_TOKEN ortam değişkenleri bulunamadı!");
        }
        
        // Bu kısım muhtemelen çalışmayacak, önemli değil.
        twiml.say({ language: 'tr-TR' }, 'Sistem teşhis modunda.');
        twiml.hangup();

    } catch (error) {
        // Hata mesajını konsola yazdır.
        console.error(`handle-call Hatası (CallSid: ${callSid}):`, error);
        
        // Twilio'ya hata olduğunu söyle.
        twiml.say({ language: 'tr-TR' }, "Sistemde bir yapılandırma hatası tespit edildi. Lütfen logları kontrol edin.");
        twiml.hangup();
    }
    
    return {
        statusCode: 200,
        headers: headers,
        body: twiml.toString()
    };
};
