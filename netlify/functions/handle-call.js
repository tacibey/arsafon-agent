// netlify/functions/handle-call.js

const twilio = require('twilio');
const Groq = require('groq-sdk');
const ElevenLabsNode = require('elevenlabs-node'); // 1. ÖNEMLİ DÜZELTME
const { getStore } = require('@netlify/blobs');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
// 2. ÖNEMLİ DÜZELTME: Kütüphaneyi doğru değişkenle başlat
const elevenlabs = new ElevenLabsNode({ apiKey: process.env.ELEVENLABS_API_KEY });
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
    const callSid = bodyParams.get('CallSid');
    const userInput = bodyParams.get('SpeechResult');
    const encodedPrompt = event.queryStringParameters.prompt;

    if (!callSid || !encodedPrompt) {
        twiml.say({ language: 'tr-TR' }, 'Kritik yapılandırma hatası.');
        twiml.hangup();
        return { statusCode: 200, headers, body: twiml.toString() };
    }

    try {
        const { BASE_URL } = process.env;
        const systemPrompt = Buffer.from(encodedPrompt, 'base64').toString('utf8');

        // 3. ÖNEMLİ DÜZELTME: En basit ve doğru kullanım.
        const transcriptStore = getStore('transcripts');
        const audioStore = getStore('audio-files-arsafon');

        let conversationHistory = await transcriptStore.get(callSid, { type: 'text' }).catch(() => "");
        if (userInput) {
            conversationHistory += `Human: ${userInput}\n`;
        }

        const messages = [{ role: 'system', content: systemPrompt }];
        conversationHistory.split('\n').filter(Boolean).forEach(line => {
            const [speaker, ...content] = line.split(': ');
            messages.push({ role: speaker.toLowerCase() === 'ai' ? 'assistant' : 'user', content: content.join(': ') });
        });
        
        const chatCompletion = await groq.chat.completions.create({ messages, model: 'llama3-8b-8192' });
        const assistantResponseText = chatCompletion.choices[0]?.message?.content || "Üzgünüm, bir sorun oluştu.";
        
        conversationHistory += `AI: ${assistantResponseText}\n`;
        await transcriptStore.set(callSid, conversationHistory);
        
        const audioStream = await elevenlabs.textToSpeechStream({ textInput: assistantResponseText, voiceId, modelId: 'eleven_multilingual_v2' });
        const audioBuffer = await streamToBuffer(audioStream);
        const audioKey = `${callSid}-${Date.now()}.mp3`;
        await audioStore.set(audioKey, audioBuffer);
        
        const audioUrl = `${BASE_URL}/.netlify/functions/serve-audio?key=${audioKey}`;
        twiml.play({}, audioUrl);

        const gather = twiml.gather({
            input: 'speech', speechTimeout: 'auto', timeout: 4, language: 'tr-TR',
            action: `/.netlify/functions/handle-call?prompt=${encodedPrompt}`, method: 'POST'
        });
        gather.say({ language: 'tr-TR' }, "Hatta birini duyamadım.");
        twiml.hangup();

    } catch (error) {
        console.error(`handle-call Hatası (CallSid: ${callSid}):`, error);
        twiml.say({ language: 'tr-TR' }, "Sistemde bir hata oluştu. Lütfen logları kontrol edin.");
        twiml.hangup();
    }
    
    return { statusCode: 200, headers, body: twiml.toString() };
};
