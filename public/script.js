document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const passwordInput = document.getElementById('password');
    const authContainer = document.getElementById('auth-container');
    const mainContainer = document.getElementById('main-container');

    loginBtn.addEventListener('click', () => {
        if (passwordInput.value === 'Af*3317!') {
            authContainer.style.display = 'none';
            mainContainer.style.display = 'block';
        } else {
            alert('Yanlış şifre!');
        }
    });

    const startCallsBtn = document.getElementById('start-calls-btn');
    const fetchRecordsBtn = document.getElementById('fetch-records-btn');
    const phoneNumbersText = document.getElementById('phone-numbers');
    const systemPromptText = document.getElementById('system-prompt');
    const logOutput = document.getElementById('log-output');
    const recordsOutput = document.getElementById('records-output');

    function log(message) {
        logOutput.textContent += `[${new Date().toLocaleTimeString()}] ${message}\n`;
        logOutput.scrollTop = logOutput.scrollHeight;
    }

    startCallsBtn.addEventListener('click', async () => {
        const numbers = phoneNumbersText.value.split('\n').filter(n => n.trim() !== '');
        const systemPrompt = systemPromptText.value;

        if (numbers.length === 0) {
            log('Hata: Lütfen en az bir telefon numarası girin.');
            return;
        }
        if (!systemPrompt.trim()) {
            log('Hata: Lütfen bir sistem promptu girin.');
            return;
        }

        startCallsBtn.disabled = true;
        log(`Toplam ${numbers.length} arama başlatılıyor...`);

        for (const number of numbers) {
            const trimmedNumber = number.trim();
            log(`- ${trimmedNumber} numarası aranıyor...`);
            try {
                const response = await fetch('/.netlify/functions/start-call', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: trimmedNumber,
                        prompt: systemPrompt
                    })
                });

                const result = await response.json();

                if (response.ok) {
                    log(`  - Arama başarıyla başlatıldı. Call SID: ${result.sid}`);
                } else {
                    throw new Error(result.error || 'Bilinmeyen bir sunucu hatası oluştu.');
                }

            } catch (error) {
                log(`  - HATA: ${trimmedNumber} aranırken sorun oluştu: ${error.message}`);
            }
            // Aramalar arasında 1 saniye bekle.
            await new Promise(resolve => setTimeout(resolve, 1000)); 
        }

        log('Tüm arama istekleri gönderildi.');
        startCallsBtn.disabled = false;
    });

    fetchRecordsBtn.addEventListener('click', async () => {
        recordsOutput.textContent = 'Kayıtlar getiriliyor...';
        fetchRecordsBtn.disabled = true;

        try {
            // Not: Henüz bu fonksiyonu yazmadık, ama frontend'i hazırlıyoruz.
            const response = await fetch('/.netlify/functions/get-logs'); 
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Kayıtlar getirilemedi.');
            }
            const records = await response.json();

            if (records.length === 0) {
                recordsOutput.textContent = 'Henüz hiç arama kaydı bulunmuyor.';
            } else {
                recordsOutput.textContent = ''; // Temizle
                records.forEach(record => {
                    const recordDiv = document.createElement('div');
                    recordDiv.className = 'record-item';
                    // Gelen JSON'ı formatlı bir şekilde gösteriyoruz.
                    recordDiv.textContent = JSON.stringify(record, null, 2);
                    recordsOutput.appendChild(recordDiv);
                    recordsOutput.appendChild(document.createElement('hr'));
                });
            }

        } catch(error) {
            recordsOutput.textContent = `Hata: ${error.message}`;
        }

        fetchRecordsBtn.disabled = false;
    });
});
