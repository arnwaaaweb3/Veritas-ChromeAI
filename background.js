// background.js (PATCH FINAL V6: Robustness, Security, Notifications & Retry)

// --- LOCAL AI HELPER FUNCTIONS (START) ---
function isLocalAiAvailable() {
    return (typeof chrome !== 'undefined' && typeof chrome.ai !== 'undefined');
}

async function runLocalPreProcessing(claimText) {
    if (!isLocalAiAvailable()) {
        console.warn("[Veritas LocalAI] Chrome AI tidak tersedia. Melewati pre-processing lokal.");
        return claimText;
    }

    try {
        console.log("[Veritas LocalAI] Mulai pre-processing lokal menggunakan Prompt API.");
        const localPrompt = 
        `Sederhanakan kalimat ini menjadi klaim satu baris yang paling mudah diverifikasi. 
        Fokus pada fakta inti: "${claimText}"`;
        
        const response = await chrome.ai.generateContent({
            model: 'text_model', 
            prompt: localPrompt,
            config: { maxOutputTokens: 128 }
        });

        const simplifiedText = response.text.trim();
        
        if (simplifiedText && simplifiedText.length > 5 && simplifiedText.length < claimText.length * 1.5) { 
             console.log("[Veritas LocalAI] Klaim disederhanakan:", simplifiedText);
             return simplifiedText;
        } else {
             console.warn("[Veritas LocalAI] Hasil penyederhanaan lokal tidak valid. Menggunakan klaim asli.");
             return claimText;
        }

    } catch (error) {
        console.error("[Veritas LocalAI] Gagal menjalankan Prompt API lokal:", error);
        return claimText; 
    }
}
// --- LOCAL AI HELPER FUNCTIONS (END) ---

// --- HISTORY LOGIC (START) ---
const HISTORY_KEY = 'veritasHistory';
const MAX_HISTORY_ITEMS = 20;

async function saveFactCheckToHistory(result) {
    if (!result || result.flag === 'Error') return;

    const historyItem = {
        ...result,
        timestamp: Date.now()
    };

    const storage = await chrome.storage.local.get([HISTORY_KEY]);
    const history = storage[HISTORY_KEY] || [];

    history.unshift(historyItem);

    if (history.length > MAX_HISTORY_ITEMS) {
        history.splice(MAX_HISTORY_ITEMS);
    }

    chrome.storage.local.set({ [HISTORY_KEY]: history });
    console.log("[Veritas History] Hasil Fact Check berhasil disimpan.");
}
// --- HISTORY LOGIC (END) ---


// FUNGSI 1: MENGIRIM HASIL KE POPUP
function sendResultToPopup(result, isContextual = false) { 
    chrome.storage.local.set({ 
        'lastFactCheckResult': result,
        'isContextualCheck': isContextual 
    }, () => {
        chrome.action.openPopup(); 
    });
}

// FUNGSI BARU: Mengirim Notifikasi Chrome (PATCH: Interactive Error)
function sendFactCheckNotification(claimText, isSuccess) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/veritas48.png', 
        title: isSuccess ? '✅ Fact Check Selesai!' : '❌ Fact Check Gagal',
        message: isSuccess 
            ? `Klaim: "${claimText}". Klik icon Veritas untuk melihat hasilnya.`
            : `Gagal memproses klaim "${claimText}". Silakan coba lagi.`,
        // V: requireInteraction: true HANYA jika GAGAL (isSuccess = false)
        requireInteraction: !isSuccess 
    });
}

// ====================================================================
// FUNGSI 2: CONTEXT MENU SETUP
// ====================================================================

chrome.runtime.onInstalled.addListener(() => {
    // Menu 1: Cek Fakta Teks (Selection)
    chrome.contextMenus.create({
        id: "veritasFactCheckText",
        title: "Veritas: Cek Fakta Klaim Teks",
        contexts: ["selection"] 
    });

    // Menu 2: Cek Fakta Multimodal (Gambar)
    chrome.contextMenus.create({
        id: "veritasFactCheckMultimodal",
        title: "Veritas: Cek Fakta Klaim + Gambar",
        contexts: ["image"] 
    });
    console.log("Veritas Context Menu Teks & Multimodal dibuat.");
});

