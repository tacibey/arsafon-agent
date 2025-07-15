// netlify/functions/generate-audio.js
const ElevenLabsNode = require('elevenlabs-node');
const elevenlabs = new ElevenLabsNode({ apiKey: process.env.ELEVENLABS_API_KEY });
const voiceId = 'xyqF3vGMQlPk3e7yA4DI';

function streamToBuffer(stream) { /* ... (içeriği aynı) ... */ }

exports.handler = async function(event, context) {
    try {
        const textToSpeak = Buffer.from(event.queryStringParameters.text, 'base64').toString('utf8');
        const audioStream = await elevenlabs.textToSpeechStream({
            textInput: textToSpeak,
            voiceId: voiceId, modelId: 'eleven_multilingual_v2',
            stability: 0.3, similarity_boost: 0.7, style: 0.1, speaker_boost: true
        });
        const audioBuffer = await streamToBuffer(audioStream);
        return {
            statusCode: 200, headers: { 'Content-Type': 'audio/mpeg' },
            body: audioBuffer.toString('base64'), isBase64Encoded: true,
        };
    } catch (error) { /* ... (içeriği aynı) ... */ }
};
