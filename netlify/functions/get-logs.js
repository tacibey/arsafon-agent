// netlify/functions/get-logs.js

const { getStore } = require('@netlify/blobs');

exports.handler = async function(event, context) {
    try {
        // --- DOĞRU BAĞLANTI YÖNTEMİ ---
        const { SITE_ID, NETLIFY_API_TOKEN } = process.env;
        const storeOptions = { siteID: SITE_ID, token: NETLIFY_API_TOKEN, apiURL: "https://api.netlify.com" };
        const logStore = getStore('call-logs', storeOptions);

        const { blobs } = await logStore.list();
        const logs = blobs.map(blob => logStore.get(blob.key, { type: 'json' }));
        const results = await Promise.all(logs);
        results.sort((a, b) => new Date(b.date) - new Date(a.date));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(results),
        };
    } catch (error) {
        console.error('Logları getirirken hata:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Kayıtlar getirilirken bir sunucu hatası oluştu.' }),
        };
    }
};
