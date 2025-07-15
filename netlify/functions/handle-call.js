// netlify/functions/handle-call.js

const twilio = require('twilio');
const Groq = require('groq-sdk');
const ElevenLabsNode = require('elevenlabs-node');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const elevenlabs = new ElevenLabsNode({ apiKey: process.env.ELEVENLABS_API_KEY });
const voiceId = 'xyqF3vGMQlPk3e7yA4DI'; // Cansu sesinin ID'si (veya kullandığınız ses)

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
        // --- SİZİN VERDİĞİNİZ BİLGİLERLE GÜNCELLEME ---
        const chatCompletion = await groq.chat.completions.create({
            messages: messages,
            model: "gemma2-9b-it", // 1. YENİ VE DOĞRU MODEL
            temperature: 0.3, // 2. Senaryoya sadık kalması için yaratıcılığı düşürüyoruz
            max_tokens: 256, // 3. Cevaplar kısa olacağı için 256 yeterli
            top_p: 1,
            stream: false // 4. Cevabın tamamını tek seferde alıyoruz
        });
        // --- GÜNCELLEME BİTTİ ---

        const assistantResponseText = chatCompletion.choices[0]?.message?.content || "Üzgünüm, bir sorun oluştu.";
        conversation.push({ role: 'assistant', content: assistantResponseText });

        const textToSpeakEncoded = Buffer.from(assistantResponseText).toString('base64');
        const audioUrl = `/.netlify/functions/generate-audio?text=${textToSpeakEncoded}`;
        twiml.play({}, audioUrl);

        const nextConvo = Buffer.from(JSON.stringify(conversation)).toString('base64');
        const actionUrl = `/.netlify/functions/handle-call?prompt=${queryParams.prompt}&convo=${nextConvo}`;

        const gather = twiml.gather({
            input: 'speech', speechTimeout: 'auto', timeout: 4, language: 'tr-TR',
            action: actionUrl, method: 'POST'
        });

        twiml.hangup();

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
