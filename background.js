// background.js (FINAL & STABIL: Grounding Fix di Top-Level Payload + UX Separation)

// FUNGSI 1: MENGIRIM HASIL KE POPUP (Membuat Popup INSTAN atau Menyimpan Hasil)
// Diperbarui untuk menerima flag isContextual
function sendResultToPopup(result, isContextual = false) { 
    // Simpan hasil utama DAN flag kontekstual
    chrome.storage.local.set({ 
        'lastFactCheckResult': result,
        'isContextualCheck': isContextual 
    }, () => {
        // Karena kita menggunakan default_popup, kita panggil openPopup
        chrome.action.openPopup(); 
    });
}

// FUNGSI BARU: Mengirim Notifikasi Chrome
function sendFactCheckNotification(claimText, isSuccess) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/veritas48.png', // Gunakan icon 48x48
        title: isSuccess ? '✅ Fact Check Selesai!' : '❌ Fact Check Gagal',
        message: isSuccess 
            ? `Klaim: "${claimText}". Klik icon Veritas untuk melihat hasilnya.`
            : `Gagal memproses klaim "${claimText}". Silakan coba lagi.`,
        requireInteraction: false 
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
// FUNGSI 3: LISTENER UTAMA CONTEXT MENU (Klik Kanan) - FIX UTAMA DISINI
// ====================================================================

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    
    // Logic ini dijalankan saat user klik kanan (Butuh respon instan!)
    
    const selectedText = info.selectionText;
    
    if (info.menuItemId === "veritasFactCheckText" || info.menuItemId === "veritasFactCheckMultimodal") {
        
        if (!selectedText || selectedText.trim().length === 0) {
            let result = { flag: "Error", message: "Silakan sorot teks yang ingin Anda periksa faktanya.", claim: "Pengecekan Gagal" };
            sendResultToPopup(result);
            return;
        }

        // 1. KRITIS: Set status Loading dan buka popup INSTAN
        chrome.storage.local.set({
            'lastFactCheckResult': {
                flag: 'loading',
                claim: selectedText
            },
            'isContextualCheck': true // Flag untuk popup.js agar skip splash screen
        }, () => {
             // Buka popup INSTAN
             chrome.action.openPopup();
        });

        let result = null;
        
        if (info.menuItemId === "veritasFactCheckText") {
            // Jalankan API Call (Async)
            result = await runFactCheckHybrid(selectedText); 
        } else if (info.menuItemId === "veritasFactCheckMultimodal") {
            // Jalankan API Call Multimodal
            const imageUrl = info.srcUrl; 
            const text = info.selectionText || "TIDAK ADA TEKS SOROTAN.";
            result = await runFactCheckMultimodalUrl(imageUrl, text);
        }

        // 2. Setelah API Selesai, kirim hasil ke popup yang sudah terbuka
        // Gunakan chrome.tabs.sendMessage untuk update ke popup yang sudah terbuka
        if (result) {
            // Kirim notifikasi, simpan hasil, dan update popup yang sudah terbuka
            sendFactCheckNotification(selectedText, result.flag !== 'Error');
            chrome.storage.local.set({'lastFactCheckResult': result});

            // ✅ Langsung update popup
            chrome.runtime.sendMessage({
                action: 'updateFinalResult',
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
                // Kirim notifikasi, simpan hasil, dan update popup yang sudah terbuka
                sendFactCheckNotification(claim, result.flag !== 'Error');
                chrome.storage.local.set({'lastFactCheckResult': result});

                // ✅ Langsung update popup
                chrome.runtime.sendMessage({
                    action: 'updateFinalResult',
                    resultData: result
                });
                sendResponse({ success: true, result: result }); 
                
            }).catch(error => {
                const errorResult = { flag: "Error", message: `Gagal Fact Check Upload: ${error.message}`, claim: claim };
                sendFactCheckNotification(claim, false);
                chrome.storage.local.set({'lastFactCheckResult': errorResult});

                if (sender.tab && sender.tab.id) {
                    chrome.tabs.sendMessage(sender.tab.id, { action: "displayResult", resultData: errorResult });
                }
                sendResponse({ success: false, error: errorResult });
            });

            return true; 
        }
    }
);

// ====================================================================
// FUNGSI 5: RUN FACT CHECK HYBRID (TEKS ONLY) - FIX PAYLOAD
// ====================================================================

