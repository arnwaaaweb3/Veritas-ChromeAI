// context_result.js (NEW FILE: Floating Result Panel for Context Menu)

// Fungsi untuk membuat/memperbarui panel loading/hasil
function createLoadingPanel(claim) {
    // Cari panel yang sudah ada, jika ada, hapus untuk menghindari duplikasi
    let panel = document.getElementById('veritas-floating-result');
    if (panel) panel.remove(); 
    
    panel = document.createElement('div');
    panel.id = 'veritas-floating-result';
    
    // V: Style untuk Floating Panel (SESUAI PALET BARU: #0046ff & #ffffff)
    panel.style.cssText = `
        position: fixed; top: 10px; right: 10px; z-index: 2147483647; 
        width: 300px; padding: 15px; background: #ffffff; border: 2px solid #0046ff; 
        border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-family: Arial, sans-serif; font-size: 14px; color: #000000;
        transition: opacity 0.3s ease;
    `;
    
    // Konten awal (Loading state)
    panel.innerHTML = `<span style="float: right; cursor: pointer; color: #000000; margin-top: -5px;" onclick="this.parentNode.remove()">❌</span>
                       <strong style="color: #1800ad;">Veritas: Sedang Menganalisis...</strong>
                       <p style="margin: 5px 0 0; font-size: 13px;">Klaim: <i>${claim}</i></p>`;
    document.body.appendChild(panel);
    
    // HAPUS TIMER 10 DETIK! Panel sekarang hanya akan hilang saat diganti dengan hasil akhir atau dihapus manual.
    // setTimeout(() => { if (panel.parentNode) panel.remove(); }, 10000); 
    return panel;
}

// V: FUNGSI BARU UNTUK FORMATTING PESAN KE FLOATING PANEL
function formatMessageForPanel(rawMessage) {
    // 1. Extract the reasoning part (everything after Reason:)
    const reasonSplit = rawMessage.split('Reason:');
    if (reasonSplit.length < 2) {
        // Fallback jika format AI berantakan
        return { 
            summary: rawMessage.substring(0, 100) + (rawMessage.length > 100 ? '...' : ''), 
            header: 'Hasil Analisis' 
        };
    }

    const flagClaimRaw = reasonSplit[0].trim();
    const rawReasonings = reasonSplit[1].split('Link:')[0].trim();

    // 2. Extract the main header text (e.g., 🟢 FACT! atau 🔴 FALSE!)
    const headerMatch = flagClaimRaw.match(/^(.)+!/); 
    const headerText = headerMatch ? headerMatch[0] : 'Hasil Analisis';

    // 3. Extract the first reasoning point and clean up
    let summary = 'Detail lebih lanjut di Popup...';
    // Hanya ambil baris yang dimulai dengan bullet point '-'
    const reasonLines = rawReasonings.split('\n').filter(line => line.startsWith('-'));
    
    if (reasonLines.length > 0) {
        // Ambil baris pertama, hapus bullet point, dan trim
        summary = reasonLines[0].substring(1).trim(); 
    }
    
    // 4. Apply bold markdown conversion (**text** -> <strong>text</strong>)
    summary = summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    return { 
        summary: summary,
        header: headerText 
    };
}


// Listener untuk menerima hasil akhir dari background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'finalResultUpdate') {
        const result = request.resultData;
        const panel = document.getElementById('veritas-floating-result') || createLoadingPanel(result.claim); 

        // V: Update Warna Final Result (Hijau/Merah tetap, Neutral/Alert ganti ke Main Blue)
        let color = '';
        if (result.flag === 'Hijau') { 
            color = '#34A853'; 
            panel.style.background = '#e7f8ec'; 
        }
        else if (result.flag === 'Merah') { 
            color = '#EA4335'; 
            panel.style.background = '#fde8e8'; 
        }
        else { 
            // Warna untuk Kuning/Alert/Error: Main Brand Blue (#0046ff)
            color = '#0046ff'; 
            panel.style.background = '#ffffff'; 
        }

        // V: FORMATTING FOR PANEL
        const formatted = formatMessageForPanel(result.message);

        // Update panel dengan hasil akhir
        panel.style.borderColor = color;
        panel.innerHTML = `<span style="float: right; cursor: pointer; color: #000000; margin-top: -5px;" onclick="this.parentNode.remove()">❌</span>
                           <strong style="color: ${color};">${formatted.header}</strong>
                           <p style="margin: 5px 0 0; font-size: 13px;">${formatted.summary}</p>`;
        
        // Respond to background.js
        sendResponse({status: "received"}); 
        return true;
    }
});