const { getStore } = require('@netlify/blobs');

exports.handler = async function(event, context) {
    const key = event.queryStringParameters.key;

    if (!key) {
        return { statusCode: 400, body: 'Dosya anahtarı (key) eksik.' };
    }

    try {
        const storeConfig = {
            siteID: process.env.NETLIFY_SITE_ID,
            token: process.env.NETLIFY_AUTH_TOKEN
        };
        // DİKKAT: Artık store adları gizli, public değil.
        const audioStore = getStore({ name: 'audio-files-arsafon', ...storeConfig });

        const audioBuffer = await audioStore.get(key, { type: 'buffer' });

        if (!audioBuffer) {
            return { statusCode: 404, body: 'Ses dosyası bulunamadı.' };
        }

        // Twilio'ya dosyayı Base64 formatında, doğru başlıkla gönderiyoruz.
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'audio/mpeg' },
            body: audioBuffer.toString('base64'),
            isBase64Encoded: true,
        };
    } catch (error) {
        console.error('Ses sunucu hatası:', error);
        return { statusCode: 500, body: 'Ses dosyası sunulurken hata oluştu.' };
    }
};
