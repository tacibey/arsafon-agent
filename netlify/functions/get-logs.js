// netlify/functions/get-logs.js
const { Client } = require('@netlify/blobs');

exports.handler = async function(event, context) {
    try {
        const { SITE_ID, NETLIFY_API_TOKEN } = process.env;
        const client = new Client({ siteID: SITE_ID, token: NETLIFY_API_TOKEN });
        const logStore = client.getStore('call-logs');
        
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
        return { statusCode: 500, body: JSON.stringify({ error: 'Kayıtlar getirilirken hata oluştu.' }) };
    }
};
