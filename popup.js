// popup.js (FINAL & STABIL: Structured Reasoning Rendering + History Fixes)
document.addEventListener('DOMContentLoaded', initializePopup);

const HISTORY_KEY = 'veritasHistory'; // Deklarasi HISTORY_KEY

// Utility untuk memisahkan hasil Markdown (sesuai format baru di background.js)
function parseAndRenderResult(result, claimText, resultOutputDiv) {
    const rawMessage = result.message;
    
    // 1. Cek jika pesan adalah Error
    if (result.flag === 'Error') {
        renderErrorState(result.flag, rawMessage);
        return;
    }

    // Tampilkan resultOutput dan sembunyikan loadingState
    document.getElementById('loadingState').style.display = 'none';
    resultOutputDiv.style.display = 'block';

    const headerDiv = document.getElementById('resultHeader');
    const claimDiv = document.getElementById('claimDisplay');
    const reasonDiv = document.getElementById('reasoningBox');
    const linkDiv = document.getElementById('linkBox');
    
    // --- Parsing Logic ---
    
    // Pisahkan berdasarkan header: Reason: dan Link:
    const reasonSplit = rawMessage.split('Reason:');
    const linkSplit = (reasonSplit.length > 1) ? reasonSplit[1].split('Link:') : [rawMessage, ''];
    
    const flagClaimRaw = reasonSplit[0].trim();
    const rawReasonings = linkSplit[0].trim();
    const rawLinks = (linkSplit.length > 1) ? linkSplit[1].trim() : "";
    
    // 1. Render Header dan Klaim
    const firstLineMatch = flagClaimRaw.match(/^(.)+!/); // Ambil baris pertama (Flag Symbol + Text)
    const claimMatch = flagClaimRaw.match(/\*\*(.*?)\*\*/); // Ambil klaim di antara **
    
    const headerText = firstLineMatch ? firstLineMatch[0] : `[${result.flag}] ${claimText}`;

    headerDiv.className = result.flag;
    headerDiv.innerHTML = `<span class="flag-symbol">${headerText.split(' ')[0]}</span> <span>${headerText.split(' ').slice(1).join(' ')}</span>`;
    claimDiv.textContent = claimMatch ? claimMatch[1] : claimText;
    
    // 2. Render Reasonings (Mengubah Markdown List ke HTML List)
    let reasonsHTML = '<p>Reason:</p><ul>';
    const reasonLines = rawReasonings.split('\n').filter(line => line.startsWith('-')).slice(0, 3); // Ambil maks 3 poin
    
    if (reasonLines.length > 0) {
        reasonLines.forEach(line => {
            reasonsHTML += `<li>${line.substring(1).trim()}</li>`; // Hapus tanda '-'
        });
    } else {
        reasonsHTML += `<li>(Alasan tidak terstruktur/terdeteksi dari AI)</li>`;
    }
    reasonsHTML += '</ul>';
    reasonDiv.innerHTML = reasonsHTML;


    // 3. Render Links (Mengubah Markdown Link ke HTML List)
    let linksHTML = '<p>Link:</p><ul>';
    const linkLines = rawLinks.split('\n').filter(line => line.startsWith('-'));
    const linkRegex = /\[(.*?)\]\((.*?)\)/g;

    if (linkLines.length > 0) {
        linkLines.forEach(line => {
            const linkMatch = linkRegex.exec(line);
            if (linkMatch && linkMatch.length >= 3) {
                // LinkMatch[1] = title, LinkMatch[2] = URL
                linksHTML += `<li><a href="${linkMatch[2]}" target="_blank">${linkMatch[1]}</a></li>`;
            } else {
                 // Jika format link gagal, tampilkan sebagai teks biasa
                 linksHTML += `<li>${line.substring(1).trim()}</li>`; 
            }
            linkRegex.lastIndex = 0; // Reset regex index
        });
    } else {
        linksHTML += `<li>(Tidak ada sumber eksternal yang terdeteksi)</li>`;
    }
    linksHTML += '</ul>';
    linkDiv.innerHTML = linksHTML;
}

// Utility untuk render error (tetap pakai struktur lama agar ringkas)
function renderErrorState(flag, message) {
    const outputDiv = document.getElementById('resultOutput');
    const loadingDiv = document.getElementById('loadingState');
    
    loadingDiv.style.display = 'none';
    outputDiv.style.display = 'block';

    const headerDiv = document.getElementById('resultHeader');
    const claimDiv = document.getElementById('claimDisplay');
    const reasonDiv = document.getElementById('reasoningBox');
    const linkDiv = document.getElementById('linkBox');
    
    // Tampilkan pesan error di div reasoning agar terlihat
    headerDiv.className = 'Error';
    headerDiv.innerHTML = `<span class="flag-symbol">❌</span> <span>Error Processing</span>`;
    claimDiv.textContent = 'Pengecekan gagal total.';
    reasonDiv.innerHTML = `<p style="color:red; font-weight:bold;">Detail Error:</p><pre style="white-space: pre-wrap; font-size:12px;">${message}</pre>`;
    linkDiv.innerHTML = '';
}


