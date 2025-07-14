const twilio = require('twilio');
const Groq = require('groq-sdk');
const ElevenLabs = require('elevenlabs-node');
const { getStore } = require('@netlify/blobs');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const elevenlabs = new ElevenLabs({ apiKey: process.env.ELEVENLABS_API_KEY });
const voiceId = 'xyqF3vGMQlPk3e7yA4DI';

// Stream'i Buffer'a çevirmek için yardımcı fonksiyon
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

exports.handler = async function(event, context) {
    const response = new twilio.twiml.VoiceResponse();
    const queryParams = event.queryStringParameters;
    const callSid = queryParams.CallSid; // Her aramanın benzersiz kimliği

    try {
        // Depolama alanlarını tanımla
        const audioStore = getStore('audio-files');
        const transcriptStore = getStore('transcripts');
        
        // Konuşma geçmişi ve prompt'u yönet
        const firstInteraction = queryParams.first !== 'false';
        const encodedPrompt = queryParams.prompt;
        const systemPrompt = Buffer.from(encodedPrompt, 'base64').toString('utf8');
        let conversationHistory = queryParams.convo ? decodeURIComponent(queryParams.convo) : "";
        const userInput = event.body ? new URLSearchParams(event.body).get('SpeechResult') : null;

        let assistantResponseText;

        if (firstInteraction) {
            assistantResponseText = "Merhaba, ben yapay zeka asistanı Volkan, Arsafon'dan arıyorum, müsait miydiniz?";
        } else {
            if (userInput) {
                conversationHistory += `Human: ${userInput}\n`;
            }
            const messages = [
                { role: 'system', content: systemPrompt },
                ...conversationHistory.split('\n').filter(line => line.trim() !== '').map(line => {
                    const [speaker, ...content] = line.split(': ');
                    return {
                        role: speaker.toLowerCase() === 'ai' ? 'assistant' : 'user',
                        content: content.join(': ')
                    };
                })
            ];
            const chatCompletion = await groq.chat.completions.create({
                messages: messages,
                model: 'llama3-8b-8192', // Hızlı bir modelle devam edelim
            });
            assistantResponseText = chatCompletion.choices[0]?.message?.content || "Üzgünüm, bir sorun oluştu.";
        }

        conversationHistory += `AI: ${assistantResponseText}\n`;
        if (callSid) {
            await transcriptStore.set(callSid, conversationHistory);
        }

        // --- YENİ VE DOĞRU YÖNTEM ---
        // 1. ElevenLabs'ten sesi al
        const audioStream = await elevenlabs.textToSpeechStream({
            textInput: assistantResponseText,
            voiceId: voiceId,
            modelId: 'eleven_multilingual_v2',
            output_format: 'mp3_44100_128'
        });
        const audioBuffer = await streamToBuffer(audioStream);

        // 2. Sesi, her arama için benzersiz bir isimle Netlify Blobs'a kaydet
        const audioKey = `${callSid}-response.mp3`;
        await audioStore.set(audioKey, audioBuffer, {
            metadata: { contentType: 'audio/mpeg' }
        });

        // 3. Kaydedilen sesin herkese açık URL'ini al
        const audioUrl = await audioStore.getSignedURL(audioKey);
        
        // 4. Twilio'ya Base64 yerine sadece sesin URL'ini ver
        response.play({}, audioUrl);
        // --- YÖNTEMİN SONU ---

        const nextActionUrl = `/.netlify/functions/handle-call?prompt=${encodedPrompt}&first=false&convo=${encodeURIComponent(conversationHistory)}&CallSid=${callSid}`;

        response.gather({
            input: 'speech',
            speechTimeout: 'auto',
            timeout: 4,
            action: nextActionUrl,
            language: 'tr-TR',
        });

        response.say({ language: 'tr-TR' }, "Görüşmek üzere, hoşçakalın.");
        response.hangup();

    } catch (error) {
        console.error('Hata:', error);
        response.say({ language: 'tr-TR' }, "Üzgünüm, bir sistem hatası oluştu. Lütfen daha sonra tekrar deneyin.");
        response.hangup();
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: response.toString(),
    };
};
