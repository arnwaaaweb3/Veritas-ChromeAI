// background.js (Final Version: Persistent Window, Google Search Grounding, & Multimodal)

// ====================================================================
// SETUP JENDELA PERSISTENT
// ====================================================================
let veritasWindowId = null;

// FUNGSI INI WAJIB DIPANGGIL OLEH KLIK KANAN DAN KLIK ICON
async function createOrToggleVeritasWindow() {
    if (veritasWindowId) {
        // Jika window sudah ada (klik icon kedua), tutup.
        chrome.windows.remove(veritasWindowId);
        veritasWindowId = null;
    } else {
        // Jika window belum ada, buat baru.
        const newWindow = await chrome.windows.create({
            url: 'popup.html',
            type: 'popup',
            width: 320, 
            height: 600, 
            top: 50, 
            left: screen.width - 320 
        });
        veritasWindowId = newWindow.id;
        console.log(`[Veritas Window] Jendela baru dibuat dengan ID: ${veritasWindowId}`);
    }
}

// Handle saat window ditutup secara manual oleh user (tombol X)
chrome.windows.onRemoved.addListener(windowId => {
    if (windowId === veritasWindowId) {
        veritasWindowId = null;
        console.log("[Veritas Window] Jendela ditutup secara manual.");
    }
});

// Listener untuk klik icon Veritas di toolbar (menggantikan default popup)
chrome.action.onClicked.addListener(createOrToggleVeritasWindow);


// ====================================================================
// FUNGSI 1: MENGIRIM HASIL KE POPUP (DIPERBARUI)
// ====================================================================

function sendResultToPopup(result) {
    // 1. Simpan hasil ke storage
    chrome.storage.local.set({ 'lastFactCheckResult': result });
    
    // 2. Jika window belum ada, paksa muncul
    if (!veritasWindowId) {
        createOrToggleVeritasWindow();
    }
    // Jika window sudah ada, ia akan otomatis me-refresh dan membaca storage
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
// FUNGSI 3: LISTENER UTAMA CONTEXT MENU (Klik Kanan)
// ====================================================================

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    
    let result = null;

    if (info.menuItemId === "veritasFactCheckText") {
        // --- LOGIC TEXT FACT CHECK (P1) ---
        const selectedText = info.selectionText;
        console.log(`[Veritas] Menerima Teks: "${selectedText}"`);
        
        if (selectedText && selectedText.trim().length > 0) {
            result = await runFactCheckHybrid(selectedText); 
            console.log("[Veritas] Hasil AI (Teks):", result);
        } else {
            console.warn("[Veritas] Tidak ada teks yang diseleksi.");
            result = { flag: "Error", message: "Silakan sorot teks yang ingin Anda periksa faktanya.", claim: "Pengecekan Teks Gagal" };
        }
        
    } else if (info.menuItemId === "veritasFactCheckMultimodal") {
        // --- LOGIC MULTIMODAL URL (P2) ---
        
        const imageUrl = info.srcUrl; 
        const selectedText = info.selectionText || "TIDAK ADA TEKS SOROTAN.";
        
        console.log(`[Veritas Multimodal] Menerima URL Gambar: ${imageUrl}`);
        
        result = await runFactCheckMultimodalUrl(imageUrl, selectedText);
        
        console.log("[Veritas Multimodal] Hasil Final:", result);
    }

    // Menyimpan hasil di Storage dan membuka Persistent Window
    if (result) {
        sendResultToPopup(result); 
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

            // Memanggil fungsi Multimodal yang diperbarui (Direct)
            runFactCheckMultimodalDirect(base64, mimeType, claim).then(result => {
                sendResultToPopup(result);
                sendResponse({ success: true, result: result }); 
            }).catch(error => {
                const errorResult = { flag: "Error", message: `Gagal Fact Check Upload: ${error.message}`, claim: claim };
                sendResultToPopup(errorResult);
                sendResponse({ success: false, error: errorResult });
            });

            // Wajib kembalikan true untuk menggunakan sendResponse asinkron
            return true; 
        }
    }
);

// ====================================================================
// FUNGSI 5: RUN FACT CHECK HYBRID (TEKS ONLY) - DENGAN GOOGLE SEARCH GROUNDING
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

        // PROMPT BARU: Meminta AI menggunakan Search Tool
        const prompt = `Anda adalah Veritas AI, spesialis cek fakta. VERIFIKASI klaim ini: "${text}", dengan MENCARI INFORMASI REAL-TIME di Google Search. WAJIB sertakan fakta terbaru dari sumber yang Anda temukan untuk mendukung penilaian Anda. Balas dengan satu kata kunci di awal: 'FAKTA', 'MISINFORMASI', atau 'HATI-HATI'. Diikuti dengan alasan singkat dan jelas.`;
        
        console.log("[Veritas Hybrid] Mengirim prompt ke Gemini Cloud (dengan Google Search)...");

        // PAYLOAD BARU: Mengaktifkan Google Search Tool
        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                tools: [{ googleSearch: {} }] // Kunci Grounding!
            }
        };

        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + geminiApiKey, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload) // Menggunakan payload baru dengan tools
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
// FUNGSI 8: RUN FACT CHECK MULTIMODAL (DIRECT BASE64 dari Upload/Fungsi Lain) - DENGAN GOOGLE SEARCH GROUNDING
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

        // 2. Susun Payload Multimodal (Ditambah config tools)
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
            config: {
                tools: [{ googleSearch: {} }] // Kunci Grounding!
            }
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