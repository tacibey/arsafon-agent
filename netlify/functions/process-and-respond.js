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
        if (!stream || typeof stream.on !== 'function') { return reject(new TypeError('Geçersiz stream nesnesi.')); }
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

exports.handler = async function(event, context) {
    const twiml = new twilio.twiml.VoiceResponse();
    const queryParams = event.queryStringParameters;
    const bodyParams = new URLSearchParams(event.body);
    const callSid = bodyParams.get('CallSid');

    const headers = { 'Content-Type': 'text/xml' };
    
    try {
        const baseUrl = process.env.BASE_URL;
        const blobConfig = { name: "audio-files-arsafon", siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN };
        const transcriptBlobConfig = { ...blobConfig, name: "transcripts" };

        const audioStore = getStore(blobConfig);
        const transcriptStore = getStore(transcriptBlobConfig);

        const encodedPrompt = queryParams.prompt;
        const systemPrompt = Buffer.from(encodedPrompt, 'base64').toString('utf8');
        const userInput = queryParams.userInput ? decodeURIComponent(queryParams.userInput) : null;
        
        let conversationHistory = await transcriptStore.get(callSid, { type: 'text' }) || "";

        if (userInput) {
            conversationHistory += `Human: ${userInput}\n`;
        }

        const messages = [{ role: 'system', content: systemPrompt }];
        conversationHistory.split('\n').filter(line => line.trim() !== '').forEach(line => {
            const [speaker, ...content] = line.split(': ');
            if (speaker && content.length > 0) {
                messages.push({ role: speaker.toLowerCase() === 'ai' ? 'assistant' : 'user', content: content.join(': ') });
            }
        });
        
        const chatCompletion = await groq.chat.completions.create({ messages, model: 'llama3-8b-8192', temperature: 0.7 });
        const assistantResponseText = chatCompletion.choices[0]?.message?.content || "Üzgünüm, bir sorun oluştu ve cevap üretemedim.";

        conversationHistory += `AI: ${assistantResponseText}\n`;
        await transcriptStore.set(callSid, conversationHistory);

        const audioStream = await elevenlabs.textToSpeechStream({ textInput: assistantResponseText, voiceId: voiceId, modelId: 'eleven_multilingual_v2' });
        const audioBuffer = await streamToBuffer(audioStream);

        const audioKey = `${callSid}-${Date.now()}.mp3`;
        await audioStore.set(audioKey, audioBuffer);
        const audioUrl = `${baseUrl}/.netlify/functions/serve-audio?key=${audioKey}`;

        twiml.play({}, audioUrl);

        // Kullanıcıdan yeni cevap almak için tekrar ANA fonksiyona yönlendir.
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
        console.error(`process-and-respond Hatası (CallSid: ${callSid}):`, error);
        const errorTwiml = new twilio.twiml.VoiceResponse();
        errorTwiml.say({ language: 'tr-TR' }, "Beklenmedik bir sistem hatası oluştu. Üzgünüm, hoşçakalın.");
        errorTwiml.hangup();
        return { statusCode: 200, headers: headers, body: errorTwiml.toString() };
    }

    return { statusCode: 200, headers: headers, body: twiml.toString() };
};
