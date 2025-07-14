const twilio = require('twilio');
const Groq = require('groq-sdk');
const ElevenLabs = require('elevenlabs-node');
const { getStore } = require('@netlify/blobs'); // YENİ EKLENDİ

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const elevenlabs = new ElevenLabs({ apiKey: process.env.ELEVENLABS_API_KEY });

// ElevenLabs ses ID'si. Değiştirmek istersen ElevenLabs sitesinden bakabilirsin.
const voiceId = 'pNInz6obpgU5sV7FJG3t'; 

exports.handler = async function(event, context) {
const response = new twilio.twiml.VoiceResponse();
    
    // Gelen parametreleri al
    const queryParams = event.queryStringParameters;
    const firstInteraction = queryParams.first !== 'false';
    const encodedPrompt = queryParams.prompt;
    const systemPrompt = Buffer.from(encodedPrompt, 'base64').toString('utf8');
    const callSid = queryParams.CallSid; // YENİ: Her aramanın benzersiz kimliğini alıyoruz
    
    // Konuşma geçmişini ve kullanıcının son söylediklerini al
    let conversationHistory = queryParams.convo ? decodeURIComponent(queryParams.convo) : "";
    const userInput = event.body ? new URLSearchParams(event.body).get('SpeechResult') : null;

    try {
        const transcriptStore = getStore('transcripts'); // YENİ: Geçici kayıtlar için depolama alanını tanımla
        let assistantResponseText;

        if (firstInteraction) {
            // Bu ilk etkileşim. Sadece karşılama mesajı oluştur.
            const welcomeMessage = "Merhaba, ben yapay zeka asistanı Volkan, Arsafon'dan arıyorum, müsait miydiniz?";
            conversationHistory += `AI: ${welcomeMessage}\n`;
            assistantResponseText = welcomeMessage;
        } else {
            // Bu ilk etkileşim değil. Kullanıcının söylediklerini işle.
            if (userInput) {
                conversationHistory += `Human: ${userInput}\n`;
            }

            // Groq'a gönderilecek mesajları formatla
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
            
            // Groq'dan bir cevap oluşturmasını iste
            const chatCompletion = await groq.chat.completions.create({
                messages: messages,
                model: 'meta-llama/llama-4-maverick-17b-128e-instruct',
            });

            assistantResponseText = chatCompletion.choices[0]?.message?.content || "Üzgünüm, bir sorun oluştu.";
            conversationHistory += `AI: ${assistantResponseText}\n`;
        }
        
        // YENİ: Güncellenen konuşma metnini geçici olarak kaydet
        // Bu, arama bitince log-call.js'nin okuyabilmesi için gerekli.
        if(callSid){
            await transcriptStore.set(callSid, conversationHistory);
        }

        // ElevenLabs ile metni sese çevir
        const audioStream = await elevenlabs.textToSpeechStream({
            textInput: assistantResponseText,
            voiceId: voiceId,
            modelId: 'eleven_multilingual_v2', // Çoklu dil desteği olan model
            output_format: 'mp3_44100_128'
        });

        // Gelen ses dosyasını base64'e çevirerek TwiML'e göm
        const audioBuffer = await streamToBuffer(audioStream);
        const audioBase64 = audioBuffer.toString('base64');
        response.play({}, `data:audio/mp3;base64,${audioBase64}`);

        // Konuşma geçmişini bir sonraki isteğe taşımak için URL'e ekle
        const nextActionUrl = `/.netlify/functions/handle-call?prompt=${encodedPrompt}&first=false&convo=${encodeURIComponent(conversationHistory)}&CallSid=${callSid}`;

        // Kullanıcıdan tekrar konuşmasını dinle
        response.gather({
            input: 'speech',
            speechTimeout: 'auto',
            timeout: 4, // 4 saniye sessizlik olursa konuşmayı bitirmiş say
            action: nextActionUrl,
            language: 'tr-TR', // Türkçe konuşmayı anla
        });

        // Eğer kullanıcı konuşmazsa, görüşmeyi sonlandır
        response.say({ language: 'tr-TR' }, "Görüşmek üzere, hoşçakalın.");
        response.hangup();

    } catch (error) {
        console.error('Hata:', error);
        response.say({ language: 'tr-TR' }, "Üzgünüm, bir sistem hatası oluştu. Lütfen daha sonra tekrar deneyin.");
        response.hangup();
    }

    // Twilio'ya ne yapması gerektiğini XML formatında geri gönder
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: response.toString(),
    };
};

// Stream'i Buffer'a çevirmek için yardımcı fonksiyon
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}
