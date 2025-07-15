// netlify/functions/handle-call.js

const twilio = require('twilio');
const Groq = require('groq-sdk');
const ElevenLabsNode = require('elevenlabs-node'); 

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const elevenlabs = new ElevenLabsNode({ apiKey: process.env.ELEVENLABS_API_KEY });
const voiceId = 'xyqF3vGMQlPk3e7yA4DI'; // Sizin Volkan sesinizin ID'si

exports.handler = async function(event, context) {
    const twiml = new twilio.twiml.VoiceResponse();
    const headers = { 'Content-Type': 'text/xml' };

    const queryParams = event.queryStringParameters;
    const userInput = new URLSearchParams(event.body).get('SpeechResult');
    
    // Konuşma geçmişini URL'den al veya sıfırdan başlat
    const conversation = queryParams.convo ? JSON.parse(Buffer.from(queryParams.convo, 'base64').toString()) : [];
    
    if (userInput) {
        conversation.push({ role: 'user', content: userInput });
    }

    const systemPrompt = Buffer.from(queryParams.prompt, 'base64').toString('utf8');
    const messages = [{ role: 'system', content: systemPrompt }, ...conversation];

    try {
        // 1. DÜŞÜN (Groq)
        const chatCompletion = await groq.chat.completions.create({ messages, model: 'llama3-8b-8192' });
        const assistantResponseText = chatCompletion.choices[0]?.message?.content || "Üzgünüm, bir sorun oluştu.";
        
        conversation.push({ role: 'assistant', content: assistantResponseText });
        
        // 2. SESİ ÜRET (ElevenLabs)
        // Bu sefer sesi bir URL'den değil, doğrudan Base64 formatında TwiML'e gömüyoruz.
        const audioStream = await elevenlabs.textToSpeechStream({ textInput: assistantResponseText, voiceId, modelId: 'eleven_multilingual_v2' });
        const chunks = [];
        for await (const chunk of audioStream) {
            chunks.push(chunk);
        }
        const audioBuffer = Buffer.concat(chunks);
        const audioBase64 = audioBuffer.toString('base64');

        // 3. KONUŞ (Twilio)
        // <Play> içine doğrudan base64 verisini gömmek, dosya veya URL ihtiyacını ortadan kaldırır.
        // Bu, en sağlam yöntemlerden biridir.
        twiml.play({}, `data:audio/mp3;base64,${audioBase64}`);

        // 4. BİR SONRAKİ ADIM İÇİN HAZIRLAN
        const nextConvo = Buffer.from(JSON.stringify(conversation)).toString('base64');
        const actionUrl = `/.netlify/functions/handle-call?prompt=${queryParams.prompt}&convo=${nextConvo}`;

        const gather = twiml.gather({
            input: 'speech', speechTimeout: 'auto', timeout: 4, language: 'tr-TR',
            action: actionUrl, method: 'POST'
        });

        // Gather zaman aşımına uğrarsa diye bir bekleme mesajı koyalım
        twiml.say({ voice: 'Polly.Filiz', language: 'tr-TR' }, "Hattayım.");
        twiml.hangup();

    } catch (error) {
        console.error("handle-call Hatası:", error);
        twiml.say({ voice: 'Polly.Filiz', language: 'tr-TR' }, "Sistemde bir hata oluştu, özür dilerim.");
        twiml.hangup();
    }
    
    return { statusCode: 200, headers: headers, body: twiml.toString() };
};
