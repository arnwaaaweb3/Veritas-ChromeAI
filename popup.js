document.addEventListener('DOMContentLoaded', initializePopup);

const HISTORY_KEY = 'veritasHistory'; // Declaration of HISTORY_KEY

// Utility to parse Markdown results (according to the new format in background.js)
function parseAndRenderResult(result, claimText, resultOutputDiv) {
    const rawMessage = result.message;
    
    // 1. Check if the message is an Error
    if (result.flag === 'Error') {
        renderErrorState(result.flag, rawMessage);
        return;
    }

    // Display resultOutput and hide loadingState
    document.getElementById('loadingState').style.display = 'none';
    resultOutputDiv.style.display = 'block';

    const headerDiv = document.getElementById('resultHeader');
    const claimDiv = document.getElementById('claimDisplay');
    const reasonDiv = document.getElementById('reasoningBox');
    const linkDiv = document.getElementById('linkBox');
    
    // --- Parsing Logic ---
    
    // Split based on header: Reason: and Link:
    const reasonSplit = rawMessage.split('Reason:');
    const linkSplit = (reasonSplit.length > 1) ? reasonSplit[1].split('Link:') : [rawMessage, ''];
    
    const flagClaimRaw = reasonSplit[0].trim();
    const rawReasonings = linkSplit[0].trim();
    const rawLinks = (linkSplit.length > 1) ? linkSplit[1].trim() : "";
    
    // 1. Render Header and Claim
    const firstLineMatch = flagClaimRaw.match(/^(.)+!/); // Get the first line (Flag Symbol + Text)
    const claimMatch = flagClaimRaw.match(/\*\*(.*?)\*\*/); // Get the claim between **
    
    const headerText = firstLineMatch ? firstLineMatch[0] : `[${result.flag}] ${claimText}`;

    headerDiv.className = result.flag;
    headerDiv.innerHTML = `<span class="flag-symbol">${headerText.split(' ')[0]}</span> <span>${headerText.split(' ').slice(1).join(' ')}</span>`;
    claimDiv.textContent = claimMatch ? claimMatch[1] : claimText;
    
    // 2. Render Reasonings (Convert Markdown List to HTML List)
    let reasonsHTML = '<p>Reason:</p><ul>';
    const reasonLines = rawReasonings.split('\n').filter(line => line.startsWith('-'));
    
    if (reasonLines.length > 0) {
        reasonLines.forEach(line => {
            let itemContent = line.substring(1).trim(); // Remove '-'
            // Convert Bolding **text** to <strong>text</strong> inside list item
            itemContent = itemContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); 
            reasonsHTML += `<li>${itemContent}</li>`;
        });
    } else {
        reasonsHTML += `<li>(Unstructured/undetected reasoning from AI)</li>`; 
    }
    reasonsHTML += '</ul>';
    reasonDiv.innerHTML = reasonsHTML;


    // 3. Render Links (Convert Markdown Link to HTML List)
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
                 // If link format fails, display as plain text
                 linksHTML += `<li>${line.substring(1).trim()}</li>`; 
            }
            linkRegex.lastIndex = 0; // Reset regex index
        });
    } else {
        linksHTML += `<li>(No external sources detected)</li>`; 
    }
    linksHTML += '</ul>';
    linkDiv.innerHTML = linksHTML;
}

// Utility to render error (kept old structure for brevity)
function renderErrorState(flag, message) {
    const outputDiv = document.getElementById('resultOutput');
    const loadingDiv = document.getElementById('loadingState');
    
    loadingDiv.style.display = 'none';
    outputDiv.style.display = 'block';

    const headerDiv = document.getElementById('resultHeader');
    const claimDiv = document.getElementById('claimDisplay');
    const reasonDiv = document.getElementById('reasoningBox');
    const linkDiv = document.getElementById('linkBox');
    
    // Display error message in the reasoning div so it's visible
    headerDiv.className = 'Error';
    headerDiv.innerHTML = `<span class="flag-symbol">❌</span> <span>Error Processing</span>`;
    claimDiv.textContent = 'Fact check failed completely.'; 
    reasonDiv.innerHTML = `<p style="color:red; font-weight:bold;">Error Details:</p><pre style="white-space: pre-wrap; font-size:12px;">${message}</pre>`; 
    linkDiv.innerHTML = '';
}


// 🔁 Utility to render spinner loading state
function renderLoadingState(resultBox, claim) {
    const loadingDiv = document.getElementById('loadingState');
    const outputDiv = document.getElementById('resultOutput');
    const claimText = document.getElementById('loadingClaimText');
    const factCheckTab = document.getElementById('factCheckTab');

    // Ensure Fact Check tab is visible during loading
    factCheckTab.style.display = 'block';

    outputDiv.style.display = 'none';
    loadingDiv.style.display = 'flex';
    claimText.textContent = `"${claim || 'Loading claim data...'}"`; 
}


