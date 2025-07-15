// netlify/functions/log-call.js
const { Client } = require('@netlify/blobs');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.handler = async function(event, context) {
    const callData = new URLSearchParams(event.body);
    const callSid = callData.get('CallSid');
    if (!callSid) return { statusCode: 400 };
    
    (async () => {
        try {
            const { SITE_ID, NETLIFY_API_TOKEN } = process.env;
            const client = new Client({ siteID: SITE_ID, token: NETLIFY_API_TOKEN });
            const transcriptStore = client.getStore('transcripts');
            const logStore = client.getStore('call-logs');
            const audioStore = client.getStore('audio-files-arsafon');
            
            // ... (geri kalan kod aynı)
            const { blobs } = await audioStore.list({ prefix: callSid });
            for (const blob of blobs) { await audioStore.delete(blob.key); }
            const transcript = await transcriptStore.get(callSid, {type: 'text'}).catch(() => null);
            let summary = "Konuşma metni alınamadı.", sentiment = "N/A";
            if (transcript) {
                //... özetleme kısmı ...
                await transcriptStore.delete(callSid);
            }
            const { To, CallStatus, CallDuration } = Object.fromEntries(callData.entries());
            const finalLog = { date: new Date().toISOString(), calledNumber: To, status: CallStatus, durationSeconds: CallDuration, sentiment, summary, transcript: transcript || "N/A", callSid };
            await logStore.setJSON(callSid, finalLog);
        } catch (error) {
            console.error(`Loglama hatası (CallSid: ${callSid}):`, error);
        }
    })();
    return { statusCode: 204 };
};
