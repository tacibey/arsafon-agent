const { getStore } = require('@netlify/blobs');

exports.handler = async function(event, context) {
    try {
        const storeConfig = {
            siteID: process.env.NETLIFY_SITE_ID,
            token: process.env.NETLIFY_AUTH_TOKEN
        };
        const logStore = getStore({ name: 'call-logs', ...storeConfig });

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
