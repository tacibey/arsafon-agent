// netlify/functions/log-call.js

const { getStore } = require('@netlify/blobs');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.handler = async function(event, context) {
    const callData = new URLSearchParams(event.body);
    const callSid = callData.get('CallSid');
    const callStatus = callData.get('CallStatus');
    const callDuration = callData.get('CallDuration');
    const to = callData.get('To');

    if (!callSid) {
        console.error("log-call çağrıldı ancak CallSid eksik.", event.body);
        return { statusCode: 400, body: 'CallSid eksik.' };
    }
    
    // --- KRİTİK DÜZELTME: BLOBS BAĞLANTI BİLGİLERİ ---
    const blobConfig = {
        siteID: process.env.SITE_ID,
        token: process.env.NETLIFY_API_TOKEN
    };

    const transcriptStore = getStore({ name: 'transcripts', ...blobConfig });
    const logStore = getStore({ name: 'call-logs', ...blobConfig });
    const audioStore = getStore({ name: 'audio-files-arsafon', ...blobConfig });

    try {
        const { blobs } = await audioStore.list({ prefix: callSid });
        for (const blob of blobs) {
            await audioStore.delete(blob.key);
        }

        const transcript = await transcriptStore.get(callSid, { type: 'text' });
        let summary = "Konuşma metni alınamadı veya konuşma gerçekleşmedi.";
        let sentiment = "N/A";

        if (transcript) {
            try {
                const prompt = `Aşağıdaki telefon görüşmesi metnini analiz et. Metin: "${transcript}"\n\nGörevin:\n1. Görüşmeyi en fazla iki cümleyle özetle.\n2. Görüşmenin genel havasını (müşterinin ilgisini) "Pozitif", "Negatif" veya "Nötr" olarak değerlendir.\n\nCevabını SADECE şu JSON formatında ver, başka hiçbir metin ekleme:\n{\n  "summary": "...",\n  "sentiment": "..."\n}`;
                const chatCompletion = await groq.chat.completions.create({
                    messages: [{ role: 'user', content: prompt }],
                    model: 'llama3-8b-8192',
                    temperature: 0.1,
                    response_format: { type: "json_object" },
                });
                const resultText = chatCompletion.choices[0].message.content;
                const result = JSON.parse(resultText);
                summary = result.summary || "Özet alınamadı.";
                sentiment = result.sentiment || "Değerlendirilemedi.";
            } catch (e) {
                console.error(`Groq özetleme hatası (CallSid: ${callSid}):`, e);
                summary = "AI tarafından özetlenirken bir hata oluştu. Lütfen tam metni kontrol edin.";
                sentiment = "Hata";
            }
            await transcriptStore.delete(callSid);
        }
        
        const finalLog = { 
            date: new Date().toISOString(), 
            calledNumber: to, 
            status: callStatus, 
            durationSeconds: callDuration, 
            sentiment: sentiment, 
            summary: summary,
            transcript: transcript || "N/A",
            callSid: callSid 
        };
        await logStore.setJSON(callSid, finalLog);

    } catch (error) {
        console.error(`Loglama hatası (CallSid: ${callSid}):`, error);
        await logStore.setJSON(callSid, { 
            error: 'Loglama sırasında genel bir hata oluştu.', 
            callSid: callSid, 
            status: callStatus, 
            duration: callDuration,
            date: new Date().toISOString()
        });
    }
    
    return { statusCode: 200, body: 'OK' };
};