// ✅ Main listener for result updates from background (used for live updates while loading)
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

// ✅ Get result from storage (e.g., when popup is newly opened)
function getFactCheckResult() {
  const resultOutputDiv = document.getElementById('resultOutput');
  
  chrome.storage.local.get(['lastFactCheckResult'], (storage) => {
    const result = storage.lastFactCheckResult;

    // V: PATCH 2.6: Auto-Paste Highlighted Claim
    const textClaimInput = document.getElementById('textClaimInput');
    if (result && result.claim && textClaimInput && textClaimInput.value.trim() === '') {
        // Only auto-paste if the input is empty
        textClaimInput.value = result.claim;
    }

    if (result && result.flag === 'loading') {
      renderLoadingState(resultOutputDiv, result.claim);
      return;
    }

    if (result && result.message) {
      parseAndRenderResult(result, result.claim, resultOutputDiv);
      return;
    } 

    // Default state if no result
    document.getElementById('loadingState').style.display = 'none';
    resultOutputDiv.style.display = 'block';
    document.getElementById('resultHeader').className = 'Default';
    document.getElementById('resultHeader').innerHTML = `<span class="flag-symbol">💡</span> <span>Ready to Verify!</span>`;
    document.getElementById('claimDisplay').textContent = 'Ready for a New Fact Check.'; 
    document.getElementById('reasoningBox').innerHTML = `<p>Instructions:</p><ul><li>Highlight text & right-click (Fact Check Text/Image).</li><li>Or, use the upload feature below.</li></ul>`; 
    document.getElementById('linkBox').innerHTML = '';
    
  });
}

// --- HISTORY LOGIC (START) ---

function switchTab(tabName) {
    const factCheckTab = document.getElementById('factCheckTab');
    const historyTab = document.getElementById('historyTab');
    // Ambil elemen tab baru
    const tabFCButton = document.getElementById('tabFactCheck'); 
    const tabHButton = document.getElementById('tabHistory'); 

    if (tabName === 'history') {
        factCheckTab.style.display = 'none';
        historyTab.style.display = 'block';
        
        // --- Style Changes Here ---
        // Toggle class 'active' untuk visualisasi gambar (hactive.png)
        if (tabFCButton) tabFCButton.classList.remove('active');
        if (tabHButton) tabHButton.classList.add('active');
        // --- End Style Changes ---
        
        renderHistory();
        
    } else { // 'factCheck'
        factCheckTab.style.display = 'block';
        historyTab.style.display = 'none';
        
        // --- Style Changes Here ---
        // Toggle class 'active' untuk visualisasi gambar (fcactive.png)
        if (tabHButton) tabHButton.classList.remove('active');
        if (tabFCButton) tabFCButton.classList.add('active');
        // --- End Style Changes ---
    }
}

async function renderHistory() {
    const historyList = document.getElementById('historyList');
    const status = document.getElementById('historyStatus');

    historyList.innerHTML = '';
    status.textContent = 'Loading history...'; 
    status.style.display = 'block';

    const storage = await chrome.storage.local.get([HISTORY_KEY]);
    const history = storage[HISTORY_KEY] || [];

    if (history.length === 0) {
        status.textContent = 'No fact check history yet.'; 
        return;
    }

    status.style.display = 'none';

    history.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `history-item ${item.flag}`;
        
        // Get brief summary from reasoning (text after Flag)
        const summary = item.message.split('Reason:')[0].replace(/\*\*(.*?)\*\*/, '').trim().substring(0, 100) + '...';

        const date = new Date(item.timestamp).toLocaleString();

        itemDiv.innerHTML = `
            <span class="history-timestamp">${date}</span>
            <div class="history-claim">${item.claim.substring(0, 50)}...</div>
            <div style="font-size: 12px; color: #444;">${summary}</div>
            <span class="history-flag ${item.flag}">${item.flag.toUpperCase()}</span>
        `;
        
        // Event listener to reload item from history to Fact Check tab
        itemDiv.addEventListener('click', () => {
            // Use logic from handleLiveResultUpdate to display data
            handleLiveResultUpdate({
                action: 'displayResult', 
                resultData: item 
            });
            switchTab('factCheck'); // Return to Fact Check tab
        });

        historyList.appendChild(itemDiv);
    });
  
}

