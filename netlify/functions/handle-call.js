// netlify/functions/handle-call.js

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
        if (!stream || typeof stream.on !== 'function') { return reject(new TypeError('Geçersiz stream nesnesi.')); }
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

exports.handler = async function(event, context) {
    const twiml = new twilio.twiml.VoiceResponse();
    const bodyParams = new URLSearchParams(event.body);
    const callSid = bodyParams.get('CallSid');
    const queryParams = event.queryStringParameters;
    const baseUrl = process.env.BASE_URL;
    
    // --- KRİTİK DÜZELTME: BLOBS BAĞLANTI BİLGİLERİ ---
    const blobConfig = {
        name: "audio-files-arsafon",
        siteID: process.env.SITE_ID,
        token: process.env.NETLIFY_API_TOKEN
    };
    const transcriptBlobConfig = {
        ...blobConfig,
        name: "transcripts"
    };

    if (!baseUrl || !callSid || !process.env.GROQ_API_KEY || !process.env.ELEVENLABS_API_KEY || !blobConfig.siteID || !blobConfig.token) {
        console.error('Kritik yapılandırma hatası: Ortam değişkenleri eksik (SITE_ID, NETLIFY_API_TOKEN dahil).', { callSid });
        twiml.say({ language: 'tr-TR' }, "Sistemde bir yapılandırma hatası mevcut. Lütfen yönetici ile iletişime geçin.");
        twiml.hangup();
        return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: twiml.toString() };
    }

    try {
        const audioStore = getStore(blobConfig);
        const transcriptStore = getStore(transcriptBlobConfig);

        const encodedPrompt = queryParams.prompt;
        const systemPrompt = Buffer.from(encodedPrompt, 'base64').toString('utf8');
        
        let conversationHistory = await transcriptStore.get(callSid, { type: 'text' }) || "";
        const userInput = bodyParams.get('SpeechResult');
        let assistantResponseText;

        if (userInput) {
            conversationHistory += `Human: ${userInput}\n`;
        }

        const messages = [{ role: 'system', content: systemPrompt }];
        conversationHistory.split('\n').filter(line => line.trim() !== '').forEach(line => {
            const [speaker, ...content] = line.split(': ');
            if (speaker && content.length > 0) {
                messages.push({
                    role: speaker.toLowerCase() === 'ai' ? 'assistant' : 'user',
                    content: content.join(': ')
                });
            }
        });
        
        const chatCompletion = await groq.chat.completions.create({
            messages: messages,
            model: 'llama3-8b-8192',
            temperature: 0.7,
        });
        assistantResponseText = chatCompletion.choices[0]?.message?.content || "Üzgünüm, bir sorun oluştu ve cevap üretemedim.";

        conversationHistory += `AI: ${assistantResponseText}\n`;
        await transcriptStore.set(callSid, conversationHistory);

        const audioStream = await elevenlabs.textToSpeechStream({
            textInput: assistantResponseText,
            voiceId: voiceId,
            modelId: 'eleven_multilingual_v2'
        });
        const audioBuffer = await streamToBuffer(audioStream);

        const audioKey = `${callSid}-${Date.now()}.mp3`;
        await audioStore.set(audioKey, audioBuffer);
        const audioUrl = `${baseUrl}/.netlify/functions/serve-audio?key=${audioKey}`;

        twiml.play({}, audioUrl);

        const gather = twiml.gather({
            input: 'speech',
            speechTimeout: 'auto',
            timeout: 3,
            language: 'tr-TR',
            action: `/.netlify/functions/handle-call?prompt=${encodedPrompt}`, 
        });
        
        gather.say({ language: 'tr-TR' }, "Hatta birini duyamadım. Görüşmeyi sonlandırıyorum, hoşçakalın.");
        twiml.hangup();

    } catch (error) {
        console.error(`handle-call Hatası (CallSid: ${callSid}):`, error);
        twiml.say({ language: 'tr-TR' }, "Beklenmedik bir sistem hatası oluştu. Üzgünüm, hoşçakalın.");
        twiml.hangup();
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: twiml.toString()
    };
};
