document.addEventListener('DOMContentLoaded', initializePopup);

const HISTORY_KEY = 'veritasHistory'; // Declaration of HISTORY_KEY

// MORTA FIX: Helper function untuk mendapatkan teks display murni
function getDisplayFlag(flag) {
    switch (flag.toUpperCase()) {
        case 'HIJAU':
            return 'FACT';
        case 'MERAH':
            return 'FALSE';
        case 'KUNING':
            return 'CAUTION';
        case 'ERROR':
            return 'ERROR';
        case 'DEFAULT':
            return 'READY TO VERIFY';
        default:
            return flag.toUpperCase();
    }
}

// Map untuk semua status Hover/Default
const HOVER_TEXT_MAP = {
    'Hijau': { default: 'FACT', hover: 'THIS CLAIM IS VERIFIED' },
    'Merah': { default: 'FALSE', hover: 'THIS CLAIM IS UNVERIFIED' },
    'Kuning': { default: 'CAUTION', hover: 'THIS CLAIM IS SUSPICIOUS' },
    'Error': { default: 'ERROR', hover: 'SOMETHING WENT WRONG' },
    'Default': { default: 'READY TO VERIFY', hover: 'CHECK YOUR CLAIMS NOW!' }
};

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

    // MORTA FIX: Sembunyikan Navigation Hub jika ada result
    document.getElementById('navigationHub').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'block'; // Pastikan upload terlihat

    const headerDiv = document.getElementById('resultHeader');
    // MORTA FIX: Target inner element untuk manipulasi teks/fade
    const headerTextContent = document.getElementById('headerTextContent'); 
    
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
    // MORTA FIX: Ambil teks display murni dari helper function
    const displayHeaderText = getDisplayFlag(result.flag);

    // Menetapkan class
    headerDiv.className = result.flag;
    headerTextContent.textContent = displayHeaderText; // CHANGED: Set text ke inner element

    // == MORTA FIX: LOGIC HOVER UNIVERSAL (untuk Hijau, Merah, Kuning, Error) ==
    // 1. Hapus listener lama (best practice)
    headerDiv.onmouseover = null;
    headerDiv.onmouseout = null; 

    if (HOVER_TEXT_MAP[result.flag]) {
        const { default: defaultText, hover: hoverText } = HOVER_TEXT_MAP[result.flag];
        const fadeDuration = 200; // Matching CSS transition duration

        // 2. Mouse Over: Fade out -> Change text -> Fade in
        headerDiv.onmouseover = () => {
            headerTextContent.style.opacity = 0; // Target inner element
            setTimeout(() => {
                headerTextContent.textContent = hoverText; // Target inner element
                headerTextContent.style.opacity = 1; // Target inner element
            }, fadeDuration);
        };

        // 3. Mouse Out: Fade out -> Change text -> Fade in
        headerDiv.onmouseout = () => {
            headerTextContent.style.opacity = 0; // Target inner element
            setTimeout(() => {
                headerTextContent.textContent = defaultText; // Target inner element
                headerTextContent.style.opacity = 1; // Target inner element
            }, fadeDuration);
        };
    } 
    // =========================================================================================

    // Parsing claim from highlighted claim
    const claimMatch = flagClaimRaw.match(/\*\*(.*?)\*\*/);
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
    const MAX_LINKS_VISIBLE = 3; 

    if (linkLines.length > 0) {
        linkLines.forEach((line, index) => { // <-- FIX 2: Tambah index untuk hitung dan sembunyikan
            // Logika untuk menyembunyikan item > MAX_LINKS_VISIBLE
            const isHidden = index >= MAX_LINKS_VISIBLE;
            const hiddenStyle = isHidden ? ' style="display: none;"' : ''; 

            const linkMatch = linkRegex.exec(line);
            if (linkMatch && linkMatch.length >= 3) {
                // LinkMatch[1] = title, LinkMatch[2] = URL
                linksHTML += `<li${hiddenStyle}><a href="${linkMatch[2]}" target="_blank">${linkMatch[1]}</a></li>`;
            } else {
                // If link format fails, display as plain text
                linksHTML += `<li${hiddenStyle}>${line.substring(1).trim()}</li>`;
            }
            linkRegex.lastIndex = 0; // Reset regex index
        });
    } else {
        linksHTML += `<li>(No external sources detected)</li>`;
    }
    linksHTML += '</ul>';
    linkDiv.innerHTML = linksHTML;

    // == MORTA FIX: Logic for Show More/Hide Less Button ==
    // Hanya tampilkan tombol jika jumlah link lebih dari batas yang terlihat
    if (linkLines.length > MAX_LINKS_VISIBLE) {
        const listElement = linkDiv.querySelector('ul');
        const listItems = listElement.querySelectorAll('li'); // Semua <li> elements
        
        const button = document.createElement('button');
        button.id = 'linkToggleButton';
        // Teks awal adalah "Show more (N more)"
        button.textContent = `Show more (${linkLines.length - MAX_LINKS_VISIBLE} more)`;
        
        // Inject the button ke dalam linkBox
        linkDiv.appendChild(button);

        // Tambahkan click listener untuk toggle visibility
        let isExpanded = false;
        button.addEventListener('click', () => {
            isExpanded = !isExpanded;
            // Toggle display untuk item mulai dari index 3 (MAX_LINKS_VISIBLE)
            for (let i = MAX_LINKS_VISIBLE; i < listItems.length; i++) {
                listItems[i].style.display = isExpanded ? 'list-item' : 'none';
            }
            // Ubah teks tombol
            button.textContent = isExpanded 
                ? 'Hide less' 
                : `Show more (${linkLines.length - MAX_LINKS_VISIBLE} more)`;
        });
    }
}