// SNIPPET 4C: clearHistory function in popup.js
async function clearHistory() {
    if (confirm("Are you sure you want to delete ALL fact check history? This action cannot be undone.")) { 
        
        // Delete History array from local storage
        chrome.storage.local.remove(HISTORY_KEY, () => {
            // After deletion, refresh history display
            renderHistory(); 
            
            // Notify the user
            const status = document.getElementById('historyStatus');
            status.textContent = '✅ All history successfully deleted!'; 
            status.style.display = 'block';
        });
    }
}
// --- HISTORY LOGIC (END) ---


// --- INITIALIZATION (UPDATED LISTENER) ---

function initializePopup() {
  const splash = document.getElementById('splashScreen');
  const main = document.getElementById('mainContent');
  const video = document.getElementById('splashVideo');

  const splashDuration = 5000;
  const fadeOutTime = 500;

  chrome.runtime.onMessage.addListener(handleLiveResultUpdate);

  // V: Get 2 flags: isContextualCheck (from right-click) and hasSeenSplash (from manual open)
  chrome.storage.local.get(['isContextualCheck', 'hasSeenSplash'], (storage) => {
    const isContextualCheck = storage.isContextualCheck;
    const hasSeenSplash = storage.hasSeenSplash;
    
    // Remove contextual check flag after retrieving
    if (isContextualCheck) {
        chrome.storage.local.remove('isContextualCheck');
    }

    // Determine if Splash should be bypassed (already seen OR opened from Contextual Check)
    const shouldBypassSplash = isContextualCheck || hasSeenSplash;


    if (shouldBypassSplash) {
      if (video) video.pause();
      if (splash) splash.style.display = 'none';
      if (main) main.classList.add('visible');

      getFactCheckResult();
      setupUploadListener();
    } else {
      // V: This is the first manual run. Set flag so it doesn't appear again
      chrome.storage.local.set({ 'hasSeenSplash': true }); 
        
      if (video) {
        video.pause();
        video.currentTime = 0;
        video.play();
      }

      const endSplashAndInit = () => {
        if (splash) splash.classList.add('fade-out');
        setTimeout(() => {
          if (splash) splash.style.display = 'none';
          if (main) main.classList.add('visible');
          getFactCheckResult();
          setupUploadListener();
        }, fadeOutTime);
      };

      setTimeout(() => {
        // Fallback timer. Cek apakah splash sudah disembunyikan oleh video.addEventListener
        if (splash && splash.style.display !== 'none' && !splash.classList.contains('fade-out')) {
            endSplashAndInit();
        }
      }, splashDuration);

      if (video) {
        video.addEventListener('ended', endSplashAndInit);
      }
    }
    
    // 💡 LISTENER TAB BARU: Dijalankan setelah semua inisialisasi selesai
    // Ini menghubungkan elemen tab Fact Check dan History ke logika switchTab
    document.getElementById('tabFactCheck').addEventListener('click', () => switchTab('factCheck'));
    document.getElementById('tabHistory').addEventListener('click', () => switchTab('history'));
    switchTab('factCheck'); // Atur default tab saat popup dibuka
    
  });

  // Listener clear history tetap aktif
  document.getElementById('clearHistoryButton').addEventListener('click', clearHistory);

}


// --- UPLOAD HANDLER (No Significant Change) ---

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
      uploadStatus.textContent = '❌ Please select an image file first.'; 
      uploadStatus.style.color = 'red';
      return;
    }

    if (textClaim.length < 5) {
      uploadStatus.textContent = '❌ Claim text is mandatory (minimum 5 characters).'; 
      uploadStatus.style.color = 'red';
      return;
    }

    submitButton.disabled = true;
    fileInput.disabled = true;
    textInput.disabled = true;

    uploadStatus.textContent = '⏳ Converting image...'; 
    uploadStatus.style.color = 'blue';

    try {
      const base64Data = await readFileAsBase64(file);
      const mimeType = file.type;

      uploadStatus.textContent = '⏳ Sending to Gemini... (Check the results column above)'; 

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
            uploadStatus.textContent = '✅ Analysis Complete!'; 
            uploadStatus.style.color = 'green';
        } else {
            uploadStatus.textContent = '❌ Analysis Failed (Check the results column above)'; 
            uploadStatus.style.color = 'red';
        }
      });
      
      renderLoadingState(document.getElementById('resultOutput'), textClaim);

      // INSERT THIS LINE FOR LOADING STATE PERSISTENCE 
      chrome.storage.local.set({ 'lastFactCheckResult': 
        { flag: 'loading', 
          claim: textClaim, 
          message: 'Veritas is verifying this claim...' } 
      });

    } catch (error) {
      uploadStatus.textContent = `❌ Failed: ${error.message}`; 
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