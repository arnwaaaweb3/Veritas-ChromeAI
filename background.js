// background.js (Hybrid Solution: Teks Fact Check & Multimodal Penuh)

// ====================================================================
// FUNGSI 1: MENGIRIM HASIL KE POPUP (Menggunakan Chrome Storage)
// ====================================================================

function sendResultToPopup(result) {
    // Simpan hasil ke storage yang bisa diakses oleh popup
    chrome.storage.local.set({ 'lastFactCheckResult': result }, () => {
         // Membuka popup setelah data tersimpan.
         chrome.action.openPopup(); 
    });
}

// ====================================================================
// FUNGSI 2: CONTEXT MENU SETUP
// ====================================================================

chrome.runtime.onInstalled.addListener(() => {
    // Menu 1: Cek Fakta Teks (Selection) - P1
    chrome.contextMenus.create({
        id: "veritasFactCheckText",
        title: "Veritas: Cek Fakta Klaim Teks",
        contexts: ["selection"] 
    });

    // Menu 2: Cek Fakta Multimodal (Gambar) - P2
    chrome.contextMenus.create({
        id: "veritasFactCheckMultimodal",
        title: "Veritas: Cek Fakta Klaim + Gambar", // Judul final
        contexts: ["image"] 
    });
    console.log("Veritas Context Menu Teks & Multimodal dibuat.");
});

// ====================================================================
// FUNGSI 3: LISTENER UTAMA CONTEXT MENU
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
        // --- LOGIC MULTIMODAL FACT CHECK (P2 - Penuh) ---
        
        const imageUrl = info.srcUrl; 
        const selectedText = info.selectionText || "TIDAK ADA TEKS SOROTAN.";
        
        console.log(`[Veritas Multimodal] Menerima URL Gambar: ${imageUrl}`);
        
        // Memanggil fungsi Multimodal Fact Check yang sebenarnya
        result = await runFactCheckMultimodal(imageUrl, selectedText);
        
        console.log("[Veritas Multimodal] Hasil Final:", result);
    }

    // Fix Error Popup: Menyimpan hasil di Storage dan membuka popup
    if (result) {
        sendResultToPopup(result); 
    }
});

// ====================================================================
// FUNGSI 4: RUN FACT CHECK HYBRID (TEKS ONLY)
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

        const prompt = `Anda adalah Veritas AI, spesialis cek fakta. Analisis klaim ini: "${text}". Balas dengan satu kata kunci di awal: 'FAKTA', 'MISINFORMASI', atau 'HATI-HATI'. Diikuti dengan alasan singkat dan jelas.`;
        
        console.log("[Veritas Hybrid] Mengirim prompt ke Gemini Cloud...");

        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + geminiApiKey, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }]
            })
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
// FUNGSI 5: URL KE BASE64 UTILITY
// ====================================================================

async function urlToBase64(url) {
    console.log("[Veritas Multimodal] Fetching image dari URL...");
    
    // Menghindari CORS error: Jika gambar dari URL lain, fetch bisa gagal. 
    // Untuk hackathon, kita berasumsi CORS sudah dihandle/dibypass.
    const response = await fetch(url);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result;
            if (base64String) {
                // Mengambil string Base64 murni (setelah koma data:image/...)
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
// FUNGSI 6: RUN FACT CHECK MULTIMODAL
// ====================================================================

async function runFactCheckMultimodal(imageUrl, text) {
    try {
        const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
        const geminiApiKey = resultStorage.geminiApiKey;

        if (!geminiApiKey) {
            return { flag: "Error", message: "API Key Gemini belum diatur.", claim: "Multimodal Check Failed" };
        }
        
        // 1. Konversi Gambar ke Base64
        const base64Image = await urlToBase64(imageUrl);
        // Menentukan mimeType dari Base64 string
        const mimeType = 'image/jpeg'; // Asumsi untuk simplicity. Bisa disempurnakan dengan logic header.

        // 2. Prompt Engineering Multimodal
        const promptText = `Anda adalah Veritas AI, spesialis cek fakta multimodal. Bandingkan klaim ini: "${text}", dengan gambar yang diberikan. Jika gambar membuktikan klaim teks, balas 'FAKTA'. Jika gambar membantah klaim teks, balas 'MISINFORMASI'. Jika gambar tidak relevan, balas 'HATI-HATI'. Ikuti dengan alasan singkat.`;

        console.log("[Veritas Multimodal] Mengirim Base64 Image dan Prompt ke Gemini Cloud...");

        // 3. Susun Payload Multimodal
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
            ]
        };

        // 4. Panggil Gemini Cloud API (Fetch)
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + geminiApiKey, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        // 5. Proses Respon dari Gemini
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
        console.error("[Veritas Multimodal] Kesalahan Fatal Fetch/Base64:", error);
        return {
            flag: "Error",
            message: `Kesalahan Jaringan/Fatal (Gagal Fetch Gambar): ${error.message}`,
            debug: error.message
        };
    }
}