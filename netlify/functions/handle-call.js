// netlify/functions/handle-call.js

const twilio = require('twilio');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.handler = async function(event, context) {
    const twiml = new twilio.twiml.VoiceResponse();
    const headers = { 'Content-Type': 'text/xml' };

    const queryParams = event.queryStringParameters;
    const userInput = new URLSearchParams(event.body).get('SpeechResult');
    
    const conversation = queryParams.convo ? JSON.parse(Buffer.from(queryParams.convo, 'base64').toString()) : [];
    
    if (userInput) {
        conversation.push({ role: 'user', content: userInput });
    }

    const systemPrompt = Buffer.from(queryParams.prompt, 'base64').toString('utf8');
    const messages = [{ role: 'system', content: systemPrompt }, ...conversation];

    try {
        const chatCompletion = await groq.chat.completions.create({ messages, model: 'llama3-8b-8192' });
        const assistantResponseText = chatCompletion.choices[0]?.message?.content || "Üzgünüm, bir sorun oluştu.";
        
        conversation.push({ role: 'assistant', content: assistantResponseText });
        
        // --- DEĞİŞİKLİK BURADA ---
        // Sesi doğrudan çalmak yerine, ses üretecek olan fonksiyona yönlendiriyoruz.
        const textToSpeakEncoded = Buffer.from(assistantResponseText).toString('base64');
        const audioUrl = `/.netlify/functions/generate-audio?text=${textToSpeakEncoded}`;
        twiml.play({}, audioUrl);
        // --- DEĞİŞİKLİK BİTTİ ---

        const nextConvo = Buffer.from(JSON.stringify(conversation)).toString('base64');
        const actionUrl = `/.netlify/functions/handle-call?prompt=${queryParams.prompt}&convo=${nextConvo}`;

        const gather = twiml.gather({
            input: 'speech', speechTimeout: 'auto', timeout: 4, language: 'tr-TR',
            action: actionUrl, method: 'POST'
        });

        twiml.say({ voice: 'Polly.Filiz', language: 'tr-TR' }, "Görüşmek üzere, hoşçakalın.");
        twiml.hangup();

    } catch (error) {
        console.error("handle-call Hatası:", error);
        twiml.say({ voice: 'Polly.Filiz', language: 'tr-TR' }, "Sistemde bir hata oluştu, üzgünüm.");
        twiml.hangup();
    }
    
    return { statusCode: 200, headers: body: twiml.toString() };
};
