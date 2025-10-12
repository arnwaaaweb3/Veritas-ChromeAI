// settings.js

document.addEventListener('DOMContentLoaded', restoreKey);

document.getElementById('saveButton').addEventListener('click', saveKey);

function saveKey() {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    const status = document.getElementById('status');

    if (apiKey.length < 30) {
        status.textContent = '❌ Key terlalu pendek. Pastikan sudah disalin dengan benar!';
        status.style.color = 'red';
        return;
    }

    // Menggunakan chrome.storage.local.set untuk menyimpan data dengan aman
    chrome.storage.local.set({ 'geminiApiKey': apiKey }, () => {
        status.textContent = '✅ API Key berhasil disimpan!';
        status.style.color = 'green';
        // Memberi jeda sebentar sebelum memuat ulang status
        setTimeout(() => {
            restoreKey();
        }, 750);
    });
}

function restoreKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const status = document.getElementById('status');

    // Menggunakan chrome.storage.local.get untuk mengambil data
    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            // Tampilkan hanya sebagian key sebagai indikasi sudah tersimpan
            apiKeyInput.value = '**********' + result.geminiApiKey.slice(-5);
            status.textContent = `Key tersimpan: ${result.geminiApiKey.slice(0, 5)}...${result.geminiApiKey.slice(-5)}`;
            status.style.color = 'blue';
        } else {
            apiKeyInput.value = '';
            status.textContent = 'Belum ada API Key yang tersimpan.';
            status.style.color = 'black';
        }
    });
}