// Utility to render error (kept old structure for brevity)
function renderErrorState(flag, message) {
    const outputDiv = document.getElementById('resultOutput');
    const loadingDiv = document.getElementById('loadingState');

    loadingDiv.style.display = 'none';
    outputDiv.style.display = 'block';

    // MORTA FIX: Sembunyikan Navigation Hub
    document.getElementById('navigationHub').style.display = 'none';
    document.getElementById('uploadSection').style.display = 'block'; // Pastikan upload terlihat

    const headerDiv = document.getElementById('resultHeader');
    // MORTA FIX: Target inner element
    const headerTextContent = document.getElementById('headerTextContent');
    
    const claimDiv = document.getElementById('claimDisplay');
    const reasonDiv = document.getElementById('reasoningBox');
    const linkDiv = document.getElementById('linkBox');

    // MORTA FIX: Ambil teks display murni dari helper function
    headerDiv.className = flag;

    headerTextContent.textContent = getDisplayFlag(flag); // CHANGED: Set text ke inner element
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

    // MORTA FIX: Sembunyikan Navigation Hub
    document.getElementById('navigationHub').style.display = 'none';

    outputDiv.style.display = 'none';
    loadingDiv.style.display = 'flex';
    claimText.textContent = `"${claim || 'Verifying claim data...'}"`;
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

        if (result && result.flag === 'loading') {
            renderLoadingState(resultOutputDiv, result.claim);
            return;
        }

        if (result && result.message) {
            // Jika ada result, tampilkan result dan sembunyikan hub
            document.getElementById('navigationHub').style.display = 'none';
            parseAndRenderResult(result, result.claim, resultOutputDiv);
            return;
        }

        // Default state if no result (Tampilkan Navigation Hub)
        document.getElementById('loadingState').style.display = 'none';
        resultOutputDiv.style.display = 'none';
        
        // MORTA FIX: Tampilkan Navigation Hub dan sembunyikan form upload
        document.getElementById('navigationHub').style.display = 'block';
        document.getElementById('uploadSection').style.display = 'none';

        // Set Default header (opsional, karena hub sudah ada)
        const headerDiv = document.getElementById('resultHeader');
        const headerTextContent = document.getElementById('headerTextContent'); 
        headerDiv.className = 'Default';
        const defaultText = HOVER_TEXT_MAP['Default'].default;
        headerTextContent.textContent = defaultText; 
        
        // Bersihkan konten lama (penting jika navigasi dari result ke hub)
        document.getElementById('claimDisplay').textContent = '';
        document.getElementById('reasoningBox').innerHTML = '';
        document.getElementById('linkBox').innerHTML = '';
        
        // Set up hover for default header (tetap dipertahankan untuk tampilan di hub)
        const hoverText = HOVER_TEXT_MAP['Default'].hover;
        const fadeDuration = 200;

        headerDiv.onmouseover = () => {
            headerTextContent.style.opacity = 0;
            setTimeout(() => {
                headerTextContent.textContent = hoverText;
                headerTextContent.style.opacity = 1;
            }, fadeDuration);
        };

        headerDiv.onmouseout = () => {
            headerTextContent.style.opacity = 0;
            setTimeout(() => {
                headerTextContent.textContent = defaultText;
                headerTextContent.style.opacity = 1;
            }, fadeDuration);
        };

    });
}

