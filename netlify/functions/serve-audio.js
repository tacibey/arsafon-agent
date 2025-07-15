// netlify/functions/serve-audio.js
const { Client } = require('@netlify/blobs');

exports.handler = async function(event, context) {
    const key = event.queryStringParameters.key;
    if (!key) return { statusCode: 400, body: 'Dosya anahtarı eksik.' };

    try {
        const { SITE_ID, NETLIFY_API_TOKEN } = process.env;
        const client = new Client({ siteID: SITE_ID, token: NETLIFY_API_TOKEN });
        const audioStore = client.getStore('audio-files-arsafon');
        
        const audioBuffer = await audioStore.get(key, { type: 'buffer' });
        if (!audioBuffer) return { statusCode: 404, body: 'Ses dosyası bulunamadı.' };

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'audio/mpeg' },
            body: audioBuffer.toString('base64'),
            isBase64Encoded: true,
        };
    } catch (error) {
        return { statusCode: 500, body: 'Ses dosyası sunulurken hata oluştu.' };
    }
};
