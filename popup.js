// popup.js (Versi Final - Mengambil data dari Storage saat terbuka)

document.addEventListener('DOMContentLoaded', getFactCheckResult);

function getFactCheckResult() {
    const resultBox = document.getElementById('resultBox');
    const claimText = document.getElementById('claimText');
    
    // 1. Minta data dari local storage
    chrome.storage.local.get(['lastFactCheckResult'], (storage) => {
        const result = storage.lastFactCheckResult;

        if (result && result.message) {
            // Data ditemukan dan valid

            // Tampilkan klaim awal
            claimText.textContent = `Klaim: "${result.claim || 'Tidak Ada Klaim'}"`;

            // Atur tampilan berdasarkan Flag
            resultBox.className = `result-box ${result.flag}`;
            resultBox.innerHTML = `
                <strong>Flag: ${result.flag}</strong>
                <p>${result.message}</p>
            `;
            
            // Opsional: Hapus data setelah ditampilkan
            chrome.storage.local.remove('lastFactCheckResult');
            
        } else {
            // Data tidak ditemukan atau error
            resultBox.className = 'result-box Error';
            resultBox.innerHTML = `<strong>Status:</strong> Siap untuk Cek Fakta Baru.<br>Silakan sorot teks, klik kanan, lalu klik icon Veritas!`;
            claimText.textContent = '';
        }
    });
}