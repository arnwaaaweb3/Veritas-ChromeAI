// background.js (PATCH FINAL V8: English Output Enforced)

// --- LOCAL AI HELPER FUNCTIONS (START) ---
function isLocalAiAvailable() {
    return (typeof chrome !== 'undefined' && typeof chrome.ai !== 'undefined');
}

async function runLocalPreProcessing(claimText) {
    if (!isLocalAiAvailable()) {
        console.warn(
            "[Veritas LocalAI] Chrome AI is unavailable. Skipping local pre-processing."
        );
        return claimText;
    }

    try {
        console.log(
            "[Veritas LocalAI] Starting local pre-processing using Prompt API."
        );
        // KEEPING PRE-PROCESSING PROMPT IN ID (Internal only)
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
             console.log(
                "[Veritas LocalAI] Claim simplified:", simplifiedText
            );
             return simplifiedText;
        } else {
             console.warn(
                "[Veritas LocalAI] Local simplification result invalid. Using original claim."
            );
             return claimText;
        }

    } catch (error) {
        console.error(
            "[Veritas LocalAI] Failed to run local Prompt API:", error
        );
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
    console.log(
        "[Veritas History] Fact Check result saved successfully."
    );
}
// --- HISTORY LOGIC (END) ---


// FUNCTION 1: SENDING RESULT TO POPUP
function sendResultToPopup(result, isContextual = false) { 
    chrome.storage.local.set({ 
        'lastFactCheckResult': result,
        'isContextualCheck': isContextual 
    }, () => {
        chrome.action.openPopup(); 
    });
}

/// Sending Chrome Notification
function sendFactCheckNotification(claimText, isSuccess) {
    const notificationId = 'veritas-fact-check-' + Date.now(); // Give unique ID
    
    chrome.notifications.create(notificationId, { // Use ID here
        type: 'basic',
        iconUrl: 'icons/veritas48.png', 
        title: isSuccess ? '✅ Fact Check Complete!' : '❌ Fact Check Failed', 
        message: isSuccess 
            ? `Claim: "${claimText}". Click this notification to see the result.` 
            : `Failed to process claim "${claimText}". Please try again.`, 
        requireInteraction: !isSuccess 
    });
}

// V: NEW LISTENER: Clickable Notification
chrome.notifications.onClicked.addListener((notificationId) => {
    // Open extension popup when notification is clicked
    chrome.action.openPopup();
    // Optional: Clear notification after clicking
    chrome.notifications.clear(notificationId);
});

// ====================================================================
// FUNCTION 2: CONTEXT MENU SETUP
// ====================================================================

chrome.runtime.onInstalled.addListener(() => {
    // Menu 1: Fact Check Text (Selection)
    chrome.contextMenus.create({
        id: "veritasFactCheckText",
        title: "Veritas: Fact Check Text Claim", 
        contexts: ["selection"] 
    });

    // Menu 2: Fact Check Multimodal (Image)
    chrome.contextMenus.create({
        id: "veritasFactCheckMultimodal",
        title: "Veritas: Fact Check Claim + Image (Multimodal)", 
        contexts: ["image"] 
    });
    console.log(
        "Veritas Text & Multimodal Context Menus created." 
    );
});

