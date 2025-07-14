// netlify/functions/handle-call.js

const twilio = require('twilio');
const Groq = require('groq-sdk');
const ElevenLabs = require('elevenlabs-node');
const { getStore } = require('@netlify/blobs');

// API istemcilerini bir kere oluştur
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const elevenlabs = new ElevenLabs({ apiKey: process.env.ELEVENLABS_API_KEY });
const voiceId = 'xyqF3vGMQlPk3e7yA4DI'; // Örnek ses ID'si, kendi ID'nizle değiştirin

// Helper function: stream'i Buffer'a çevirir
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        if (!stream || typeof stream.on !== 'function') {
            return reject(new TypeError('Geçersiz stream nesnesi.'));
        }
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

    // Temel yapılandırma eksikse, hatayı logla ve telefonu kapat
    if (!baseUrl || !callSid || !process.env.GROQ_API_KEY || !process.env.ELEVENLABS_API_KEY) {
        console.error('Kritik yapılandırma hatası: Ortam değişkenleri eksik.', { callSid });
        twiml.say({ language: 'tr-TR' }, "Sistemde bir yapılandırma hatası mevcut. Lütfen yönetici ile iletişime geçin.");
        twiml.hangup();
        return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: twiml.toString() };
    }

    try {
        const audioStore = getStore('audio-files-arsafon');
        const transcriptStore = getStore('transcripts');

        // Gerekli parametreleri al
        const encodedPrompt = queryParams.prompt;
        const systemPrompt = Buffer.from(encodedPrompt, 'base64').toString('utf8');
        
        // Konuşma geçmişini al veya başlat
        let conversationHistory = await transcriptStore.get(callSid, { type: 'text' }) || "";
        const userInput = bodyParams.get('SpeechResult');
        let assistantResponseText;

        // Eğer bu ilk etkileşim değilse, kullanıcının cevabını geçmişe ekle
        if (userInput) {
            conversationHistory += `Human: ${userInput}\n`;
        }

        // LLM'e gönderilecek mesajları hazırla
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
        
        // Groq'tan cevap al
        const chatCompletion = await groq.chat.completions.create({
            messages: messages,
            model: 'llama3-8b-8192', // Model adını kontrol edin, gerekirse değiştirin
            temperature: 0.7,
        });
        assistantResponseText = chatCompletion.choices[0]?.message?.content || "Üzgünüm, bir sorun oluştu ve cevap üretemedim.";

        // AI'ın cevabını konuşma geçmişine ekle
        conversationHistory += `AI: ${assistantResponseText}\n`;
        await transcriptStore.set(callSid, conversationHistory); // Güncel geçmişi kaydet

        // Cevabı sese dönüştür (ElevenLabs)
        const audioStream = await elevenlabs.textToSpeechStream({
            textInput: assistantResponseText,
            voiceId: voiceId,
            modelId: 'eleven_multilingual_v2'
        });
        const audioBuffer = await streamToBuffer(audioStream);

        // Ses dosyasını Netlify Blobs'a kaydet
        const audioKey = `${callSid}-${Date.now()}.mp3`;
        await audioStore.set(audioKey, audioBuffer);
        const audioUrl = `${baseUrl}/.netlify/functions/serve-audio?key=${audioKey}`;

        // TwiML: AI'ın sesini çal
        twiml.play({}, audioUrl);

        // TwiML: Kullanıcıdan yeni bir sesli yanıt bekle
        const gather = twiml.gather({
            input: 'speech',
            speechTimeout: 'auto', // Otomatik sessizlik algılama
            timeout: 3, // Kullanıcı konuşmaya başlamazsa 3 saniye bekle
            language: 'tr-TR',
            // Kullanıcı konuştuğunda veya süre dolduğunda tekrar bu fonksiyona gel
            action: `/.netlify/functions/handle-call?prompt=${encodedPrompt}`, 
        });
        
        // Gather zaman aşımına uğrarsa (kullanıcı cevap vermezse) ne olacağını belirt
        gather.say({ language: 'tr-TR' }, "Hatta birini duyamadım. Görüşmeyi sonlandırıyorum, hoşçakalın.");
        // ve telefonu kapat
        twiml.hangup();

    } catch (error) {
        console.error(`handle-call Hatası (CallSid: ${callSid}):`, error);
        twiml.say({ language: 'tr-TR' }, "Beklenmedik bir sistem hatası oluştu. Üzgünüm, hoşçakalın.");
        twiml.hangup();
    }

    // Oluşturulan TwiML'i Twilio'ya gönder
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: twiml.toString()
    };
};
