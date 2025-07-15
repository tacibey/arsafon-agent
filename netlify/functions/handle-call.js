// netlify/functions/handle-call.js

const twilio = require('twilio');
const Groq = require('groq-sdk');

// --- HATA 1: BU SATIRLARI EKLEMEYİ UNUTMUŞUM ---
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// --- HATA 1 DÜZELTİLDİ ---

const responseMap = {
    GREETING: "Merhaba, ismim Cansu, satılık arsanız için aramıştım. Müsait miydiniz?",
    ASK_DETAILS: "Arsanız acil mi satılık ve pazarlık payınız var mıdır?",
    PROPOSE_MEETING: "Anlıyorum. Biz Arsafon olarak arsanızla ilgileniyoruz. Müsaitseniz yarın gayrimenkul danışmanı arkadaşım sizi arayıp detayları paylaşsın. Olur mu?",
    CLOSING: "Teşekkürler, iyi günler dilerim görüşmek üzere.",
    FALLBACK: "Bu detayı bilmiyorum ama yarın arayacak olan arkadaşım tüm sorularınızı yanıtlayacaktır."
};

exports.handler = async function(event, context) {
    // --- HATA 2: BU SATIRLARI EKLEMEYİ UNUTMUŞUM ---
    const twiml = new twilio.twiml.VoiceResponse();
    const headers = { 'Content-Type': 'text/xml' };

    const queryParams = event.queryStringParameters;
    const userInput = new URLSearchParams(event.body).get('SpeechResult');
    const conversation = queryParams.convo ? JSON.parse(Buffer.from(queryParams.convo, 'base64').toString()) : [];
    // --- HATA 2 DÜZELTİLDİ ---

    if (userInput) {
        conversation.push({ role: 'user', content: userInput });
    }

    const systemPrompt = Buffer.from(queryParams.prompt, 'base64').toString('utf8');
    const messages = [{ role: 'system', content: systemPrompt }, ...conversation];

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages,
            model: 'mistral-saba-24b', // Veya 'llama3-70b-8192' daha iyi sonuç verirse
            temperature: 0,
            top_p: 0.1,
            max_tokens: 15
        });
        
        const responseKey = chatCompletion.choices[0]?.message?.content.trim() || 'FALLBACK';
        const assistantResponseText = responseMap[responseKey] || responseMap['FALLBACK'];
        
        conversation.push({ role: 'assistant', content: assistantResponseText });

        const textToSpeakEncoded = Buffer.from(assistantResponseText).toString('base64');
        const audioUrl = `/.netlify/functions/generate-audio?text=${textToSpeakEncoded}`;
        twiml.play({}, audioUrl);

        const nextConvo = Buffer.from(JSON.stringify(conversation)).toString('base64');
        const actionUrl = `/.netlify/functions/handle-call?prompt=${queryParams.prompt}&convo=${nextConvo}`;

        if (responseKey === 'CLOSING') {
            twiml.hangup();
        } else {
            const gather = twiml.gather({
                input: 'speech', speechTimeout: 'auto', timeout: 4, language: 'tr-TR',
                action: actionUrl, method: 'POST'
            });
            twiml.hangup();
        }

    } catch (error) {
        console.error("handle-call Hatası:", error);
        twiml.say({ voice: 'Polly.Filiz', language: 'tr-TR' }, "Sistemde bir hata oluştu.");
        twiml.hangup();
    }
    
    return {
        statusCode: 200,
        headers: headers,
        body: twiml.toString()
    };
};