// 🔁 Utility untuk render spinner loading state
function renderLoadingState(resultBox, claim) {
    const loadingDiv = document.getElementById('loadingState');
    const outputDiv = document.getElementById('resultOutput');
    const claimText = document.getElementById('loadingClaimText');
    const factCheckTab = document.getElementById('factCheckTab');

    // Pastikan Fact Check tab terlihat saat loading
    factCheckTab.style.display = 'block';

    outputDiv.style.display = 'none';
    loadingDiv.style.display = 'flex';
    claimText.textContent = `"${claim || 'Memuat data klaim...'}"`;
}


// ✅ Listener utama untuk update hasil dari background (digunakan untuk update live saat sedang loading)
function handleLiveResultUpdate(request, sender, sendResponse) {
  if (request.action === 'updateFinalResult' || request.action === 'displayResult' || request.action === 'finalResultUpdate') {
    const resultOutputDiv = document.getElementById('resultOutput');

    const { flag, message, claim } = request.resultData;
    
    if (flag === 'loading') {
      renderLoadingState(resultOutputDiv, claim);
      return;
    }

    parseAndRenderResult(request.resultData, claim, resultOutputDiv);
  }
}

// ✅ Ambil hasil dari storage (misal ketika popup baru dibuka)
function getFactCheckResult() {
  const resultOutputDiv = document.getElementById('resultOutput');
  
  chrome.storage.local.get(['lastFactCheckResult'], (storage) => {
    const result = storage.lastFactCheckResult;

    if (result && result.flag === 'loading') {
      renderLoadingState(resultOutputDiv, result.claim);
      return;
    }

    if (result && result.message) {
      parseAndRenderResult(result, result.claim, resultOutputDiv);
      return;
    } 

    // Default state jika tidak ada hasil
    document.getElementById('loadingState').style.display = 'none';
    resultOutputDiv.style.display = 'block';
    document.getElementById('resultHeader').className = 'Kuning';
    document.getElementById('resultHeader').innerHTML = `<span class="flag-symbol">💡</span> <span>Ready for Action</span>`;
    document.getElementById('claimDisplay').textContent = 'Siap untuk Cek Fakta Baru.';
    document.getElementById('reasoningBox').innerHTML = `<p>Instruksi:</p><ul><li>Sorot teks & klik kanan (Cek Fakta Teks/Gambar).</li><li>Atau, gunakan fitur upload di bawah.</li></ul>`;
    document.getElementById('linkBox').innerHTML = '';
    
  });
}

// --- HISTORY LOGIC (START) ---

function switchTab(tabName) {
    const factCheckTab = document.getElementById('factCheckTab');
    const historyTab = document.getElementById('historyTab');
    const tabFCButton = document.getElementById('tabFactCheck');
    const tabHButton = document.getElementById('tabHistory');

    if (tabName === 'history') {
        factCheckTab.style.display = 'none';
        historyTab.style.display = 'block';
        
        // --- Perubahan Style di Sini ---
        tabFCButton.classList.remove('active');
        tabHButton.classList.add('active');
        // --- End Perubahan Style ---
        
        renderHistory();
        
    } else { // 'factCheck'
        factCheckTab.style.display = 'block';
        historyTab.style.display = 'none';
        
        // --- Perubahan Style di Sini ---
        tabHButton.classList.remove('active');
        tabFCButton.classList.add('active');
        // --- End Perubahan Style ---
    }
}

async function renderHistory() {
    const historyList = document.getElementById('historyList');
    const status = document.getElementById('historyStatus');

    historyList.innerHTML = '';
    status.textContent = 'Memuat riwayat...';
    status.style.display = 'block';

    const storage = await chrome.storage.local.get([HISTORY_KEY]);
    const history = storage[HISTORY_KEY] || [];

    if (history.length === 0) {
        status.textContent = 'Belum ada riwayat pengecekan fakta.';
        return;
    }

    status.style.display = 'none';

    history.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `history-item ${item.flag}`;
        
        // Ambil summary singkat dari reasoning (teks setelah Flag)
        const summary = item.message.split('Reason:')[0].replace(/\*\*(.*?)\*\*/, '').trim().substring(0, 100) + '...';

        const date = new Date(item.timestamp).toLocaleString();

        itemDiv.innerHTML = `
            <span class="history-timestamp">${date}</span>
            <div class="history-claim">${item.claim.substring(0, 50)}...</div>
            <div style="font-size: 12px; color: #444;">${summary}</div>
            <span class="history-flag ${item.flag}">${item.flag.toUpperCase()}</span>
        `;
        
        // Event listener untuk memuat kembali item dari history ke Fact Check tab
        itemDiv.addEventListener('click', () => {
            // Kita gunakan logic dari handleLiveResultUpdate untuk menampilkan data
            handleLiveResultUpdate({
                action: 'displayResult', 
                resultData: item 
            });
            switchTab('factCheck'); // Kembali ke Fact Check tab
        });

        historyList.appendChild(itemDiv);
    });
  
}

