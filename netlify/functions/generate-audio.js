// netlify/functions/generate-audio.js

const ElevenLabsNode = require('elevenlabs-node');
const elevenlabs = new ElevenLabsNode({ apiKey: process.env.ELEVENLABS_API_KEY });
const voiceId = 'xyqF3vGMQlPk3e7yA4DI'; // Sizin Volkan sesinizin ID'si

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

        const audioStream = await elevenlabs.textToSpeechStream({
            textInput: textToSpeak,
            voiceId: voiceId,
            modelId: 'eleven_multilingual_v2'
        });

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
