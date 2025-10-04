// popup.js (Versi Final - Mengambil data dari Storage + Logic Tombol Upload + SPLASH)

document.addEventListener('DOMContentLoaded', initializePopup);

function initializePopup() {
    // Show splash screen for at least 500ms
    setTimeout(() => {
        hideSplashScreen();
        getFactCheckResult();
        setupUploadListener();
    }, 500); // Ensures the user sees the logo for a brief moment
}

function hideSplashScreen() {
    // Fungsi untuk menyembunyikan splash dan menampilkan main content
    const splash = document.getElementById('splashScreen');
    const main = document.getElementById('mainContent');
    
    if (splash) splash.style.display = 'none';
    if (main) main.style.display = 'block';
}

function getFactCheckResult() {
    const resultBox = document.getElementById('resultBox');
    const claimText = document.getElementById('claimText');
    
    // 1. Minta data dari local storage
    chrome.storage.local.get(['lastFactCheckResult'], (storage) => {
        const result = storage.lastFactCheckResult;

        if (result && result.message) {
            // Data ditemukan dan valid
            claimText.textContent = `Klaim: "${result.claim || 'Tidak Ada Klaim'}"`;
            resultBox.className = `result-box ${result.flag}`;
            resultBox.innerHTML = `
                <strong>Flag: ${result.flag}</strong>
                <p>${result.message}</p>
            `;
            // Opsional: Hapus data setelah ditampilkan
            chrome.storage.local.remove('lastFactCheckResult');
            
        } else {
            // Data tidak ditemukan atau error
            resultBox.className = 'result-box Kuning';
            resultBox.innerHTML = `<strong>Status:</strong> Siap untuk Cek Fakta Baru.<br>Pilih teks atau gambar di web, atau upload file di bawah!`;
            claimText.textContent = '';
        }
    });
}

function setupUploadListener() {
    const fileInput = document.getElementById('imageFileInput');
    const textInput = document.getElementById('textClaimInput');
    const uploadStatus = document.getElementById('uploadStatus');
    const submitButton = document.getElementById('submitUploadButton'); 

    submitButton.addEventListener('click', async () => { 
        const file = fileInput.files[0]; 
        const textClaim = textInput.value.trim();

        if (!file) {
            uploadStatus.textContent = '❌ Gagal: Pilih file gambar dulu.'; 
            uploadStatus.style.color = 'red';
            return;
        }

        if (textClaim.length < 5) {
            uploadStatus.textContent = '❌ Gagal: Klaim Teks Wajib diisi (min 5 karakter).'; 
            uploadStatus.style.color = 'red';
            return;
        }

        // Disable UI during processing
        submitButton.disabled = true;
        fileInput.disabled = true;
        textInput.disabled = true;
        
        uploadStatus.textContent = '✅ File diupload. Memproses Base64...';
        uploadStatus.style.color = 'blue';

        try {
            const base64Data = await readFileAsBase64(file);
            const mimeType = file.type;

            uploadStatus.textContent = '⏳ Mengirim ke Gemini Cloud untuk Fact Check...';

            // Mengirim Base64 data dan teks ke background.js untuk API call
            chrome.runtime.sendMessage({
                action: 'multimodalUpload',
                base64: base64Data.split(',')[1], // Ambil hanya Base64 murni
                mimeType: mimeType,
                claim: textClaim
            }, (response) => {
                 // Re-enable UI setelah background script selesai, terlepas dari sukses/gagal
                 submitButton.disabled = false;
                 fileInput.disabled = false;
                 textInput.disabled = false;
                 
                 // Display final status di popup
                 if (response && response.success) {
                     uploadStatus.textContent = '✅ Fact Check selesai! Klik icon Veritas untuk melihat hasil.';
                     uploadStatus.style.color = 'green';
                 } else {
                     // Jika gagal, tampilkan pesan gagal yang lebih umum
                     uploadStatus.textContent = '❌ Fact Check gagal. Cek console service worker untuk detail error.';
                     uploadStatus.style.color = 'red';
                 }
            });

            
        } catch (error) {
            uploadStatus.textContent = `❌ Gagal memproses file: ${error.message}`;
            uploadStatus.style.color = 'red';
            submitButton.disabled = false;
            fileInput.disabled = false;
            textInput.disabled = false;
        }
    });
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}