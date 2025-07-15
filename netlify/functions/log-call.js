// netlify/functions/log-call.js
const { getStore } = require('@netlify/blobs');
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.handler = async function(event, context) {
    // ... (kodun geri kalanı aynı, sadece getStore kullanımı basit)
    const callData = new URLSearchParams(event.body);
    const callSid = callData.get('CallSid');
    if (!callSid) return { statusCode: 400 };
    (async () => {
        try {
            const transcriptStore = getStore('transcripts');
            const logStore = getStore('call-logs');
            const audioStore = getStore('audio-files-arsafon');
            // ... (loglama mantığı aynı kalıyor)
        } catch (error) { /*...*/ }
    })();
    return { statusCode: 204 };
};
