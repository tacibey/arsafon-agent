// netlify/functions/generate-audio.js

const ElevenLabsNode = require('elevenlabs-node');
const elevenlabs = new ElevenLabsNode({ apiKey: process.env.ELEVENLABS_API_KEY });
const voiceId = 'xyqF3vGMQlPk3e7yA4DI'; // Cansu sesinin ID'si

function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

exports.handler = async function(event, context) {
    try {
        const textToSpeak = Buffer.from(event.queryStringParameters.text, 'base64').toString('utf8');
        if (!textToSpeak) {
            return { statusCode: 400, body: 'Söylenecek metin eksik.' };
        }

        // --- GELİŞMİŞ SES AYARLARI ---
        const audioStream = await elevenlabs.textToSpeechStream({
            textInput: textToSpeak,
            voiceId: voiceId,
            modelId: 'eleven_multilingual_v2',
            stability: 0.3,         // Önerdiğiniz gibi, daha fazla ifade için düşürüldü.
            similarity_boost: 0.7,  // Sesin karakterini korumak için hafifçe düşürüldü.
            style: 0.1,             // Çok abartılı olmadan hafif bir konuşma tarzı ekler (0-1 arası).
            speaker_boost: true     // Sesin netliğini ve kalitesini artırır.
        });
        // --- İYİLEŞTİRME BİTTİ ---

        const audioBuffer = await streamToBuffer(audioStream);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'audio/mpeg' },
            body: audioBuffer.toString('base64'),
            isBase64Encoded: true,
        };
    } catch (error) {
        console.error("Ses üretme hatası:", error);
        return { statusCode: 500, body: 'Ses üretilirken hata oluştu.' };
    }
};
