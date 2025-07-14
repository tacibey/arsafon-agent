// netlify/functions/log-call.js

const { getStore } = require('@netlify/blobs');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.handler = async function(event, context) {
    const callData = new URLSearchParams(event.body);
    const callSid = callData.get('CallSid');

    // Eğer bir şekilde callSid gelmezse, işlemi hemen bitir.
    if (!callSid) {
        console.error("log-call çağrıldı ancak CallSid eksik.", event.body);
        return { statusCode: 400 }; // Hatalı istek
    }
    
    // Asenkron işlemleri beklerken Twilio'yu bekletmemek için loglamayı arkaplanda yap.
    // Bu nedenle, loglama başarılı olsa da olmasa da Twilio'ya hemen cevap döneceğiz.
    (async () => {
        try {
            const callStatus = callData.get('CallStatus');
            const callDuration = callData.get('CallDuration');
            const to = callData.get('To');
            
            const blobConfig = { siteID: process.env.SITE_ID, token: process.env.NETLIFY_API_TOKEN };
            const transcriptStore = getStore({ name: 'transcripts', ...blobConfig });
            const logStore = getStore({ name: 'call-logs', ...blobConfig });
            const audioStore = getStore({ name: 'audio-files-arsafon', ...blobConfig });

            const { blobs } = await audioStore.list({ prefix: callSid });
            for (const blob of blobs) { await audioStore.delete(blob.key); }

            const transcript = await transcriptStore.get(callSid, { type: 'text' });
            let summary = "Konuşma metni alınamadı veya konuşma gerçekleşmedi.";
            let sentiment = "N/A";

            if (transcript) {
                try {
                    const prompt = `Aşağıdaki telefon görüşmesi metnini analiz et. Metin: "${transcript}"...\nCevabını SADECE şu JSON formatında ver...{\n  "summary": "...",\n  "sentiment": "..."\n}`;
                    const chatCompletion = await groq.chat.completions.create({
                        messages: [{ role: 'user', content: prompt }], model: 'llama3-8b-8192', temperature: 0.1, response_format: { type: "json_object" },
                    });
                    const result = JSON.parse(chatCompletion.choices[0].message.content);
                    summary = result.summary || "Özet alınamadı.";
                    sentiment = result.sentiment || "Değerlendirilemedi.";
                } catch (e) {
                    console.error(`Groq özetleme hatası (CallSid: ${callSid}):`, e);
                    summary = "AI tarafından özetlenirken bir hata oluştu.";
                    sentiment = "Hata";
                }
                await transcriptStore.delete(callSid);
            }
            
            const finalLog = { date: new Date().toISOString(), calledNumber: to, status: callStatus, durationSeconds: callDuration, sentiment, summary, transcript: transcript || "N/A", callSid };
            await logStore.setJSON(callSid, finalLog);

        } catch (error) {
            console.error(`Loglama arkaplan hatası (CallSid: ${callSid}):`, error);
            // Bu hata Twilio'ya gitmeyecek, sadece bizim loglarımızda görünecek.
        }
    })(); // Arkaplan fonksiyonunu hemen çalıştır.

    // --- KRİTİK DÜZELTME: TWILIO'YA ANINDA VE DOĞRU CEVABI DÖN ---
    // Twilio'ya "Mesajını aldım, işlem yapmama gerek yok" demenin en doğru yolu.
    // Bu, 11200 ve 12300 gibi hataları önler.
    return {
        statusCode: 204
    };
};
