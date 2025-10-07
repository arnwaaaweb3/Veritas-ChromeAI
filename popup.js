// popup.js (UPDATED - Loading Spinner Support + Live Reactive Popup Update)
document.addEventListener('DOMContentLoaded', initializePopup);

function initializePopup() {
  const splash = document.getElementById('splashScreen');
  const main = document.getElementById('mainContent');
  const video = document.getElementById('splashVideo');

  const splashDuration = 5000;
  const fadeOutTime = 800;

  // Dengarkan update real-time dari background
  chrome.runtime.onMessage.addListener(handleLiveResultUpdate);

  chrome.storage.local.get(['isContextualCheck'], (storage) => {
    if (storage.isContextualCheck) {
      chrome.storage.local.remove('isContextualCheck');

      if (video) video.pause();
      if (splash) splash.style.display = 'none';
      if (main) main.classList.add('visible');

      // Langsung tampilkan loading state
      getFactCheckResult();
      setupUploadListener();
    } else {
      if (video) {
        video.pause();
        video.currentTime = 0;
        video.play();
      }

      setTimeout(() => {
        splash.classList.add('fade-out');
        setTimeout(() => {
          splash.style.display = 'none';
          main.classList.add('visible');
          getFactCheckResult();
          setupUploadListener();
        }, fadeOutTime);
      }, splashDuration);

      if (video) {
        video.addEventListener('ended', () => {
          if (splash && splash.style.display !== 'none') {
            splash.classList.add('fade-out');
            setTimeout(() => {
              splash.style.display = 'none';
              main.classList.add('visible');
              getFactCheckResult();
              setupUploadListener();
            }, fadeOutTime);
          }
        });
      }
    }
  });
}

// ✅ Listener utama untuk update hasil dari background
function handleLiveResultUpdate(request, sender, sendResponse) {
  if (request.action === 'updateFinalResult' || request.action === 'displayResult') {
    const resultBox = document.getElementById('resultBox');
    const claimText = document.getElementById('claimText');
    const main = document.getElementById('mainContent');

    if (main) main.classList.add('visible');
    if (!resultBox || !claimText) return;

    const { flag, message, claim } = request.resultData;

    // --- 🔄 HANDLE LOADING STATE ---
    if (flag === 'loading') {
      renderLoadingState(resultBox, claim);
      return;
    }

    // --- ✅ HANDLE FINAL RESULT ---
    claimText.textContent = `Klaim: "${claim || 'Tidak Ada Klaim'}"`;
    resultBox.className = `result-box ${flag}`;
    resultBox.innerHTML = `
      <strong>Flag: ${flag}</strong>
      <p>${message}</p>
    `;
    resultBox.style.transition = 'all 0.3s ease';
    resultBox.style.opacity = 1;

    chrome.storage.local.remove('lastFactCheckResult');
  }
}

// ✅ Ambil hasil dari storage (misal ketika popup baru dibuka)
function getFactCheckResult() {
  const resultBox = document.getElementById('resultBox');
  const claimText = document.getElementById('claimText');

  chrome.storage.local.get(['lastFactCheckResult'], (storage) => {
    const result = storage.lastFactCheckResult;

    if (!resultBox || !claimText) return;

    if (result && result.flag === 'loading') {
      renderLoadingState(resultBox, result.claim);
      return;
    }

    if (result && result.message) {
      claimText.textContent = `Klaim: "${result.claim || 'Tidak Ada Klaim'}"`;
      resultBox.className = `result-box ${result.flag}`;
      resultBox.innerHTML = `
        <strong>Flag: ${result.flag}</strong>
        <p>${result.message}</p>
      `;
    } else {
      resultBox.className = 'result-box Kuning';
      resultBox.innerHTML = `<strong>Status:</strong> Siap untuk Cek Fakta Baru.<br>Pilih teks/gambar atau upload file di bawah!`;
      claimText.textContent = '';
    }
  });
}

// 🔁 Utility untuk render spinner loading state
function renderLoadingState(resultBox, claim) {
  resultBox.className = 'result-box loading';
  resultBox.innerHTML = `
    <div class="spinner"></div>
    <p><strong>Memverifikasi klaim...</strong></p>
    <p class="smallText">"${claim || 'Memuat data klaim...'}"</p>
  `;
}

// ✅ Upload Listener tetap sama
function setupUploadListener() {
  const fileInput = document.getElementById('imageFileInput');
  const textInput = document.getElementById('textClaimInput');
  const uploadStatus = document.getElementById('uploadStatus');
  const submitButton = document.getElementById('submitUploadButton');

  submitButton.addEventListener('click', async () => {
    const file = fileInput.files[0];
    const textClaim = textInput.value.trim();

    if (!file) {
      uploadStatus.textContent = '❌ Pilih file gambar dulu.';
      uploadStatus.style.color = 'red';
      return;
    }

    if (textClaim.length < 5) {
      uploadStatus.textContent = '❌ Klaim teks wajib diisi.';
      uploadStatus.style.color = 'red';
      return;
    }

    submitButton.disabled = true;
    fileInput.disabled = true;
    textInput.disabled = true;

    uploadStatus.textContent = '⏳ Mengonversi gambar...';
    uploadStatus.style.color = 'blue';

    try {
      const base64Data = await readFileAsBase64(file);
      const mimeType = file.type;

      uploadStatus.textContent = '⏳ Mengirim ke Gemini...';

      chrome.runtime.sendMessage({
        action: 'multimodalUpload',
        base64: base64Data.split(',')[1],
        mimeType: mimeType,
        claim: textClaim
      });

    } catch (error) {
      uploadStatus.textContent = `❌ Gagal: ${error.message}`;
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
