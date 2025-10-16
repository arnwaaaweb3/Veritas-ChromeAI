// context_result.js 

// Function to create/update loading/result panel
function createLoadingPanel(claim) {
    // Look for existing panel, if found, remove it to avoid duplication
    let panel = document.getElementById('veritas-floating-result');
    if (panel) panel.remove(); 
    
    panel = document.createElement('div');
    panel.id = 'veritas-floating-result';
    
    // V: Style for Floating Panel (MATCHING NEW PALETTE: #0046ff & #ffffff)
    panel.style.cssText = `
        position: fixed; top: 10px; right: 10px; z-index: 2147483647; 
        width: 300px; padding: 15px; background: #ffffff; border: 2px solid #0046ff; 
        border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-family: Arial, sans-serif; font-size: 14px; color: #000000;
        transition: opacity 0.3s ease;
    `;
    
    // Initial content (Loading state)
    panel.innerHTML = `<span style="float: right; cursor: pointer; color: #000000; margin-top: -5px;" onclick="this.parentNode.remove()">❌</span>
                       <strong style="color: #1800ad;">Veritas: Analyzing...</strong>
                       <p style="margin: 5px 0 0; font-size: 13px;">Claim: <i>${claim}</i></p>`;
    document.body.appendChild(panel);
    
    // REMOVED 10 SECOND TIMER! The panel now only disappears when replaced by the final result or manually closed.
    // setTimeout(() => { if (panel.parentNode) panel.remove(); }, 10000); 
    return panel;
}

// V: NEW FUNCTION FOR FORMATTING MESSAGE TO FLOATING PANEL
function formatMessageForPanel(rawMessage) {
    // 1. Extract the reasoning part (everything after Reason:)
    const reasonSplit = rawMessage.split('Reason:');
    if (reasonSplit.length < 2) {
        // Fallback if AI format is messy
        return { 
            summary: rawMessage.substring(0, 100) + (rawMessage.length > 100 ? '...' : ''), 
            header: 'Analysis Result' 
        };
    }

    const flagClaimRaw = reasonSplit[0].trim();
    const rawReasonings = reasonSplit[1].split('Link:')[0].trim();

    // 2. Extract the main header text (e.g., 🟢 FACT! or 🔴 FALSE!)
    const headerMatch = flagClaimRaw.match(/^(.)+!/); 
    const headerText = headerMatch ? headerMatch[0] : 'Analysis Result';

    // 3. Extract the first reasoning point and clean up
    let summary = 'More details in Popup...';
    // Only take lines starting with the bullet point '-'
    const reasonLines = rawReasonings.split('\n').filter(line => line.startsWith('-'));
    
    if (reasonLines.length > 0) {
        // Take the first line, remove the bullet point, and trim
        summary = reasonLines[0].substring(1).trim(); 
    }
    
    // 4. Apply bold markdown conversion (**text** -> <strong>text</strong>)
    summary = summary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    return { 
        summary: summary,
        header: headerText 
    };
}


// Listener to receive final results from background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'finalResultUpdate') {
        const result = request.resultData;
        const panel = document.getElementById('veritas-floating-result') || createLoadingPanel(result.claim); 

        // V: Update Final Result Color 
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
            // Color for Yellow/Alert/Error: Main Brand Blue (#0046ff)
            color = '#0046ff'; 
            panel.style.background = '#ffffff'; 
        }

        // V: FORMATTING FOR PANEL
        const formatted = formatMessageForPanel(result.message);

        // Update panel with final result
        panel.style.borderColor = color;
        panel.innerHTML = `<span style="float: right; cursor: pointer; color: #000000; margin-top: -5px;" onclick="this.parentNode.remove()">❌</span>
                           <strong style="color: ${color};">${formatted.header}</strong>
                           <p style="margin: 5px 0 0; font-size: 13px;">${formatted.summary}</p>`;
        
        // Respond to background.js
        sendResponse({status: "received"}); 
        return true;
    }
});