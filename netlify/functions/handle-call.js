// netlify/functions/handle-call.js

const twilio = require('twilio');
const { getStore } = require('@netlify/blobs');

exports.handler = async function(event, context) {
    const twiml = new twilio.twiml.VoiceResponse();
    const bodyParams = new URLSearchParams(event.body);
    const callSid = bodyParams.get('CallSid');
    const userInput = bodyParams.get('SpeechResult');
    
    // Gerekli parametreler olmadan devam etme.
    if (!callSid) {
        twiml.say({ language: 'tr-TR' }, 'Arama kimliği alınamadı, bir hata oluştu.');
        twiml.hangup();
        return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: twiml.toString() };
    }
    
    try {
        // Kullanıcının girdisini veritabanına kaydet.
        const transcriptBlobConfig = { name: "transcripts", siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN };
        const transcriptStore = getStore(transcriptBlobConfig);
        let conversationHistory = await transcriptStore.get(callSid, { type: 'text' }) || "";

        if (userInput && userInput.trim() !== '') {
            conversationHistory += `Human: ${userInput}\n`;
        } else {
            // Kullanıcı bir şey söylemediyse, bunu da kaydedebiliriz veya boş geçebiliriz.
            // Şimdilik boş geçelim.
        }
        await transcriptStore.set(callSid, conversationHistory);

        // Ağır işleri yapacak fonksiyona yönlendir. ARTIK URL'DE PARAMETRE TAŞIMIYORUZ.
        const redirectUrl = `/.netlify/functions/process-and-respond?prompt=${event.queryStringParameters.prompt}`;
        twiml.redirect({ method: 'POST' }, redirectUrl);

    } catch (error) {
        console.error(`handle-call hatası (CallSid: ${callSid}):`, error);
        twiml.say({ language: 'tr-TR' }, 'Veri işlenirken bir hata oluştu. Lütfen tekrar deneyin.');
        twiml.hangup();
    }
    
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: twiml.toString()
    };
};
