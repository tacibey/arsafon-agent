// netlify/functions/process-and-respond.js

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
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

exports.handler = async function(event, context) {
    const twiml = new twilio.twiml.VoiceResponse();
    const bodyParams = new URLSearchParams(event.body);
    const queryParams = event.queryStringParameters;
    const callSid = bodyParams.get('CallSid');
    const headers = { 'Content-Type': 'text/xml' };
    
    if (!callSid) {
        twiml.say({ language: 'tr-TR' }, 'Kritik hata: Arama kimliği işlenemedi.');
        twiml.hangup();
        return { statusCode: 200, headers: headers, body: twiml.toString() };
    }
    
    try {
        const baseUrl = process.env.BASE_URL;
        const encodedPrompt = queryParams.prompt;
        const systemPrompt = Buffer.from(encodedPrompt, 'base64').toString('utf8');

        // BİLGİLERİ VERİTABANINDAN AL
        const blobConfig = { name: "audio-files-arsafon", siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN };
        const transcriptBlobConfig = { ...blobConfig, name: "transcripts" };
        const audioStore = getStore(blobConfig);
        const transcriptStore = getStore(transcriptBlobConfig);
        
        const conversationHistory = await transcriptStore.get(callSid, { type: 'text' }) || "";

        const messages = [{ role: 'system', content: systemPrompt }];
        conversationHistory.split('\n').filter(line => line.trim() !== '').forEach(line => {
            const [speaker, ...content] = line.split(': ');
            if (speaker && content.length > 0) {
                messages.push({ role: speaker.toLowerCase() === 'ai' ? 'assistant' : 'user', content: content.join(': ') });
            }
        });
        
        const chatCompletion = await groq.chat.completions.create({ messages, model: 'llama3-8b-8192', temperature: 0.7 });
        let assistantResponseText = chatCompletion.choices[0]?.message?.content;

        if (!assistantResponseText || assistantResponseText.trim() === '') {
            assistantResponseText = "Üzgünüm, ne diyeceğimi bilemedim. Konuyu toparlayabilir misiniz?";
        }
        
        // AI CEVABINI VERİTABANINA KAYDET
        const updatedHistory = conversationHistory + `AI: ${assistantResponseText}\n`;
        await transcriptStore.set(callSid, updatedHistory);

        const audioStream = await elevenlabs.textToSpeechStream({ textInput: assistantResponseText, voiceId: voiceId, modelId: 'eleven_multilingual_v2' });
        const audioBuffer = await streamToBuffer(audioStream);
        const audioKey = `${callSid}-${Date.now()}.mp3`;
        await audioStore.set(audioKey, audioBuffer);
        
        const audioUrl = `${baseUrl}/.netlify/functions/serve-audio?key=${audioKey}`;
        twiml.play({}, audioUrl);

        // Kullanıcıdan yeni cevap almak için tekrar HAFİF olan handle-call fonksiyonuna yönlendir.
        const gatherActionUrl = `/.netlify/functions/handle-call?prompt=${encodedPrompt}`;
        const gather = twiml.gather({ input: 'speech', speechTimeout: 'auto', timeout: 4, language: 'tr-TR', action: gatherActionUrl });
        
        // Gather zaman aşımına uğrarsa
        gather.say({ language: 'tr-TR' }, "Hatta birini duyamadım. Görüşmeyi sonlandırıyorum, hoşçakalın.");
        twiml.hangup();

    } catch (error) {
        console.error(`process-and-respond Hatası (CallSid: ${callSid}):`, error);
        twiml.say({ language: 'tr-TR' }, "Beklenmedik bir sistem hatası oluştu. Üzgünüm, hoşçakalın.");
        twiml.hangup();
    }

    return { statusCode: 200, headers: headers, body: twiml.toString() };
};