// ====================================================================
// FUNGSI 3: LISTENER UTAMA CONTEXT MENU (Klik Kanan) (PATCH: Retry Logic)
// ====================================================================

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    
    const selectedText = info.selectionText;
    
    if (info.menuItemId === "veritasFactCheckText" || info.menuItemId === "veritasFactCheckMultimodal") {
        
        if (!selectedText || selectedText.trim().length === 0) {
            let result = { flag: "Error", message: "Silakan sorot teks yang ingin Anda periksa faktanya.", claim: "Pengecekan Gagal" };
            sendResultToPopup(result);
            return;
        }

        const isTextMode = info.menuItemId === "veritasFactCheckText";
        const currentTabId = tab.id;

        // 1. Set status Loading DAN kirim ke Floating Panel (context_result.js)
        const loadingResult = {
            flag: 'loading',
            claim: selectedText,
            message: "Veritas sedang memverifikasi klaim ini..."
        };

        // Inject content script (context_result.js)
        await chrome.scripting.executeScript({
            target: { tabId: currentTabId },
            files: ['context_result.js'] 
        });
        
        // V: Kirim update loading ke panel yang baru di-inject DENGAN RETRY (Fix Race Condition)
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await chrome.tabs.sendMessage(currentTabId, { action: 'finalResultUpdate', resultData: loadingResult });
                console.log(`[Veritas Context] Loading state sent after ${attempt + 1} attempt(s).`);
                break;
            } catch (e) {
                console.warn(`[Veritas Context] Gagal kirim pesan (attempt ${attempt + 1}). Mencoba lagi...`, e);
                await new Promise(res => setTimeout(res, 200)); // Tunggu 200ms
            }
        }

        // Simpan juga loading state ke storage (untuk popup jika dibuka)
        chrome.storage.local.set({
            'lastFactCheckResult': loadingResult,
            'isContextualCheck': true 
        });


        let result = null;
        
        if (isTextMode) {
            // Jalankan API Call (Async)
            result = await runFactCheckHybrid(selectedText); 
        } else {
            // Jalankan API Call Multimodal 
            const imageUrl = info.srcUrl; 
            const text = info.selectionText || "TIDAK ADA TEKS SOROTAN.";
            result = await runFactCheckMultimodalUrl(imageUrl, text);
        }

        // 2. Setelah API Selesai, kirim hasil ke Floating Panel di halaman aktif
        if (result) {
            sendFactCheckNotification(selectedText, result.flag !== 'Error');
            chrome.storage.local.set({'lastFactCheckResult': result});

            // ✅ Langsung update Floating Panel di tab aktif
            chrome.tabs.sendMessage(currentTabId, {
                action: 'finalResultUpdate',
                resultData: result
            });
        }
    }
});

// ====================================================================
// FUNGSI 4: LISTENER UNTUK UPLOAD DARI POPUP
// ====================================================================

chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        if (request.action === 'multimodalUpload') {
            const { base64, mimeType, claim } = request;
            
            console.log("[Veritas Upload] Menerima Base64 data dari popup.");

            runFactCheckMultimodalDirect(base64, mimeType, claim).then(result => {
                sendFactCheckNotification(claim, result.flag !== 'Error');
                chrome.storage.local.set({'lastFactCheckResult': result});

                chrome.runtime.sendMessage({
                    action: 'updateFinalResult',
                    resultData: result
                });
                sendResponse({ success: true, result: result }); 
                
            }).catch(error => {
                const errorResult = { flag: "Error", message: `Gagal Fact Check Upload: ${error.message}`, claim: claim };
                sendFactCheckNotification(claim, false);
                chrome.storage.local.set({'lastFactCheckResult': errorResult});

                chrome.runtime.sendMessage({ action: "updateFinalResult", resultData: errorResult });
                sendResponse({ success: false, error: errorResult });
            });

            return true; 
        }
    }
);

// ====================================================================
// FUNGSI 5: RUN FACT CHECK HYBRID (TEKS ONLY) (PATCH: Robust Parsing)
// ====================================================================

