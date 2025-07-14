// netlify/functions/serve-audio.js

const { getStore } = require('@netlify/blobs');

exports.handler = async function(event, context) {
    const key = event.queryStringParameters.key;

    if (!key) {
        return { statusCode: 400, body: 'Dosya anahtarı (key) eksik.' };
    }

    try {
        // --- KRİTİK DÜZELTME: BLOBS BAĞLANTI BİLGİLERİ ---
        const audioStore = getStore({
            name: "audio-files-arsafon",
            siteID: process.env.SITE_ID,
            token: process.env.NETLIFY_API_TOKEN
        });

        const audioBuffer = await audioStore.get(key, { type: 'buffer' });

        if (!audioBuffer) {
            return { statusCode: 404, body: 'Ses dosyası bulunamadı.' };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'audio/mpeg' },
            body: audioBuffer.toString('base64'),
            isBase64Encoded: true,
        };
    } catch (error) {
        console.error(`Ses sunucu hatası (key: ${key}):`, error);
        return { statusCode: 500, body: 'Ses dosyası sunulurken hata oluştu.' };
    }
};
