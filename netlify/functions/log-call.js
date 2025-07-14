const { getStore } = require('@netlify/blobs');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

exports.handler = async function(event, context) {
    // Twilio'dan gelen bilgiyi parse et
    const callData = new URLSearchParams(event.body);
    const callSid = callData.get('CallSid');
    const callStatus = callData.get('CallStatus');
    const callDuration = callData.get('CallDuration');
    const to = callData.get('To');

    const transcriptStore = getStore({
    name: 'transcripts',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_AUTH_TOKEN
});
const logStore = getStore({
    name: 'call-logs',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_AUTH_TOKEN
});

    try {
        // 1. Geçici konuşma kaydını al
        const transcript = await transcriptStore.get(callSid);

        let summary = "Konuşma metni alınamadı veya konuşma gerçekleşmedi.";
        let sentiment = "N/A";

        if (transcript) {
            // 2. Groq'a gönderip özet ve skor iste
            const prompt = `Aşağıdaki telefon görüşmesi metnini analiz et. 
            Metin: "${transcript}"
            
            Görevin:
            1. Görüşmeyi en fazla iki cümleyle özetle.
            2. Görüşmenin genel havasını (müşterinin ilgisini) "Pozitif", "Negatif" veya "Nötr" olarak değerlendir.
            
            Cevabını şu JSON formatında ver:
            {
              "summary": "...",
              "sentiment": "..."
            }`;

            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama3-8b-8192', // Özetleme için hızlı model yeterli
                temperature: 0.1,
                response_format: { type: "json_object" },
            });

            const result = JSON.parse(chatCompletion.choices[0].message.content);
            summary = result.summary;
            sentiment = result.sentiment;

            // 4. Geçici transkripti sil
            await transcriptStore.delete(callSid);
        }

        // 3. Nihai log verisini oluştur
        const finalLog = {
            date: new Date().toISOString(),
            calledNumber: to,
            status: callStatus,
            durationSeconds: callDuration,
            sentiment: sentiment,
            summary: summary,
            callSid: callSid,
        };

        // Nihai logu kalıcı olarak kaydet
        await logStore.setJSON(callSid, finalLog);

    } catch (error) {
        console.error(`Loglama hatası (CallSid: ${callSid}):`, error);
        // Hata olsa bile temel bilgileri kaydetmeye çalış
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
