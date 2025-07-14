const { getStore } = require('@netlify/blobs');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.handler = async function(event, context) {
    const callData = new URLSearchParams(event.body);
    const callSid = callData.get('CallSid');
    const callStatus = callData.get('CallStatus');
    const callDuration = callData.get('CallDuration');
    const to = callData.get('To');

    const storeConfig = {
        siteID: process.env.NETLIFY_SITE_ID,
        token: process.env.NETLIFY_AUTH_TOKEN
    };
    const transcriptStore = getStore({ name: 'transcripts', ...storeConfig });
    const logStore = getStore({ name: 'call-logs', ...storeConfig });
    // DİKKAT: Arama bitince ses dosyasını silmek için.
    const audioStore = getStore({ name: 'public-audio-arsafon', ...storeConfig });


    try {
        const transcript = await transcriptStore.get(callSid);
        let summary = "Konuşma metni alınamadı veya konuşma gerçekleşmedi.";
        let sentiment = "N/A";

        if (transcript) {
            const prompt = `Aşağıdaki telefon görüşmesi metnini analiz et. Metin: "${transcript}"\n\nGörevin:\n1. Görüşmeyi en fazla iki cümleyle özetle.\n2. Görüşmenin genel havasını (müşterinin ilgisini) "Pozitif", "Negatif" veya "Nötr" olarak değerlendir.\n\nCevabını şu JSON formatında ver:\n{\n  "summary": "...",\n  "sentiment": "..."\n}`;
            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama3-8b-8192',
                temperature: 0.1,
                response_format: { type: "json_object" },
            });
            const result = JSON.parse(chatCompletion.choices[0].message.content);
            summary = result.summary;
            sentiment = result.sentiment;

            await transcriptStore.delete(callSid);
        }

        // Arama bitince gereksiz ses dosyalarını sil
        const audioKey = `${callSid}-response.mp3`;
        await audioStore.delete(audioKey);

        const finalLog = {
            date: new Date().toISOString(),
            calledNumber: to,
            status: callStatus,
            durationSeconds: callDuration,
            sentiment: sentiment,
            summary: summary,
            callSid: callSid,
        };

        await logStore.setJSON(callSid, finalLog);
    } catch (error) {
        console.error(`Loglama hatası (CallSid: ${callSid}):`, error);
        await logStore.setJSON(callSid, { 
            error: 'Özetleme sırasında hata oluştu.',
            callSid: callSid,
            status: callStatus,
            duration: callDuration,
        });
    }

    return {
        statusCode: 200,
        body: 'OK',
    };
};
