// localAI.js (Built-in AI Integration for Chrome Canary)

/**
 * Memeriksa apakah Chrome AI API (chrome.ai) tersedia di environment ini.
 * Ini hanya tersedia di Chrome Canary/Dev dengan flag tertentu diaktifkan.
 * @returns {boolean} True jika API tersedia.
 */
function isLocalAiAvailable() {
    return (typeof chrome !== 'undefined' && typeof chrome.ai !== 'undefined');
}

/**
 * Melakukan pre-processing (penyederhanaan klaim) menggunakan Chrome Prompt API.
 * Tujuannya untuk menyederhanakan klaim kompleks sebelum diverifikasi oleh Gemini Cloud.
 * Ini memanfaatkan model on-device yang cepat.
 * * @param {string} claimText Teks klaim yang akan disederhanakan.
 * @returns {Promise<string>} Klaim yang telah disederhanakan, atau klaim asli jika gagal/AI tidak tersedia.
 */
async function runLocalPreProcessing(claimText) {
    if (!isLocalAiAvailable()) {
        console.warn("[Veritas LocalAI] Chrome AI tidak tersedia. Melewati pre-processing lokal.");
        return claimText; // Fallback ke klaim asli
    }

    try {
        console.log("[Veritas LocalAI] Mulai pre-processing lokal menggunakan Prompt API.");

        const localPrompt = `Sederhanakan kalimat ini menjadi klaim satu baris yang paling mudah diverifikasi. Fokus pada fakta inti: "${claimText}"`;
        
        // Menggunakan chrome.ai.generateContent (API on-device)
        const response = await chrome.ai.generateContent({
            model: 'text_model', // Nama model lokal (tergantung implementasi Chrome)
            prompt: localPrompt,
            config: {
                maxOutputTokens: 128
            }
        });

        const simplifiedText = response.text.trim();
        
        // Cek validasi dasar
        if (simplifiedText && simplifiedText.length > 5 && simplifiedText.length < claimText.length * 1.5) { 
             console.log("[Veritas LocalAI] Klaim disederhanakan:", simplifiedText);
             return simplifiedText;
        } else {
             console.warn("[Veritas LocalAI] Hasil penyederhanaan lokal tidak valid. Menggunakan klaim asli.");
             return claimText;
        }

    } catch (error) {
        console.error("[Veritas LocalAI] Gagal menjalankan Prompt API lokal:", error);
        return claimText; // Fallback ke klaim asli jika terjadi error
    }
}