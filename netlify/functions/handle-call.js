const twilio = require('twilio');
const Groq = require('groq-sdk');
const ElevenLabs = require('elevenlabs-node');
const { getStore } = require('@netlify/blobs');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const elevenlabs = new ElevenLabs({ apiKey: process.env.ELEVENLABS_API_KEY });
const voiceId = 'xyqF3vGMQlPk3e7yA4DI';

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        if (!stream || typeof stream.on !== 'function') {
            return reject(new TypeError('Verilen stream nesnesi geçersiz.'));
        }
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

exports.handler = async function(event, context) {
    const response = new twilio.twiml.VoiceResponse();
    const bodyParams = new URLSearchParams(event.body);
    const callSid = bodyParams.get('CallSid');
    const queryParams = event.queryStringParameters;
    const baseUrl = process.env.BASE_URL;

    if (!baseUrl || !callSid) {
        console.error(`Kritik Hata: BASE_URL (${baseUrl}) veya CallSid (${callSid}) eksik!`);
        response.say({ language: 'tr-TR' }, "Kritik bir yapılandırma hatası oluştu.");
        response.hangup();
        return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: response.toString() };
    }

    try {
        const storeConfig = {
            siteID: process.env.NETLIFY_SITE_ID,
            token: process.env.NETLIFY_AUTH_TOKEN
        };
        const audioStore = getStore({ name: 'audio-files-arsafon', ...storeConfig });
        const transcriptStore = getStore({ name: 'transcripts', ...storeConfig });

        const firstInteraction = queryParams.first === 'true';
        const encodedPrompt = queryParams.prompt;
        const systemPrompt = Buffer.from(encodedPrompt, 'base64').toString('utf8');
        let conversationHistory = queryParams.convo ? decodeURIComponent(queryParams.convo) : "";
        const userInput = bodyParams.get('SpeechResult');
        let assistantResponseText;

        if (firstInteraction) {
            assistantResponseText = "Merhaba, ben yapay zeka asistanı Volkan, Arsafon'dan arıyorum, müsait miydiniz?";
        } else {
             if (userInput) { conversationHistory += `Human: ${userInput}\n`; }
            const messages = [ { role: 'system', content: systemPrompt }, ...conversationHistory.split('\n').filter(line => line.trim() !== '').map(line => { const [speaker, ...content] = line.split(': '); return { role: speaker.toLowerCase() === 'ai' ? 'assistant' : 'user', content: content.join(': ') }; }) ];
            const chatCompletion = await groq.chat.completions.create({ messages: messages, model: 'llama3-8b-8192' });
            assistantResponseText = chatCompletion.choices[0]?.message?.content || "Üzgünüm, bir sorun oluştu.";
        }

        conversationHistory += `AI: ${assistantResponseText}\n`;
        await transcriptStore.set(callSid, conversationHistory);

        const audioStream = await elevenlabs.textToSpeechStream({ textInput: assistantResponseText, voiceId: voiceId, modelId: 'eleven_multilingual_v2' });
        const audioBuffer = await streamToBuffer(audioStream);
        const audioKey = `${callSid}-${Date.now()}.mp3`; // Tekrarlanan isteklerde çakışmayı önle
        await audioStore.set(audioKey, audioBuffer);
        
        // YENİ VE DOĞRU YÖNTEM: Kendi dosya sunucu fonksiyonumuzu çağır
        const audioUrl = `${baseUrl}/.netlify/functions/serve-audio?key=${audioKey}`;
        response.play({}, audioUrl);

        const nextActionUrl = `/.netlify/functions/handle-call?prompt=${encodedPrompt}&first=false&convo=${encodeURIComponent(conversationHistory)}`;
        response.gather({ input: 'speech', speechTimeout: 'auto', timeout: 4, action: nextActionUrl, language: 'tr-TR' });

        response.say({ language: 'tr-TR' }, "Görüşmek üzere, hoşçakalın.");
        response.hangup();

    } catch (error) {
        console.error(`Hata (CallSid: ${callSid}):`, error);
        response.say({ language: 'tr-TR' }, "Üzgünüm, bir sistem hatası oluştu. Lütfen daha sonra tekrar deneyin.");
        response.hangup();
    }

    return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: response.toString() };
};