async function runFactCheckHybrid(text) {
    try {
        const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
        const geminiApiKey = resultStorage.geminiApiKey;
        
        // --- 1. HANDLE NO API KEY / FALLBACK KE LOCAL AI ---
        if (!geminiApiKey) {
            if (isLocalAiAvailable()) {
                console.log("[Veritas Hybrid] API Key hilang. Melakukan verifikasi menggunakan AI Lokal (On-Device).");

                const localPrompt = 
                `Anda adalah Veritas AI, spesialis cek fakta. 
                VERIFIKASI klaim ini: "${text}", berdasarkan pengetahuan internal Anda. 
                Balas dengan satu kata kunci di awal: 'FAKTA', 'MISINFORMASI', atau 'HATI-HATI'.
                Diikuti dengan alasan singkat dan jelas.`;

                const localResult = await chrome.ai.generateContent({
                    model: 'gemini-flash', 
                    prompt: localPrompt,
                    config: { maxOutputTokens: 256 }
                });

                const aiResponse = localResult.text.trim();
                const upperResponse = aiResponse.toUpperCase();
                let flag = "Kuning";
                if (upperResponse.startsWith("FAKTA")) { flag = "Hijau"; } 
                else if (upperResponse.startsWith("MISINFORMASI")) { flag = "Merah"; }

                const finalResult = {
                    flag: flag,
                    message: aiResponse + " [VERIFIKASI INI HANYA BERDASARKAN PENGETAHUAN LOKAL/INTERNAL CHROME. Mohon masukkan API Key untuk verifikasi Real-Time (Grounding).]",
                    claim: text
                };
                
                // PANGGIL HISTORY
                saveFactCheckToHistory(finalResult);
                
                return finalResult;
            }

            return { 
                flag: "Error", 
                message: "API Key Gemini belum diatur. Buka Pengaturan Veritas (klik kanan ikon ekstensi > Options) dan simpan API Key kamu. (Gagal menggunakan AI Lokal/Cloud)",
                debug: "Missing API Key & Local AI Unavailable"
            };
        }
        
        // --- 2. JIKA API KEY ADA: Gunakan pipeline Local Pre-processing + Cloud Fact Check ---
        
        const processedText = await runLocalPreProcessing(text);
        
        // Prompt yang sudah dioptimalkan
        const prompt = 
        `Anda adalah Veritas AI, spesialis cek fakta. 
        Tugas Anda adalah VERIFIKASI klaim ini: "${processedText}". 
        Gunakan Google Search untuk mendapatkan informasi real-time dan WAJIB sertakan fakta terbaru yang mendukung penilaian Anda. 
        **Terapkan Format Keluaran Ketat ini:** 
        (1) SATU KATA KUNCI di awal ('FAKTA', 'MISINFORMASI', atau 'HATI-HATI') diikuti tanda sama dengan (=); 
        (2) Jelaskan alasanmu dalam format TIGA POIN BUlet (-). 
        JANGAN SERTAKAN LINK APAPUN DI DALAM TEKS ALASAN.`;
        
        console.log("[Veritas Hybrid] Mengirim prompt ke Gemini Cloud (dengan Google Search)...");

        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            tools: [{ googleSearch: {} }] 
        };

        // API Key ada di Header (Sudah Sesuai)
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": geminiApiKey 
            },
            body: JSON.stringify(payload) 
        });

        const data = await response.json();
        
        // 🚨 PATCH FIX: Memeriksa candidates.length > 0 (menghindari TypeError)
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            // V: ROBUST PARSING: Gabungkan semua parts text jika ada multi-part
            const aiResponse = data.candidates[0].content.parts.map(p => p.text).join('\n').trim(); 
            const firstLine = aiResponse.split('\n')[0].trim();
            
            let flag = "Kuning"; 
            let flagSymbol = "🟡 ALERT!";
            
            if (firstLine.toUpperCase().startsWith("FAKTA")) {
                flag = "Hijau";
                flagSymbol = "🟢 FACT!";
            } else if (firstLine.toUpperCase().startsWith("MISINFORMASI")) {
                flag = "Merah";
                flagSymbol = "🔴 FALSE!";
            }
            
            // --- NEW FORMATTING LOGIC START ---
            
            const parts = aiResponse.split('=');
            const rawReasoning = (parts.length > 1) ? parts.slice(1).join('=').trim() : aiResponse.trim();
            
            const groundingMetadata = data.candidates[0].groundingMetadata;
            let linksOutput = "\nLink:\n- (Tidak ada sumber eksternal yang terdeteksi)";
            
            if (groundingMetadata && groundingMetadata.groundingChunks) {
                const uniqueLinks = new Map();
                groundingMetadata.groundingChunks
                    .filter(chunk => chunk.web && chunk.web.uri)
                    .forEach(chunk => {
                        const title = chunk.web.title || chunk.web.uri.split('/')[2];
                        uniqueLinks.set(chunk.web.uri, title);
                    });
                
                if (uniqueLinks.size > 0) {
                     linksOutput = "\nLink:";
                     uniqueLinks.forEach((title, uri) => {
                         linksOutput += `\n- [${title}](${uri})`;
                     });
                }
            }

            const formattedMessage = `
${flagSymbol} 
**"${text}"**
Reason:
${rawReasoning}
${linksOutput}
            `.trim();
            
            const finalResult = {
                flag: flag,
                message: formattedMessage,
                claim: text
            };
            
            // PANGGIL HISTORY
            saveFactCheckToHistory(finalResult);

            return finalResult;
            // --- NEW FORMATTING LOGIC END ---

        } else if (data.error) {
            return {
                flag: "Error",
                message: `API Error: ${data.error.message}`,
                debug: JSON.stringify(data.error)
            };
        } else {
            let detailedError = "Gagal memproses AI. Respons tidak terduga (Kemungkinan API Key bermasalah atau klaim diblokir).";
            if (data.promptFeedback && data.promptFeedback.blockReason) {
                detailedError = `Klaim diblokir oleh Safety Filter: ${data.promptFeedback.blockReason}`;
            } else if (data.candidates && data.candidates.length === 0) {
                detailedError = "Respons AI kosong. Kemungkinan masalah konfigurasi atau filter keamanan.";
            }

            return {
                flag: "Error",
                message: detailedError,
                debug: JSON.stringify(data)
            };
        }

    } catch (error) {
        console.error("[Veritas Hybrid] Kesalahan Fatal Fetch:", error);
        return {
            flag: "Error",
            message: `Kesalahan Jaringan/Fatal: ${error.message}`,
            debug: error.message
        };
    }
}

