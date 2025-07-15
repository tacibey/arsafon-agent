// netlify/functions/handle-call.js

const twilio = require('twilio');
const Groq = require('groq-sdk');
const ElevenLabsNode = require('elevenlabs-node');

// ... (kütüphane başlangıçları aynı)

// --- YENİ KARAR AĞACI: AI sadece bu listeden bir isim seçecek ---
const responseMap = {
    GREETING: "Merhaba, ismim Cansu, satılık arsanız için aramıştım. Müsait miydiniz?",
    ASK_DETAILS: "Arsanız acil mi satılık ve pazarlık payınız var mıdır?",
    PROPOSE_MEETING: "Anlıyorum. Biz Arsafon olarak arsanızla ilgileniyoruz. Müsaitseniz yarın gayrimenkul danışmanı arkadaşım sizi arayıp detayları paylaşsın. Olur mu?",
    CLOSING: "Teşekkürler, iyi günler dilerim görüşmek üzere.",
    FALLBACK: "Bu detayı bilmiyorum ama yarın arayacak olan arkadaşım tüm sorularınızı yanıtlayacaktır."
};

exports.handler = async function(event, context) {
    // ... (kodun başı aynı)
    try {
        // --- YENİ MODEL VE KİLİTLENMİŞ AYARLAR ---
        const chatCompletion = await groq.chat.completions.create({
            messages,
            model: 'mistral-saba-24b', // Sizin önerdiğiniz model
            temperature: 0,          // Yaratıcılık SIFIR.
            top_p: 0.1,              // Sadece en olası kelimeyi seç.
            max_tokens: 10           // Sadece tek bir kelime (seçenek adı) döneceği için 10 token yeterli.
        });
        // --- GÜNCELLEME BİTTİ ---

        // AI'dan gelen cevap "GREETING", "CLOSING" gibi bir anahtar kelime olacak.
        const responseKey = chatCompletion.choices[0]?.message?.content.trim() || 'FALLBACK';
        
        // Bu anahtar kelimeye karşılık gelen tam metni haritadan alıyoruz.
        const assistantResponseText = responseMap[responseKey] || responseMap['FALLBACK'];
        
        conversation.push({ role: 'assistant', content: assistantResponseText });

        const textToSpeakEncoded = Buffer.from(assistantResponseText).toString('base64');
        const audioUrl = `/.netlify/functions/generate-audio?text=${textToSpeakEncoded}`;
        twiml.play({}, audioUrl);

        const nextConvo = Buffer.from(JSON.stringify(conversation)).toString('base64');
        const actionUrl = `/.netlify/functions/handle-call?prompt=${queryParams.prompt}&convo=${nextConvo}`;

        // Eğer AI kapanış cümlesini seçtiyse, tekrar dinleme (gather) yapma.
        if (responseKey === 'CLOSING') {
            twiml.hangup();
        } else {
            const gather = twiml.gather({
                input: 'speech', speechTimeout: 'auto', timeout: 4, language: 'tr-TR',
                action: actionUrl, method: 'POST'
            });
            twiml.hangup(); // Gather başarısız olursa kapat.
        }

    } catch (error) {
        console.error("handle-call Hatası:", error);
        twiml.say({ voice: 'Polly.Filiz', language: 'tr-TR' }, "Sistemde bir hata oluştu.");
        twiml.hangup();
    }
    
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/xml' },
        body: twiml.toString()
    };
};