// SNIPPET 4C: Fungsi clearHistory di popup.js
async function clearHistory() {
    if (confirm("Apakah Anda yakin ingin menghapus SEMUA riwayat pengecekan fakta? Aksi ini tidak dapat dibatalkan.")) {
        
        // Hapus array History dari local storage
        chrome.storage.local.remove(HISTORY_KEY, () => {
            // Setelah dihapus, refresh tampilan history
            renderHistory(); 
            
            // Beri notifikasi ke user
            const status = document.getElementById('historyStatus');
            status.textContent = '✅ Semua riwayat berhasil dihapus!';
            status.style.display = 'block';
        });
    }
}
// --- HISTORY LOGIC (END) ---


// --- INITIALIZATION (FIXED) ---

function initializePopup() {
  const splash = document.getElementById('splashScreen');
  const main = document.getElementById('mainContent');
  const video = document.getElementById('splashVideo');

  const splashDuration = 5000;
  const fadeOutTime = 500;

  chrome.runtime.onMessage.addListener(handleLiveResultUpdate);

  chrome.storage.local.get(['isContextualCheck'], (storage) => {
    if (storage.isContextualCheck) {
      chrome.storage.local.remove('isContextualCheck');

      if (video) video.pause();
      if (splash) splash.style.display = 'none';
      if (main) main.classList.add('visible');

      getFactCheckResult();
      setupUploadListener();
      // Tab initialization moved outside
    } else {
      if (video) {
        video.pause();
        video.currentTime = 0;
        video.play();
      }

      setTimeout(() => {
        if (splash) splash.classList.add('fade-out');
        setTimeout(() => {
          if (splash) splash.style.display = 'none';
          if (main) main.classList.add('visible');
          getFactCheckResult();
          setupUploadListener();
          // Tab initialization moved outside
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
              // Tab initialization moved outside
            }, fadeOutTime);
          }
        });
      }
    }
    
    // FIX BUG KRITIS #2: Initialization tombol tab dipindahkan ke luar conditional
    document.getElementById('tabFactCheck').addEventListener('click', () => switchTab('factCheck'));
    document.getElementById('tabHistory').addEventListener('click', () => switchTab('history'));
    switchTab('factCheck'); // Set default tab
  });

  // SNIPPET 4B: Listener di popup.js
  document.getElementById('clearHistoryButton').addEventListener('click', clearHistory);

}


// --- UPLOAD HANDLER (Tidak Berubah Signifikan) ---

function setupUploadListener() {
  const fileInput = document.getElementById('imageFileInput');
  const textInput = document.getElementById('textClaimInput');
  const uploadStatus = document.getElementById('uploadStatus');
  const submitButton = document.getElementById('submitUploadButton');

  if (!submitButton) return;

  submitButton.addEventListener('click', async () => {
    const file = fileInput.files[0];
    const textClaim = textInput.value.trim();

    if (!file) {
      uploadStatus.textContent = '❌ Pilih file gambar dulu.';
      uploadStatus.style.color = 'red';
      return;
    }

    if (textClaim.length < 5) {
      uploadStatus.textContent = '❌ Klaim teks wajib diisi (minimal 5 karakter).';
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

      uploadStatus.textContent = '⏳ Mengirim ke Gemini... (Cek di kolom hasil di atas)';

      chrome.runtime.sendMessage({
        action: 'multimodalUpload',
        base64: base64Data.split(',')[1],
        mimeType: mimeType,
        claim: textClaim
      }, (response) => {
        submitButton.disabled = false;
        fileInput.disabled = false;
        textInput.disabled = false;
        uploadStatus.textContent = ''; 

        if (response && response.success) {
            uploadStatus.textContent = '✅ Analisis Selesai!';
            uploadStatus.style.color = 'green';
        } else {
            uploadStatus.textContent = '❌ Gagal Analisis (Cek di kolom hasil di atas)';
            uploadStatus.style.color = 'red';
        }
      });
      
      renderLoadingState(document.getElementById('resultOutput'), textClaim);

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