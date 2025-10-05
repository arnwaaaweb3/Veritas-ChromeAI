// popup.js (FINAL: Fade transition + splash + data handling)
document.addEventListener('DOMContentLoaded', initializePopup);

function initializePopup() {
  const splash = document.getElementById('splashScreen');
  const main = document.getElementById('mainContent');
  const video = document.getElementById('splashVideo');

  // Durasi tampilan splash (5 detik = durasi logo/video)
  const splashDuration = 5000;

  setTimeout(() => {
    // Tambahkan kelas fade-out untuk efek transisi keluar
    splash.classList.add('fade-out');

    setTimeout(() => {
      splash.style.display = 'none';
      main.classList.add('visible'); // otomatis fade-in
      getFactCheckResult();
      setupUploadListener();
    }, 800); // waktu fade-out sinkron dengan CSS (0.8s)
  }, splashDuration);

  // Jika video selesai lebih cepat dari durasi, pakai event ended
  if (video) {
    video.addEventListener('ended', () => {
      splash.classList.add('fade-out');
      setTimeout(() => {
        splash.style.display = 'none';
        main.classList.add('visible');
        getFactCheckResult();
        setupUploadListener();
      }, 800);
    });
  }
}

function getFactCheckResult() {
  const resultBox = document.getElementById('resultBox');
  const claimText = document.getElementById('claimText');

  chrome.storage.local.get(['lastFactCheckResult'], (storage) => {
    const result = storage.lastFactCheckResult;

    if (result && result.message) {
      claimText.textContent = `Klaim: "${result.claim || 'Tidak Ada Klaim'}"`;
      resultBox.className = `result-box ${result.flag}`;
      resultBox.innerHTML = `
        <strong>Flag: ${result.flag}</strong>
        <p>${result.message}</p>
      `;
      chrome.storage.local.remove('lastFactCheckResult');
    } else {
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
      uploadStatus.textContent = '❌ Gagal: Klaim teks wajib diisi (min 5 karakter).';
      uploadStatus.style.color = 'red';
      return;
    }

    submitButton.disabled = true;
    fileInput.disabled = true;
    textInput.disabled = true;

    uploadStatus.textContent = '✅ File diupload. Memproses Base64...';
    uploadStatus.style.color = 'blue';

    try {
      const base64Data = await readFileAsBase64(file);
      const mimeType = file.type;

      uploadStatus.textContent = '⏳ Mengirim ke Gemini Cloud untuk Fact Check...';

      chrome.runtime.sendMessage({
        action: 'multimodalUpload',
        base64: base64Data.split(',')[1],
        mimeType: mimeType,
        claim: textClaim
      }, (response) => {
        submitButton.disabled = false;
        fileInput.disabled = false;
        textInput.disabled = false;

        if (response && response.success) {
          uploadStatus.textContent = '✅ Fact Check selesai! Klik icon Veritas untuk melihat hasil.';
          uploadStatus.style.color = 'green';
        } else {
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
