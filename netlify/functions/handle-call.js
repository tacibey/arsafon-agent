// netlify/functions/handle-call.js

const twilio = require('twilio');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.handler = async function(event, context) {
    const twiml = new twilio.twiml.VoiceResponse();
    const headers = { 'Content-Type': 'text/xml' };

    const queryParams = event.queryStringParameters;
    const userInput = new URLSearchParams(event.body).get('SpeechResult');
    
    // Konuşma geçmişini URL'den al veya başlat
    const conversation = queryParams.convo ? JSON.parse(Buffer.from(queryParams.convo, 'base64').toString()) : [];
    
    if (userInput) {
        conversation.push({ role: 'user', content: userInput });
    }

    const systemPrompt = Buffer.from(queryParams.prompt, 'base64').toString('utf8');
    const messages = [{ role: 'system', content: systemPrompt }, ...conversation];

    try {
        const chatCompletion = await groq.chat.completions.create({ messages, model: 'llama3-8b-8192' });
        const assistantResponseText = chatCompletion.choices[0]?.message?.content || "Üzgünüm, bir sorun oluştu.";
        
        // AI'ın cevabını konuşma geçmişine ekle
        conversation.push({ role: 'assistant', content: assistantResponseText });
        
        // Twilio'nun kendi sesini kullanarak konuş. Bu en sağlam yöntemdir.
        twiml.say({ voice: 'Polly.Filiz', language: 'tr-TR' }, assistantResponseText);

        // Yeni konuşma geçmişini URL'de taşımak için kodla
        const nextConvo = Buffer.from(JSON.stringify(conversation)).toString('base64');
        const actionUrl = `/.netlify/functions/handle-call?prompt=${queryParams.prompt}&convo=${nextConvo}`;

        const gather = twiml.gather({
            input: 'speech',
            speechTimeout: 'auto',
            timeout: 4,
            language: 'tr-TR',
            action: actionUrl,
            method: 'POST'
        });

        // Kullanıcı cevap vermezse
        twiml.say({ voice: 'Polly.Filiz', language: 'tr-TR' }, "Görüşmek üzere, hoşçakalın.");
        twiml.hangup();

    } catch (error) {
        console.error("handle-call Hatası:", error);
        twiml.say({ voice: 'Polly.Filiz', language: 'tr-TR' }, "Sistemde bir hata oluştu, üzgünüm.");
        twiml.hangup();
    }
    
    return { statusCode: 200, headers: headers, body: twiml.toString() };
};