async function runFactCheckHybrid(text) {
    try {
        const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
        const geminiApiKey = resultStorage.geminiApiKey;
        
        if (!geminiApiKey) {
            return { 
                flag: "Error", 
                message: "API Key Gemini belum diatur. Buka Pengaturan Veritas (klik kanan ikon ekstensi > Options) dan simpan API Key kamu.",
                debug: "Missing API Key"
            };
        }

        const prompt = `Anda adalah Veritas AI, spesialis cek fakta. VERIFIKASI klaim ini: "${text}", dengan MENCARI INFORMASI REAL-TIME di Google Search. WAJIB sertakan fakta terbaru dari sumber yang Anda temukan untuk mendukung penilaian Anda. Balas dengan satu kata kunci di awal: 'FAKTA', 'MISINFORMASI', atau 'HATI-HATI'. Diikuti dengan alasan singkat dan jelas.`;
        
        console.log("[Veritas Hybrid] Mengirim prompt ke Gemini Cloud (dengan Google Search)...");

        // FIX KRITIS FINAL: Payload yang benar
        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            tools: [{ googleSearch: {} }] 
        };

        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + geminiApiKey, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload) 
        });

        const data = await response.json();
        
        if (data.candidates && data.candidates[0].content) {
            const aiResponse = data.candidates[0].content.parts[0].text.trim();
            const upperResponse = aiResponse.toUpperCase();
            
            let flag = "Kuning"; 
            
            if (upperResponse.startsWith("FAKTA")) {
                flag = "Hijau";
            } else if (upperResponse.startsWith("MISINFORMASI")) {
                flag = "Merah";
            }

            return {
                flag: flag,
                message: aiResponse,
                claim: text
            };

        } else if (data.error) {
            return {
                flag: "Error",
                message: `API Error: ${data.error.message}`,
                debug: JSON.stringify(data.error)
            };
        } else {
            return {
                flag: "Error",
                message: "Gagal memproses AI. Respons tidak terduga.",
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
// FUNGSI 6: URL KE BASE64 UTILITY (Untuk Multimodal URL)
// ====================================================================

async function urlToBase64(url) {
    console.log("[Veritas Multimodal] Fetching image dari URL...");
    
    // Ini mungkin gagal karena CORS. Untuk hackathon, kita teruskan.
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result;
            if (base64String) {
                resolve(base64String.split(',')[1]); 
            } else {
                reject(new Error("Gagal konversi ke Base64."));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ====================================================================
// FUNGSI 7: RUN FACT CHECK MULTIMODAL (via URL Klik Kanan)
// ====================================================================

async function runFactCheckMultimodalUrl(imageUrl, text) {
    try {
        const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
        const geminiApiKey = resultStorage.geminiApiKey;

        if (!geminiApiKey) {
            return { flag: "Error", message: "API Key Gemini belum diatur.", claim: "Multimodal Check Failed" };
        }
        
        // 1. Konversi Gambar ke Base64
        const base64Image = await urlToBase64(imageUrl);
        const mimeType = 'image/jpeg'; // Asumsi untuk simplicity.

        // 2. Memanggil fungsi Direct
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
// FUNGSI 8: RUN FACT CHECK MULTIMODAL (DIRECT BASE64 dari Upload/Fungsi Lain) - FIX PAYLOAD
// ====================================================================

async function runFactCheckMultimodalDirect(base64Image, mimeType, text) {
    try {
        const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
        const geminiApiKey = resultStorage.geminiApiKey;

        if (!geminiApiKey) {
            return { flag: "Error", message: "API Key Gemini belum diatur.", claim: "Multimodal Check Failed" };
        }
        
        // 1. Prompt Engineering Multimodal (Diperbarui untuk Grounding)
        const promptText = `Anda adalah Veritas AI, spesialis cek fakta multimodal. Bandingkan klaim ini: "${text}", dengan gambar yang diberikan. Cari konteks eksternal di Google (seperti tahun data atau sumber asli) untuk memverifikasi klaim. Jika klaim teks DAN konteks eksternal valid, balas 'FAKTA'. Jika tidak, balas 'MISINFORMASI'. WAJIB sertakan tahun data yang valid jika ditemukan.`;

        console.log("[Veritas Upload] Mengirim Base64 Image dan Prompt ke Gemini Cloud (dengan Google Search)...");

        // 2. Susun Payload Multimodal (FIX KRITIS FINAL: Pindahkan 'tools' ke level atas payload)
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
            tools: [{ googleSearch: {} }] // Kunci Grounding!
        };

        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + geminiApiKey, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        // 3. Proses Respon dari Gemini
        if (data.candidates && data.candidates[0].content) {
            const aiResponse = data.candidates[0].content.parts[0].text.trim();
            const upperResponse = aiResponse.toUpperCase();
            
            let flag = "Kuning";
            if (upperResponse.startsWith("FAKTA")) {
                flag = "Hijau";
            } else if (upperResponse.startsWith("MISINFORMASI")) {
                flag = "Merah";
            }

            return { flag: flag, message: aiResponse, claim: text };

        } else if (data.error) {
            return { flag: "Error", message: `API Error: ${data.error.message}`, debug: JSON.stringify(data.error) };
        } else {
            return { flag: "Error", message: "Gagal memproses AI. Respons tidak terduga.", debug: JSON.stringify(data) };
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