// ====================================================================
// FUNCTION 3: MAIN CONTEXT MENU LISTENER (Right-Click) (PATCH: Retry Logic)
// ====================================================================

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    
    const selectedText = info.selectionText;
    
    if (info.menuItemId === "veritasFactCheckText" || info.menuItemId === "veritasFactCheckMultimodal") {
        
        if (!selectedText || selectedText.trim().length === 0) {
            let result = { flag: "Error", message: "Please highlight the text you wish to fact check.", claim: "Check Failed" }; 
            sendResultToPopup(result);
            return;
        }

        const isTextMode = info.menuItemId === "veritasFactCheckText";
        const currentTabId = tab.id;

        // 1. Set Loading status AND send to Floating Panel (context_result.js)
        const loadingResult = {
            flag: 'loading',
            claim: selectedText,
            message: "Veritas is verifying this claim..." 
        };

        // Inject content script (context_result.js)
        await chrome.scripting.executeScript({
            target: { tabId: currentTabId },
            files: ['context_result.js'] 
        });
        
        // V: Send loading update to the newly injected panel WITH RETRY (Fix Race Condition)
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                await chrome.tabs.sendMessage(currentTabId, { action: 'finalResultUpdate', resultData: loadingResult });
                console.log(
                    `[Veritas Context] Loading state sent after ${attempt + 1} attempt(s).`
                );
                break;
            } catch (e) {
                console.warn(
                    `[Veritas Context] Failed to send message (attempt ${attempt + 1}). Retrying...`, e 
                );
                await new Promise(res => setTimeout(res, 200)); // Wait 200ms
            }
        }

        // Also save loading state to storage (for popup if opened)
        chrome.storage.local.set({
            'lastFactCheckResult': loadingResult,
            'isContextualCheck': true 
        });


        let result = null;
        
        if (isTextMode) {
            // Run API Call (Async)
            result = await runFactCheckHybrid(selectedText); 
        } else {
            // Run Multimodal API Call 
            const imageUrl = info.srcUrl; 
            const text = info.selectionText || "NO HIGHLIGHTED TEXT."; 
            result = await runFactCheckMultimodalUrl(imageUrl, text);
        }

        // 2. After API completes, send result to Floating Panel on the active page
        if (result) {
            sendFactCheckNotification(selectedText, result.flag !== 'Error');
            chrome.storage.local.set({'lastFactCheckResult': result});

            // ✅ Immediately update Floating Panel on the active tab
            chrome.tabs.sendMessage(currentTabId, {
                action: 'finalResultUpdate',
                resultData: result
            });
        }
    }
});

// ====================================================================
// FUNCTION 4: LISTENER FOR UPLOAD FROM POPUP
// ====================================================================

chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        if (request.action === 'multimodalUpload') {
            const { base64, mimeType, claim } = request;
            
            console.log(
                "[Veritas Upload] Received Base64 data from popup." 
            );

            runFactCheckMultimodalDirect(base64, mimeType, claim).then(result => {
                sendFactCheckNotification(claim, result.flag !== 'Error');
                chrome.storage.local.set({'lastFactCheckResult': result});

                chrome.runtime.sendMessage({
                    action: 'updateFinalResult',
                    resultData: result
                });
                sendResponse({ success: true, result: result }); 
                
            }).catch(error => {
                const errorResult = { flag: "Error", message: `Upload Fact Check Failed: ${error.message}`, claim: claim }; 
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
// CORE FUNCTION: GEMINI API CALL (Cloud API Core Handler)
// ====================================================================

async function executeGeminiCall(claim, contents) {
    const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
    const geminiApiKey = resultStorage.geminiApiKey;

    if (!geminiApiKey) {
        return { 
            flag: "Error", 
            message: "Gemini API Key is not set. Cloud access blocked.", 
            debug: "Missing API Key"
        };
    }
    
    // V: Payload includes tools: googleSearch
    const payload = {
        contents: contents,
        tools: [{ googleSearch: {} }] 
    };

    try {
        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": geminiApiKey 
            },
            body: JSON.stringify(payload) 
        });

        const data = await response.json();
        
        // V: Robust Parsing & Error Handling
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            // ROBUST PARSING: Combine all text parts if there are multi-parts
            const aiResponse = data.candidates[0].content.parts.map(p => p.text).join('\n').trim(); 
            const firstLine = aiResponse.split('\n')[0].trim();
            
            let flag = "Kuning"; 
            let flagSymbol = "🟡 ALERT!";
            
            // V: PATCH V8 - CHECKING ENGLISH KEYWORDS FOR JUDGES
            if (firstLine.toUpperCase().startsWith("FACT")) {
                flag = "Hijau";
                flagSymbol = "🟢 FACT!";
            } else if (firstLine.toUpperCase().startsWith("MISINFORMATION")) {
                flag = "Merah";
                flagSymbol = "🔴 FALSE!";
            } else if (firstLine.toUpperCase().startsWith("CAUTION")) { // ADDED CAUTION FOR BETTER MATCHING
                flag = "Kuning";
                flagSymbol = "🟡 CAUTION!";
            } 
            // ELSE remains Kuning/ALERT! if none of the above match.
            
            // --- NEW FORMATTING LOGIC START ---
            
            const parts = aiResponse.split('=');
            const rawReasoning = (parts.length > 1) ? parts.slice(1).join('=').trim() : aiResponse.trim();
            
            const groundingMetadata = data.candidates[0].groundingMetadata;
            let linksOutput = "\nLink:\n- (No external sources detected)"; 
            
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
**"${claim}"**
Reason:
${rawReasoning}
${linksOutput}
            `.trim();
            
            const finalResult = {
                flag: flag,
                message: formattedMessage,
                claim: claim
            };
            
            saveFactCheckToHistory(finalResult); // CALL HISTORY
            return finalResult;
            // --- NEW FORMATTING LOGIC END ---

        } else if (data.error) {
            return {
                flag: "Error",
                message: `API Error: ${data.error.message}`,
                debug: JSON.stringify(data.error)
            };
        } else {
            let detailedError = 
            "Failed to process AI. Unexpected response (Possibly problematic API Key or blocked claim)."; 
            if (data.promptFeedback && data.promptFeedback.blockReason) {
                detailedError = 
                `Claim blocked by Safety Filter: ${data.promptFeedback.blockReason}`; 
            } else if (data.candidates && data.candidates.length === 0) {
                detailedError = 
                "Empty AI response. Possible configuration issue or security filter."; 
            }

            return {
                flag: "Error",
                message: detailedError,
                debug: JSON.stringify(data)
            };
        }

    } catch (error) {
        console.error(
            "[Veritas Cloud Call] Fatal Fetch Error:", error 
        );
        return {
            flag: "Error",
            message: `Network/Fatal Error: ${error.message}`,
            debug: error.message
        };
    }
}


// ====================================================================
// FUNCTION 5: RUN FACT CHECK HYBRID (TEXT ONLY) 
// ====================================================================

async function runFactCheckHybrid(text) {
    const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
    const geminiApiKey = resultStorage.geminiApiKey;
    
    // --- 1. HANDLE NO API KEY / FALLBACK TO LOCAL AI (Unique Logic) ---
    if (!geminiApiKey) {
        if (isLocalAiAvailable()) {
            console.log(
                "[Veritas Hybrid] Missing API Key. Performing verification using Local AI (On-Device)." 
            );

            // CHANGED FALLBACK PROMPT TO ENGLISH (Output must be EN)
            const localPrompt = 
            `You are Veritas AI, a fact-checking specialist. 
            VERIFY this claim: "${text}", based on your internal knowledge. 
            Respond with ONE KEYWORD at the start: 'FACT', 'MISINFORMATION', or 'CAUTION', followed by a brief and clear reasoning.
            Provide the entire response in English.`;

            const localResult = await chrome.ai.generateContent({
                model: 'gemini-flash', 
                prompt: localPrompt,
                config: { maxOutputTokens: 256 }
            });

            const aiResponse = localResult.text.trim();
            const upperResponse = aiResponse.toUpperCase();
            let flag = "Kuning";
            // PATCH V8 - CHECKING ENGLISH KEYWORDS FOR FALLBACK
            if (upperResponse.startsWith("FACT")) { flag = "Hijau"; } 
            else if (upperResponse.startsWith("MISINFORMATION")) { flag = "Merah"; }
            else if (upperResponse.startsWith("CAUTION")) { flag = "Kuning"; }

            const finalResult = {
                flag: flag,
                message: aiResponse + 
                "[THIS VERIFICATION IS BASED ONLY ON LOCAL/INTERNAL CHROME KNOWLEDGE. Please enter an API Key for Real-Time (Grounding) verification.]", 
                claim: text
            };
            
            saveFactCheckToHistory(finalResult);
            return finalResult;
        }

        return { 
            flag: "Error", 
            message:"Gemini API Key is not set. Open Veritas Settings (right-click extension icon > Options) and save your API Key. (Failed to use Local/Cloud AI)", 
            debug: "Missing API Key & Local AI Unavailable"
        };
    }
    
    // --- 2. IF API KEY IS PRESENT: Use pipeline Local Pre-processing + executeGeminiCall ---
    
    const processedText = await runLocalPreProcessing(text);
    
    // PATCH V8 - THE OPTIMIZED PROMPT IS NOW ENFORCED ENGLISH
    const prompt =
    `You are Veritas AI, a specialist in fact-checking. 
    Your task is to VERIFY this claim: "${processedText}". 
    Apply Reasoning: 
    1) Deductive (comparing the claim with established rules/facts); 
    2) Triangulation (comparing at least 3 sources from Google Search). 
    You MUST include the latest facts supporting your assessment. 
    **Apply this Strict Output Format:** (1) ONE KEYWORD at the start ('FACT', 'MISINFORMATION', or 'CAUTION') followed by an equals sign (=); 
    (2) Explain your reasoning in the format of at least THREE bullet points (-). 
    If the claim is descriptive, elaborate on more than 3 points. 
    DO NOT INCLUDE ANY LINKS WITHIN THE REASONING TEXT.
    Provide the entire response in English.`; 
    
    console.log(
        "[Veritas Hybrid] Sending prompt to Gemini Cloud (with Google Search)..." 
    );
    
    const contents = [{ role: "user", parts: [{ text: prompt }] }];

    return executeGeminiCall(text, contents);
}

// ====================================================================
// FUNCTION 6: URL TO BASE64 UTILITY (For Multimodal URL)
// ====================================================================

async function urlToBase64(url) {
    console.log(
        "[Veritas Multimodal] Fetching image from URL..." 
    );
    
    const response = await fetch(url);
    
    // V: Get MIME type from response header, fallback to image/jpeg
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result;
            if (base64String) {
                // V: Resolve with object including MIME type and base64
                resolve({ 
                    base64: base64String.split(',')[1], 
                    mimeType: mimeType 
                }); 
            } else {
                reject(new Error("Failed to convert to Base64.")); 
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ====================================================================
// FUNCTION 7: RUN FACT CHECK MULTIMODAL (via Right-Click URL)
// ====================================================================

async function runFactCheckMultimodalUrl(imageUrl, text) {
    try {
        const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
        const geminiApiKey = resultStorage.geminiApiKey;

        if (!geminiApiKey) {
            return { flag: "Error", message: "Gemini API Key is not set. Multimodal currently requires Cloud access.", claim: "Multimodal Check Failed" }; 
        }
        
        // V: Destructure to get base64 and mimeType from the new function
        const { base64: base64Image, mimeType } = await urlToBase64(imageUrl);

        return runFactCheckMultimodalDirect(base64Image, mimeType, text);

    } catch (error) {
        console.error("[Veritas Multimodal] Fatal Fetch/Base64 Error:", error); 
        return {
            flag: "Error",
            message: `Network/Fatal Error (Failed to Fetch Image): ${error.message}`, 
            debug: error.message
        };
    }
}


// ====================================================================
// FUNCTION 8: RUN FACT CHECK MULTIMODAL (DIRECT BASE64 from Upload/Other Functions)
// ====================================================================

async function runFactCheckMultimodalDirect(base64Image, mimeType, text) {
    const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
    const geminiApiKey = resultStorage.geminiApiKey;

    if (!geminiApiKey) {
        return { flag: "Error", message: "Gemini API Key is not set. Cloud access blocked.", claim: "Multimodal Check Failed" };
    }
    
    // PATCH V8 - THE OPTIMIZED PROMPT IS NOW ENFORCED ENGLISH
    const promptText = 
    `You are Veritas AI, a specialist in fact-checking. 
    Compare and VERIFY this claim: "${text}", with (1) the provided image and (2) external context from Google Search. 
    Apply Reasoning: 
    1) Deductive (comparing the claim with established rules/facts); 
    2) Triangulation (comparing at least 3 sources from Google Search). 
    You MUST include the latest findings supporting your assessment. 
    **Apply this Strict Output Format:** (1) ONE KEYWORD at the start ('FACT', 'MISINFORMATION', or 'CAUTION') followed by an equals sign (=); 
    (2) Explain your reasoning in the format of at least THREE bullet points (-). 
    If the claim is descriptive, elaborate on more than 3 points. 
    DO NOT INCLUDE ANY LINKS WITHIN THE REASONING TEXT.
    Provide the entire response in English.`;

    console.log(
        "[Veritas Upload] Sending Base64 Image and Prompt to Gemini Cloud (with Google Search)..." 
    );

    const contents = [
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
    ];

    return executeGeminiCall(text, contents);
}