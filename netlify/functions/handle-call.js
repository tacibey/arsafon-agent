// netlify/functions/handle-call.js

const twilio = require('twilio');
const Groq = require('groq-sdk');
const ElevenLabs = require('elevenlabs-node');
const { getStore } = require('@netlify/blobs');

// API İstemcilerini bir kere ve global olarak tanımla
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const elevenlabs = new ElevenLabs({ apiKey: process.env.ELEVENLABS_API_KEY });
const voiceId = 'xyqF3vGMQlPk3e7yA4DI';

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

exports.handler = async function(event, context) {
    const twiml = new twilio.twiml.VoiceResponse();
    const headers = { 'Content-Type': 'text/xml' };
    
    const bodyParams = new URLSearchParams(event.body);
    const queryParams = event.queryStringParameters;

    const callSid = bodyParams.get('CallSid');
    const userInput = bodyParams.get('SpeechResult');
    const encodedPrompt = queryParams.prompt;

    // Eğer temel bilgiler eksikse, güvenli bir şekilde kapat.
    if (!callSid || !encodedPrompt) {
        twiml.say({ language: 'tr-TR' }, 'Kritik bir yapılandırma hatası oluştu. Arama sonlandırılıyor.');
        twiml.hangup();
        return { statusCode: 200, headers, body: twiml.toString() };
    }

    try {
        const { BASE_URL, SITE_ID, NETLIFY_API_TOKEN } = process.env;
        const systemPrompt = Buffer.from(encodedPrompt, 'base64').toString('utf8');

        // Blob Store bağlantısını kur
        const blobConfig = { siteID: SITE_ID, token: NETLIFY_API_TOKEN };
        const transcriptStore = getStore({ name: 'transcripts', ...blobConfig });
        const audioStore = getStore({ name: 'audio-files-arsafon', ...blobConfig });

        // Konuşma geçmişini al veya başlat
        let conversationHistory = await transcriptStore.get(callSid, { type: 'text' }).catch(() => "");
        if (userInput) {
            conversationHistory += `Human: ${userInput}\n`;
        }

        // LLM'e gönderilecek mesajları oluştur
        const messages = [{ role: 'system', content: systemPrompt }];
        conversationHistory.split('\n').filter(Boolean).forEach(line => {
            const [speaker, ...content] = line.split(': ');
            messages.push({ role: speaker.toLowerCase() === 'ai' ? 'assistant' : 'user', content: content.join(': ') });
        });
        
        // AI'dan cevap al
        const chatCompletion = await groq.chat.completions.create({ messages, model: 'llama3-8b-8192', temperature: 0.7 });
        const assistantResponseText = chatCompletion.choices[0]?.message?.content || "Üzgünüm, bir sorun oluştu.";
        
        // Yeni konuşma geçmişini kaydet
        conversationHistory += `AI: ${assistantResponseText}\n`;
        await transcriptStore.set(callSid, conversationHistory);
        
        // Cevabı sese dönüştür ve kaydet
        const audioStream = await elevenlabs.textToSpeechStream({ textInput: assistantResponseText, voiceId, modelId: 'eleven_multilingual_v2' });
        const audioBuffer = await streamToBuffer(audioStream);
        const audioKey = `${callSid}-${Date.now()}.mp3`;
        await audioStore.set(audioKey, audioBuffer);
        
        // TwiML oluştur: Sesi çal ve yeni girdi bekle
        const audioUrl = `${BASE_URL}/.netlify/functions/serve-audio?key=${audioKey}`;
        twiml.play({}, audioUrl);

        const gather = twiml.gather({
            input: 'speech',
            speechTimeout: 'auto',
            timeout: 4,
            language: 'tr-TR',
            // DÖNGÜ: Bir sonraki adım için yine KENDİSİNİ çağır.
            action: `/.netlify/functions/handle-call?prompt=${encodedPrompt}`,
            method: 'POST'
        });

        // Gather zaman aşımına uğrarsa
        gather.say({ language: 'tr-TR' }, "Hatta birini duyamadım. Görüşmeyi sonlandırıyorum.");
        twiml.hangup();

    } catch (error) {
        console.error(`handle-call Hatası (CallSid: ${callSid}):`, error);
        twiml.say({ language: 'tr-TR' }, "Beklenmedik bir sistem hatası oluştu. Üzgünüm, hoşçakalın.");
        twiml.hangup();
    }
    
    // Twilio'ya HER KOŞULDA geçerli bir XML cevabı dön.
    return {
        statusCode: 200,
        headers: headers,
        body: twiml.toString()
    };
};
