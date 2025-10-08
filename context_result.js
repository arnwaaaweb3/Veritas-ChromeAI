// context_result.js (NEW FILE: Floating Result Panel for Context Menu)

// Fungsi untuk membuat/memperbarui panel loading/hasil
function createLoadingPanel(claim) {
    // Cari panel yang sudah ada, jika ada, hapus untuk menghindari duplikasi
    let panel = document.getElementById('veritas-floating-result');
    if (panel) panel.remove(); 
    
    panel = document.createElement('div');
    panel.id = 'veritas-floating-result';
    
    // Style untuk Floating Panel (top-right, z-index tinggi)
    panel.style.cssText = `
        position: fixed; top: 10px; right: 10px; z-index: 2147483647; 
        width: 300px; padding: 15px; background: #fff8d6; border: 2px solid #FBBC05; 
        border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-family: Arial, sans-serif; font-size: 14px; color: #333;
        transition: opacity 0.3s ease;
    `;
    
    // Konten awal (Loading state)
    panel.innerHTML = `<span style="float: right; cursor: pointer; color: #555; margin-top: -5px;" onclick="this.parentNode.remove()">❌</span>
                       <strong>Veritas: Sedang Menganalisis...</strong>
                       <p style="margin: 5px 0 0; font-size: 13px;">Klaim: <i>${claim}</i></p>`;
    document.body.appendChild(panel);
    
    // Hapus panel setelah 10 detik jika user tidak berinteraksi
    setTimeout(() => { if (panel.parentNode) panel.remove(); }, 10000);
    return panel;
}

// Listener untuk menerima hasil akhir dari background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'finalResultUpdate') {
        const result = request.resultData;
        const panel = document.getElementById('veritas-floating-result') || createLoadingPanel(result.claim); 

        let color = '';
        if (result.flag === 'Hijau') { color = '#34A853'; panel.style.background = '#e7f8ec'; }
        else if (result.flag === 'Merah') { color = '#EA4335'; panel.style.background = '#fde8e8'; }
        else { color = '#FBBC05'; panel.style.background = '#fff8d6'; }

        // Update panel dengan hasil akhir
        panel.style.borderColor = color;
        panel.innerHTML = `<span style="float: right; cursor: pointer; color: #555; margin-top: -5px;" onclick="this.parentNode.remove()">❌</span>
                           <strong style="color: ${color};">Veritas Hasil: ${result.flag}</strong>
                           <p style="margin: 5px 0 0; font-size: 13px;">${result.message}</p>`;
        
        // Respond to background.js
        sendResponse({status: "received"}); 
        return true;
    }
});
