// netlify/functions/log-call.js

const { getStore } = require('@netlify/blobs');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.handler = async function(event, context) {
    const callData = new URLSearchParams(event.body);
    const callSid = callData.get('CallSid');

    if (!callSid) {
        return { statusCode: 400 };
    }
    
    (async () => {
        try {
            // --- DOĞRU BAĞLANTI YÖNTEMİ ---
            const transcriptStore = getStore('transcripts');
            const logStore = getStore('call-logs');
            const audioStore = getStore('audio-files-arsafon');

            const { blobs } = await audioStore.list({ prefix: callSid });
            for (const blob of blobs) { await audioStore.delete(blob.key); }

            const transcript = await transcriptStore.get(callSid, {type: 'text'}).catch(() => null);
            let summary = "Konuşma metni alınamadı.";
            let sentiment = "N/A";

            if (transcript) {
                try {
                    const prompt = `Aşağıdaki telefon görüşmesi metnini analiz et. Metin: "${transcript}"...\nCevabını SADECE şu JSON formatında ver...`;
                    const chatCompletion = await groq.chat.completions.create({
                        messages: [{ role: 'user', content: prompt }], model: 'llama3-8b-8192', temperature: 0.1, response_format: { type: "json_object" },
                    });
                    const result = JSON.parse(chatCompletion.choices[0].message.content);
                    summary = result.summary || "Özet alınamadı.";
                    sentiment = result.sentiment || "Değerlendirilemedi.";
                } catch (e) {
                    summary = "AI tarafından özetlenirken bir hata oluştu.";
                    sentiment = "Hata";
                }
                await transcriptStore.delete(callSid);
            }
            
            const { To, CallStatus, CallDuration } = Object.fromEntries(callData.entries());
            const finalLog = { date: new Date().toISOString(), calledNumber: To, status: CallStatus, durationSeconds: CallDuration, sentiment, summary, transcript: transcript || "N/A", callSid };
            await logStore.setJSON(callSid, finalLog);

        } catch (error) {
            console.error(`Loglama arkaplan hatası (CallSid: ${callSid}):`, error);
        }
    })();

    return { statusCode: 204 };
};
