// netlify/functions/get-logs.js

const { getStore } = require('@netlify/blobs');

exports.handler = async function(event, context) {
    try {
        // --- KRİTİK DÜZELTME: BLOBS BAĞLANTI BİLGİLERİ ---
        const logStore = getStore({
            name: "call-logs",
            siteID: process.env.SITE_ID,
            token: process.env.NETLIFY_API_TOKEN
        });

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