// --- HISTORY LOGIC (START) ---
// ... (Logic tetap sama) ...

function switchTab(tabName) {
    const factCheckTab = document.getElementById('factCheckTab');
    const historyTab = document.getElementById('historyTab');
    const tabFCButton = document.getElementById('tabFactCheck');
    const tabHButton = document.getElementById('tabHistory');

    if (tabName === 'history') {
        factCheckTab.style.display = 'none';
        historyTab.style.display = 'block';

        if (tabFCButton) tabFCButton.classList.remove('active');
        if (tabHButton) tabHButton.classList.add('active');

        renderHistory();

    } else { // 'factCheck'
        factCheckTab.style.display = 'block';
        historyTab.style.display = 'none';
        
        // MORTA FIX: Saat kembali ke FactCheck tab, panggil getFactCheckResult
        // Ini akan menentukan apakah harus menampilkan Hub atau Result/Upload terakhir.
        getFactCheckResult(); 

        if (tabHButton) tabHButton.classList.remove('active');
        if (tabFCButton) tabFCButton.classList.add('active');
    }
}

async function renderHistory() {
    const historyList = document.getElementById('historyList');
    const status = document.getElementById('historyStatus');

    // ... (rest of renderHistory remains the same) ...
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

        // MORTA FIX: Menghapus span.flag-symbol di history karena kita pakai border-left-color.
        itemDiv.innerHTML = `
            <span class="history-timestamp">${date}</span>
            <div class="history-claim">${item.claim.substring(0, 50)}...</div>
            <div style="font-size: 12px; color: #444;">${summary}</div>
            <span class="history-flag ${item.flag}">${item.flag.toUpperCase()}</span>
        `;

        itemDiv.addEventListener('click', () => {
            handleLiveResultUpdate({
                action: 'displayResult',
                resultData: item
            });
            switchTab('factCheck');
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

    chrome.storage.local.get(['isContextualCheck', 'hasSeenSplash'], (storage) => {
        const isContextualCheck = storage.isContextualCheck;
        const hasSeenSplash = storage.hasSeenSplash;

        if (isContextualCheck) {
            chrome.storage.local.remove('isContextualCheck');
        }

        const shouldBypassSplash = isContextualCheck || hasSeenSplash;


        if (shouldBypassSplash) {
            if (video) video.pause();
            if (splash) splash.style.display = 'none';
            if (main) main.classList.add('visible');

            getFactCheckResult();
            setupUploadListener();
        } else {
            chrome.storage.local.set({ 'hasSeenSplash': true });

            if (video) video.pause();
            if (video) video.currentTime = 0;
            if (video) video.play();

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
                if (splash && splash.style.display !== 'none' && !splash.classList.contains('fade-out')) {
                    endSplashAndInit();
                }
            }, splashDuration);

            if (video) {
                video.addEventListener('ended', endSplashAndInit);
            }
        }

        document.getElementById('tabFactCheck').addEventListener('click', () => switchTab('factCheck'));
        document.getElementById('tabHistory').addEventListener('click', () => switchTab('history'));
        switchTab('factCheck');

    });

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
            chrome.storage.local.set({
                'lastFactCheckResult':
                {
                    flag: 'loading',
                    claim: textClaim,
                    message: 'Veritas is verifying this claim...'
                }
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