// ====================================================================
// FUNGSI 6: URL KE BASE64 UTILITY (Untuk Multimodal URL) (PATCH: Dynamic MIME Type)
// ====================================================================

async function urlToBase64(url) {
    console.log("[Veritas Multimodal] Fetching image dari URL...");
    
    const response = await fetch(url);
    
    // V: Dapatkan MIME type dari header respons, fallback ke image/jpeg
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result;
            if (base64String) {
                // V: Resolve dengan object yang menyertakan MIME type dan base64
                resolve({ 
                    base64: base64String.split(',')[1], 
                    mimeType: mimeType 
                }); 
            } else {
                reject(new Error("Gagal konversi ke Base64."));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ====================================================================
// FUNGSI 7: RUN FACT CHECK MULTIMODAL (via URL Klik Kanan) (PATCH: Menggunakan Dynamic MIME Type)
// ====================================================================

async function runFactCheckMultimodalUrl(imageUrl, text) {
    try {
        const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
        const geminiApiKey = resultStorage.geminiApiKey;

        if (!geminiApiKey) {
            return { flag: "Error", message: "API Key Gemini belum diatur. Multimodal saat ini membutuhkan akses Cloud.", claim: "Multimodal Check Failed" };
        }
        
        // V: Destrukturisasi untuk mendapatkan base64 dan mimeType dari fungsi baru
        const { base64: base64Image, mimeType } = await urlToBase64(imageUrl);

        return runFactCheckMultimodalDirect(base64Image, mimeType, text);

    } catch (error) {
        console.error("[Veritas Multimodal] Kesalahan Fatal Fetch/Base64:", error);
        return {
            flag: "Error",
            message: `Kesalahan Jaringan/Fatal (Gagal Fetch Gambar): ${error.message}`,
            debug: error.message
        };
    }
}


// ====================================================================
// FUNGSI 8: RUN FACT CHECK MULTIMODAL (DIRECT BASE64 dari Upload/Fungsi Lain) (PATCH: Robust Parsing)
// ====================================================================

async function runFactCheckMultimodalDirect(base64Image, mimeType, text) {
    try {
        const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
        const geminiApiKey = resultStorage.geminiApiKey;

        if (!geminiApiKey) {
            return { flag: "Error", message: "API Key Gemini belum diatur.", claim: "Multimodal Check Failed" };
        }
        
        // Prompt yang sudah dioptimalkan
        const promptText = 
        `Anda adalah Veritas AI, spesialis cek fakta multimodal. 
        Bandingkan dan VERIFIKASI klaim ini: "${text}", dengan (1) gambar yang diberikan dan (2) konteks eksternal dari Google Search. 
        WAJIB sertakan temuan yang mendukung. 
        **Terapkan Format Keluaran Ketat ini:** 
        (1) SATU KATA KUNCI di awal ('FAKTA', 'MISINFORMASI', atau 'HATI-HATI') diikuti tanda sama dengan (=); 
        (2) Jelaskan alasanmu dalam format TIGA POIN BUlet (-).
        JANGAN SERTAKAN LINK APAPUN DI DALAM TEKS ALASAN.`;

        console.log(
            "[Veritas Upload] Mengirim Base64 Image dan Prompt ke Gemini Cloud (dengan Google Search)...");

        const payload = {
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: promptText },
                        { inlineData: { 
                            mimeType: mimeType, 
                            data: base64Image
                        }}
                    ]
                }
            ],
            tools: [{ googleSearch: {} }] 
        };

        // API Key ada di Header (Sudah Sesuai)
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": geminiApiKey 
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            // V: ROBUST PARSING: Gabungkan semua parts text jika ada multi-part
            const aiResponse = data.candidates[0].content.parts.map(p => p.text).join('\n').trim(); 
            const firstLine = aiResponse.split('\n')[0].trim();
            
            let flag = "Kuning";
            let flagSymbol = "🟡 ALERT!";
            
            if (firstLine.toUpperCase().startsWith("FAKTA")) {
                flag = "Hijau";
                flagSymbol = "🟢 FACT!";
            } else if (firstLine.toUpperCase().startsWith("MISINFORMASI")) {
                flag = "Merah";
                flagSymbol = "🔴 FALSE!";
            }
            
            // --- NEW FORMATTING LOGIC START ---
            
            const parts = aiResponse.split('=');
            const rawReasoning = (parts.length > 1) ? parts.slice(1).join('=').trim() : aiResponse.trim();
            
            const groundingMetadata = data.candidates[0].groundingMetadata;
            let linksOutput = "\nLink:\n- (Tidak ada sumber eksternal yang terdeteksi)";
            
            if (groundingMetadata && groundingMetadata.groundingChunks) {
                const uniqueLinks = new Map();
                groundingMetadata.groundingChunks
                    .filter(chunk => chunk.web && chunk.web.uri)
                    .forEach(chunk => {
                        const title = chunk.web.title || chunk.web.uri.split('/')[2];
                        uniqueLinks.set(chunk.web.uri, title);
                    });
                
                if (uniqueLinks.size > 0) {
                     linksOutput = "\nLink:";
                     uniqueLinks.forEach((title, uri) => {
                         linksOutput += `\n- [${title}](${uri})`;
                     });
                }
            }

            const formattedMessage = `
${flagSymbol} 
**"${text}"**
Reason:
${rawReasoning}
${linksOutput}
            `.trim();
            
            const finalResult = {
                flag: flag,
                message: formattedMessage,
                claim: text
            };

            // PANGGIL HISTORY (FIX BUG KRITIS #1)
            saveFactCheckToHistory(finalResult);
            
            return finalResult;
            // --- NEW FORMATTING LOGIC END ---

        } else if (data.error) {
            return { flag: "Error", message: `API Error: ${data.error.message}`, debug: JSON.stringify(data.error) };
        } else {
            let detailedError = "Gagal memproses AI. Respons tidak terduga (Kemungkinan API Key bermasalah atau klaim diblokir).";
            if (data.promptFeedback && data.promptFeedback.blockReason) {
                detailedError = `Klaim diblokir oleh Safety Filter: ${data.promptFeedback.blockReason}`;
            } else if (data.candidates && data.candidates.length === 0) {
                detailedError = "Respons AI kosong. Kemungkinan masalah konfigurasi atau filter keamanan.";
            }

            return { flag: "Error", message: detailedError, debug: JSON.stringify(data) };
        }

    } catch (error) {
        console.error("[Veritas Upload] Kesalahan Fatal API:", error);
        return {
            flag: "Error",
            message: `Kesalahan Jaringan/Fatal: ${error.message}`,
            debug: error.message
        };
    }
}