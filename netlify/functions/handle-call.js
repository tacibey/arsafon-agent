// netlify/functions/handle-call.js

const twilio = require('twilio');

exports.handler = async function(event, context) {
    const twiml = new twilio.twiml.VoiceResponse();
    const bodyParams = new URLSearchParams(event.body);
    const queryParams = event.queryStringParameters;

    const userInput = bodyParams.get('SpeechResult');
    const encodedPrompt = queryParams.prompt;
    const callSid = bodyParams.get('CallSid');

    // Eğer kullanıcı bir şey söylediyse, bu bilgiyi bir sonraki adıma taşı.
    if (userInput) {
        // "Bir saniye, cevabınızı hazırlıyorum..." gibi bir sesle anında yanıt ver.
        // Bu, Twilio'nun timeout'a girmesini engeller.
        twiml.say({ language: 'tr-TR' }, 'Bir saniye...');

        // Ağır işleri yapacak olan yeni fonksiyona yönlendir.
        // Kullanıcının ne söylediğini ve sistem promptunu URL'de taşıyoruz.
        const redirectUrl = `/.netlify/functions/process-and-respond?prompt=${encodedPrompt}&userInput=${encodeURIComponent(userInput)}`;
        twiml.redirect({ method: 'POST' }, redirectUrl);

    } else {
        // Bu, aramanın ilk anı veya kullanıcının sessiz kaldığı an.
        // Sadece ağır işleri yapacak olan fonksiyona yönlendir.
        const redirectUrl = `/.netlify/functions/process-and-respond?prompt=${encodedPrompt}`;
        twiml.redirect({ method: 'POST' }, redirectUrl);
    }

    // Twilio'ya anında ve geçerli bir TwiML ile cevap ver.
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: twiml.toString()
    };
};
