// background.js

import {
    CLOUD_PROMPT_TEXT_ONLY,
    CLOUD_PROMPT_MULTIMODAL,
    LOCAL_PROMPT_PRE_PROCESS,
    LOCAL_PROMPT_TEXT_FALLBACK,
    LOCAL_PROMPT_MULTIMODAL_FALLBACK,
    CLOUD_PROMPT_TEST_KEY,
    // MORTA FIX: ADD NEW PROMPT IMPORT
    CLOUD_PROMPT_URL_CONTEXT 
} from './prompt.js';

// LOCAL AI CHECKER UTILITIES
// Checks if Chrome's built-in AI API is available on the user's device.
function isLocalAiAvailable() {
    return (typeof chrome !== 'undefined' && typeof chrome.ai !== 'undefined');
}

// Uses local AI (Gemini Nano) to simplify a long claim into a concise, fact-checkable sentence.
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
        
        // Use imported prompt function
        const localPrompt = LOCAL_PROMPT_PRE_PROCESS(claimText);

        const response = await chrome.ai.generateContent({
            model: 'text_model',
            prompt: localPrompt,
            config: { maxOutputTokens: 128 }
        });

        const simplifiedText = response.text.trim();

        // Validate the simplified text is meaningful and not drastically larger
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

// --- HISTORY LOGIC (START) ---
const HISTORY_KEY = 'veritasHistory';
const MAX_HISTORY_ITEMS = 20;
const API_CACHE = new Map();
const MAX_CACHE_SIZE = 10;

// Retrieves result from in-memory cache
function getFromCache(claim) {
    const key = claim.trim().toLowerCase();
    return API_CACHE.get(key);
}

// Stores result in in-memory cache, removing the oldest item if the cache is full
function setToCache(claim, result) {
    const key = claim.trim().toLowerCase();
    if (API_CACHE.size >= MAX_CACHE_SIZE) {
        // Remove the oldest item
        API_CACHE.delete(API_CACHE.keys().next().value);
    }
    API_CACHE.set(key, result);
}

// Saves a successful fact-check result to Chrome local storage (History)
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


// SENDING RESULT TO POPUP
// Stores the result and opens the extension popup
function sendResultToPopup(result, isContextual = false) {
    chrome.storage.local.set({
        'lastFactCheckResult': result,
        'isContextualCheck': isContextual
    }, () => {
        chrome.action.openPopup();
    });
}

// =====================================================================
// Sends a standard Chrome notification upon completion/failure
// =====================================================================
function sendFactCheckNotification(claimText, isSuccess) {
    const notificationId = 'veritas-fact-check-' + Date.now();

    chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: 'icons/veritas48.png',
        title: isSuccess ? '✅ Fact Check Complete!' : '❌ Fact Check Failed',
        message: isSuccess
            ? `Claim: "${claimText}". Click this notification to see the result.`
            : `Failed to process claim "${claimText}". Please try again.`,
        requireInteraction: !isSuccess
    });
}

// Clickable Notification
// Listens for clicks on the notification to open the popup
chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.action.openPopup();
    chrome.notifications.clear(notificationId);
});

// ====================================================================
// FUNCTION 2: CONTEXT MENU SETUP
// ====================================================================
// Creates context menus when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "veritasFactCheckText",
        title: "Veritas: Fact Check Text Claim",
        contexts: ["selection"]
    });

    // Fact Check Multimodal (Image)
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
// MAIN CONTEXT MENU LISTENER (Right-Click) (PATCH: Retry Logic)
// ====================================================================
// Main listener for context menu clicks (right-click)
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const selectedText = info.selectionText;
    const currentTabId = tab.id;

    // --- HANDLE EXISTING FACT CHECK ACTIONS ---
    if (info.menuItemId === "veritasFactCheckText" || info.menuItemId === "veritasFactCheckMultimodal") {

        if (!selectedText || selectedText.trim().length === 0) {
            let result = { flag: "Error", message: "Please highlight the text you wish to fact check.", claim: "Check Failed" };
            sendResultToPopup(result);
            return;
        }

        const isTextMode = info.menuItemId === "veritasFactCheckText";

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

        // Send loading update to the newly injected panel WITH RETRY (Fix Race Condition)
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
            result = await runFactCheckHybrid(selectedText);
        } else {
            const imageUrl = info.srcUrl;
            const text = "USER_MUST_PROVIDE_CLAIM"; 
            result = await runFactCheckMultimodalUrl(imageUrl, text);
        }

        // 2. After API completes, send result to Floating Panel on the active page
        if (result) {
            sendFactCheckNotification(selectedText, result.flag !== 'Error');
            chrome.storage.local.set({ 'lastFactCheckResult': result });

            // Immediately update Floating Panel on the active tab
            chrome.tabs.sendMessage(currentTabId, {
                action: 'finalResultUpdate',
                resultData: result
            });
        }
    }
});

// ====================================================================
// LISTENER FOR POPUP/UPLOAD/SETTINGS
// Consolidated all messaging from popup.js and settings.js into one listener.
// ====================================================================

chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {

        // --- POPUP: TEXT ONLY FACT CHECK (ACTIVATED) ---
        if (request.action === 'textOnlyFactCheck') {
            const claim = request.claim;

            console.log("[Veritas Popup] Received Text-Only claim for processing.");

            // Set Loading state in storage (for popup display)
            const loadingResult = {
                flag: 'loading',
                claim: claim,
                message: "Veritas is verifying this claim..."
            };
            chrome.storage.local.set({ 'lastFactCheckResult': loadingResult });

            runFactCheckHybrid(claim).then(result => {
                sendFactCheckNotification(claim, result.flag !== 'Error');
                chrome.storage.local.set({ 'lastFactCheckResult': result });

                chrome.runtime.sendMessage({
                    action: 'updateFinalResult',
                    resultData: result
                });
                if (chrome.runtime.lastError) { console.warn("Popup closed. Update ignored."); } 
                
                sendResponse({ success: true, result: result });

            }).catch(error => {
                const errorResult = { flag: "Error", message: `Text Fact Check Failed: ${error.message}`, claim: claim };
                sendFactCheckNotification(claim, false);
                chrome.storage.local.set({ 'lastFactCheckResult': errorResult });

                chrome.runtime.sendMessage({ action: "updateFinalResult", resultData: errorResult });

                if (chrome.runtime.lastError) { console.warn("Popup closed. Error update ignored."); }
                
                sendResponse({ success: false, error: errorResult });
            });

            return true;
        }

        // --- POPUP: MULTIMODAL UPLOAD (Existing) ---
        if (request.action === 'multimodalUpload') {
            const { base64, mimeType, claim } = request;

            console.log(
                "[Veritas Upload] Received Base64 data from popup."
            );

            runFactCheckMultimodalDirect(base64, mimeType, claim).then(result => {
                sendFactCheckNotification(claim, result.flag !== 'Error');
                chrome.storage.local.set({ 'lastFactCheckResult': result });

                chrome.runtime.sendMessage({
                    action: 'updateFinalResult',
                    resultData: result
                });
                if (chrome.runtime.lastError) { console.warn("Popup closed. Update ignored."); }
                
                sendResponse({ success: true, result: result });

            }).catch(error => {
                const errorResult = { flag: "Error", message: `Upload Fact Check Failed: ${error.message}`, claim: claim };
                sendFactCheckNotification(claim, false);
                chrome.storage.local.set({ 'lastFactCheckResult': errorResult });

                chrome.runtime.sendMessage({ action: "updateFinalResult", resultData: errorResult });
                if (chrome.runtime.lastError) { console.warn("Popup closed. Error update ignored."); }
                
                sendResponse({ success: false, error: errorResult });
            });

            return true; 
        }
        
        // --- POPUP: URL FACT CHECK WITH MANUAL URL & CLAIM ---
        if (request.action === 'urlFactCheckWithClaim') {
            const { url, claim } = request;

            console.log("[Veritas Popup] Received URL & Claim for processing.");

            // Set Loading state in storage (for popup display)
            const loadingResult = {
                flag: 'loading',
                claim: claim,
                message: `Veritas is analyzing content from ${url}...`
            };
            chrome.storage.local.set({ 'lastFactCheckResult': loadingResult });

            runFactCheckUrlContext(url, claim).then(result => { 
                // Update result and notify popup
                sendFactCheckNotification(claim, result.flag !== 'Error');
                chrome.storage.local.set({ 'lastFactCheckResult': result });

                chrome.runtime.sendMessage({
                    action: 'updateFinalResult',
                    resultData: result
                });
                if (chrome.runtime.lastError) { console.warn("Popup closed. Update ignored."); }
                
                sendResponse({ success: true, result: result });

            }).catch(error => {
                const errorResult = { flag: "Error", message: `Manual URL Fact Check Failed: ${error.message}`, claim: claim };
                sendFactCheckNotification(claim, false);
                chrome.storage.local.set({ 'lastFactCheckResult': errorResult });

                chrome.runtime.sendMessage({ action: "updateFinalResult", resultData: errorResult });
                if (chrome.runtime.lastError) { console.warn("Popup closed. Error update ignored."); }

                sendResponse({ success: false, error: errorResult });
            });

            return true; 
        }
        
        // --- SETTINGS: TEST API KEY ---
        if (request.action === 'testGeminiKey') {
            const apiKeyToTest = request.apiKey;

            // Calls the API key test logic
            testGeminiKeyLogic(apiKeyToTest).then(response => {
                sendResponse(response);
            });
            return true; 
        }
    }
);

// ====================================================================
// CORE FUNCTION: GEMINI API CALL (Cloud API Core Handler)
// Handles communication with the Gemini Cloud API, including tool use (Google Search) and parsing.
// ====================================================================
async function executeGeminiCall(claim, contents) {
    const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
    let geminiApiKey = resultStorage.geminiApiKey;

    if (!geminiApiKey) {
        console.warn("[Veritas API Fallback] No API Key found. Using Demo Key for testing purposes.");
        geminiApiKey = "AIzaSyA4aSZOWaoxSnTbmjCm_rLxX-YBF-ZxlOU";
    }
    
    if (!geminiApiKey) {
        return {
            flag: "Error",
            message: "Gemini API Key is not set. Cloud access blocked. Set key in Settings.",
            debug: "Missing API Key"
        };
    }
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

        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {

            const aiResponse = data.candidates[0].content.parts.map(p => p.text).join('\n').trim();
            const firstLine = aiResponse.split('\n')[0].trim().toUpperCase();

            let flag = "Kuning"; // Default is Caution (Kuning)
            const flagMatch = firstLine.match(/^(FACT|MISINFORMATION|CAUTION)/);

            if (flagMatch) {
                const keyword = flagMatch[0];
                if (keyword === "FACT") {
                    flag = "Hijau";
                } else if (keyword === "MISINFORMATION") {
                    flag = "Merah";
                } else if (keyword === "CAUTION") {
                    flag = "Kuning";
                }
            }

            // Strip the leading FLAG= prefix
            const reasonStart = aiResponse.replace(/^(FACT|MISINFORMATION|CAUTION)\s*(=)?\s*/i, '').trim();
            const parts = reasonStart.split('Reason:');
            const rawReasoning = (parts.length > 1) ? parts.slice(1).join('=').trim() : reasonStart;

            // Link Grounding Logic (Extraction from GroundingMetadata)
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
**"${claim}"**
Reason:
${rawReasoning}
${linksOutput}
            `.trim();

            const finalResult = {
                flag: flag,
                message: `${flag.toUpperCase()}=${formattedMessage}`,
                claim: claim
            };

            saveFactCheckToHistory(finalResult);
            return finalResult;

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
// RUN FACT CHECK HYBRID (TEXT ONLY) 
// Handles the hybrid flow: Cache check -> Local AI Fallback/Pre-processing -> Cloud API call
// ====================================================================
async function runFactCheckHybrid(text) {

    // --- CHECK CACHE ---
    const cachedResult = getFromCache(text);
    if (cachedResult) {
        console.log("[Veritas Cache] Result found in memory cache. Returning instantly.");
        return cachedResult;
    }

    const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
    let geminiApiKey = resultStorage.geminiApiKey;

    const DEMO_API_KEY = "AIzaSyA4aSZOWaoxSnTbmjCm_rLxX-YBF-ZxlOU"; 
    
    if (!geminiApiKey) { 
        console.warn("[Veritas Hybrid Fallback] Key missing in storage. Using Hardcoded DEMO Key.");
        geminiApiKey = DEMO_API_KEY; // Inject kunci demo
    }

    if (geminiApiKey === DEMO_API_KEY && geminiApiKey.includes("PASTE_NOW")) {
         return {
            flag: "Error",
            message: "Demo Key Placeholder Error: Please replace the hardcoded DEMO_API_KEY in background.js with your actual working key for the demo to run instantly.",
            debug: "Missing API Key Placeholder"
        };
    }


    // --- HANDLE NO API KEY / FALLBACK TO LOCAL AI (Original Logic) ---
    if (!geminiApiKey) { 

        if (isLocalAiAvailable()) {
            console.log(
                "[Veritas Hybrid] Missing API Key. Performing verification using Local AI (On-Device)."
            );

            // Use imported prompt for local fallback
            const localPrompt = LOCAL_PROMPT_TEXT_FALLBACK(text);

            const localResult = await chrome.ai.generateContent({
                model: 'gemini-flash',
                prompt: localPrompt,
                config: { maxOutputTokens: 60 }, 
            });

            const aiResponse = localResult.text.trim();
            const upperResponse = aiResponse.toUpperCase();
            let flag = "Kuning";
            if (upperResponse.startsWith("FACT")) { flag = "Hijau"; }
            else if (upperResponse.startsWith("MISINFORMATION")) { flag = "Merah"; }
            else if (upperResponse.startsWith("CAUTION")) { flag = "Kuning"; }

            const finalResult = {
                flag: flag,
                message: aiResponse +
                    "[THIS VERIFICATION IS BASED ONLY ON LOCAL/INTERNAL CHROME KNOWLEDGE. Please enter an API Key for Real-Time (Grounding) verification.]",
                claim: text
            };

            // Set to Cache after successful local fallback
            setToCache(text, finalResult);
            saveFactCheckToHistory(finalResult);
            return finalResult;
        }

        // If Local AI is also unavailable
        return {
            flag: "Error",
            message: "Gemini API Key is not set. Open Veritas Settings (right-click extension icon > Options) and save your API Key. (Local AI currently unavailable on this device.)",
            debug: "Missing API Key & Local AI Unavailable"
        };
    }

    // Run local pre-processing first (simplifies the text claim)
    const processedText = await runLocalPreProcessing(text);

    // Use imported cloud prompt
    const prompt = CLOUD_PROMPT_TEXT_ONLY(processedText);

    console.log(
        "[Veritas Hybrid] Sending prompt to Gemini Cloud (with Google Search)..."
    );

    const contents = [{ role: "user", parts: [{ text: prompt }] }];

    const result = await executeGeminiCall(text, contents);

    // Set to Cache after successful cloud call
    if (result.flag !== 'Error') {
        setToCache(text, result);
    }

    return result;
}

// ====================================================================
// FUNCTION 6: URL TO BASE64 UTILITY (For Multimodal URL)
// Fetches an image URL and converts it to a Base64 string for API calls.
// ====================================================================

async function urlToBase64(url) {
    console.log(
        "[Veritas Multimodal] Fetching image from URL..."
    );

    const response = await fetch(url);

    // Get MIME type from response header, fallback to image/jpeg
    const mimeType = response.headers.get('content-type') || 'image/jpeg';

    const blob = await response.blob();

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result;
            if (base64String) {
                // Resolve with object including MIME type and base64 (splitting the data:mime/type;base64,)
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
// Handles multimodal fact check triggered by right-clicking an image.
// ====================================================================
async function runFactCheckMultimodalUrl(imageUrl, text) {
    const cachedResult = getFromCache(text);
    if (cachedResult) {
        console.log("[Veritas Cache] Result found in memory cache. Returning instantly.");
        return cachedResult;
    }

    try {
        const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
        let geminiApiKey = resultStorage.geminiApiKey;
        
        const DEMO_API_KEY = "AIzaSyA4aSZOWaoxSnTbmjCm_rLxX-YBF-ZxlOU"; 

        if (!geminiApiKey) { 
            console.warn("[Veritas Multimodal Fallback] Key missing in storage. Using Hardcoded DEMO Key.");
            geminiApiKey = DEMO_API_KEY; 
        }

        if (geminiApiKey === DEMO_API_KEY && geminiApiKey.includes("PASTE_NOW")) {
            return {
                flag: "Error",
                message: "Demo Key Placeholder Error: Please replace the hardcoded DEMO_API_KEY in background.js with your actual working key for the demo to run instantly.",
                claim: "Multimodal Check Failed",
                debug: "Missing API Key Placeholder"
            };
        }

        // Convert URL to Base64 (Required for Local/Cloud)
        const { base64: base64Image, mimeType } = await urlToBase64(imageUrl);

        // --- LOCAL MULTIMODAL FALLBACK (PRIORITY) ---
        if (!geminiApiKey && isLocalAiAvailable()) { 
            console.log("[Veritas Hybrid] Multimodal Cloud API Key missing. Falling back to Local AI.");

            // Use imported prompt for Local Multimodal
            const localPrompt = LOCAL_PROMPT_MULTIMODAL_FALLBACK(text);

            // Call Local AI (Assuming Local AI supports Multimodal/InlineData)
            const localResult = await chrome.ai.generateContent({
                model: 'gemini-flash',
                prompt: localPrompt,
                config: { maxOutputTokens: 256 },
                contents: [
                    { text: localPrompt },
                    { inlineData: { mimeType: mimeType, data: base64Image } }
                ]
            });

            // Parsing Local Fallback Result
            const aiResponse = localResult.text.trim();
            const upperResponse = aiResponse.toUpperCase();
            let flag = "Kuning";
            if (upperResponse.startsWith("FACT")) { flag = "Hijau"; }
            else if (upperResponse.startsWith("MISINFORMATION")) { flag = "Merah"; }
            else if (upperResponse.startsWith("CAUTION")) { flag = "Kuning"; }

            // Add flag for visual identification in History/Popup
            const message = `${flag.toUpperCase()}=**"${text}"**\nReason:\n${aiResponse}\nLink:\n- [LOCAL AI FALLBACK: Cloud API Key Missing]`;

            const finalResult = { flag: flag, message: message, claim: text };

            // Set to Cache after successful local fallback
            setToCache(text, finalResult);
            saveFactCheckToHistory(finalResult);
            return finalResult;
        }

        // --- CLOUD CALL ERROR (if API key is missing AND Local AI is unavailable) ---
        if (!geminiApiKey) {
            return {
                flag: "Error",
                message: "Gemini API Key is not set. Multimodal requires Cloud access, and Local AI is unavailable.",
                claim: "Multimodal Check Failed"
            };
        }

        // Proceed to Multimodal Direct (using Cloud API)
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
// Core function for multimodal fact checking using the Cloud API.
// ====================================================================
async function runFactCheckMultimodalDirect(base64Image, mimeType, text) {
    // --- CHECK CACHE ---
    const cachedResult = getFromCache(text);
    if (cachedResult) {
        console.log("[Veritas Cache] Result found in memory cache. Returning instantly.");
        return cachedResult;
    }

    const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
    let geminiApiKey = resultStorage.geminiApiKey; 

    const DEMO_API_KEY = "AIzaSyA4aSZOWaoxSnTbmjCm_rLxX-YBF-ZxlOU"; 
    
    if (!geminiApiKey) { 
        console.warn("[Veritas Multimodal Fallback] Key missing in storage. Using Hardcoded DEMO Key.");
        geminiApiKey = DEMO_API_KEY; 
    }

    if (geminiApiKey === DEMO_API_KEY && geminiApiKey.includes("PASTE_NOW")) {
        return {
            flag: "Error",
            message: "Demo Key Placeholder Error: Please replace the hardcoded DEMO_API_KEY in background.js with your actual working key for the demo to run instantly.",
            claim: "Multimodal Check Failed",
            debug: "Missing API Key Placeholder"
        };
    }

    // Use imported cloud multimodal prompt
    const promptText = CLOUD_PROMPT_MULTIMODAL(text);

    console.log(
        "[Veritas Upload] Sending Base64 Image and Prompt to Gemini Cloud (with Google Search)..."
    );

    const contents = [
        {
            role: "user",
            parts: [
                { text: promptText },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Image
                    }
                }
            ]
        }
    ];

    const result = await executeGeminiCall(text, contents);

    // Set to Cache after successful cloud call
    if (result.flag !== 'Error') {
        setToCache(text, result);
    }
    return result;
}

// ====================================================================
// TEST API KEY LOGIC (CALLED FROM settings.js)
// Tests if the user's provided API key is valid.
// ====================================================================
async function testGeminiKeyLogic(apiKey) {
    const testPrompt = CLOUD_PROMPT_TEST_KEY;
    const testContents = [{ role: "user", parts: [{ text: testPrompt }] }];

    const payload = {
        contents: testContents,
        generationConfig: { maxOutputTokens: 10 } 
    };

    try {
        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && !data.error) {
            return { success: true, message: "Key successfully validated and operational!" }; 
        }
        
        if (data.error) {
            let errorMessage = data.error.message;
            if (errorMessage.includes("API_KEY_INVALID")) {
                errorMessage = "API Key is invalid or restricted. Check your key format.";
            }
            if (errorMessage.includes("QUOTA_EXCEEDED")) {
                errorMessage = "API Key is valid but quota exceeded. Try again later.";
            }
            return { success: false, message: errorMessage };
        }
        
        return { success: false, message: `API returned an unexpected HTTP status (${response.status}).` };

    } catch (error) {
        return { success: false, message: `Network/Fetch Error: ${error.message}` };
    }
}

// ====================================================================
// X: RUN URL FACT CHECK CONTEXT 
// Core logic for processing URL content and sending it to Gemini.
// ====================================================================
async function runFactCheckUrlContext(claim, pageUrl) {
    const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
    let geminiApiKey = resultStorage.geminiApiKey; 

    const DEMO_API_KEY = "AIzaSyA4aSZOWaoxSnTbmjCm_rLxX-YBF-ZxlOU"; 
    
    if (!geminiApiKey) { 
        console.warn("[Veritas URL Context Fallback] Key missing in storage. Using Hardcoded DEMO Key.");
        geminiApiKey = DEMO_API_KEY; // Inject kunci demo
    }

    if (geminiApiKey === DEMO_API_KEY && geminiApiKey.includes("PASTE_NOW")) {
        return {
            flag: "Error",
            message: "Demo Key Placeholder Error: Please replace the hardcoded DEMO_API_KEY in background.js with your actual working key for the demo to run instantly.",
            claim: claim
        };
    }

    if (!geminiApiKey) {
        return {
            flag: "Error",
            message: "Gemini API Key is not set. Contextual URL Fact Check requires Cloud access.",
            claim: claim
        };
    }
    
    let pageContent = "";
    let finalUrl = pageUrl; 

    try {
        console.log(`[Veritas URL Manual] Fetching content from: ${pageUrl}`); 
        const response = await fetch(pageUrl); 
        
        if (!response.ok) {
            throw new Error(`Failed to fetch URL content (Status: ${response.status} ${response.statusText})`);
        }
        
        finalUrl = response.url; 
        
        const htmlText = await response.text();
        const MAX_CONTENT_LENGTH = 15000; 
        pageContent = htmlText.substring(0, MAX_CONTENT_LENGTH);

    } catch (error) {
        console.error(`[Veritas URL Manual] Fetch/Parsing Error for ${pageUrl}:`, error);
        return {
            flag: "Error",
            message: `Failed to retrieve content from URL: ${error.message}. Check URL validity or manifest permissions.`,
            claim: claim
        };
    }

    const prompt = CLOUD_PROMPT_URL_CONTEXT(claim, pageContent, finalUrl);

    console.log(
        "[Veritas URL Context] Sending fetched URL content and claim to Gemini Cloud (WITHOUT Google Search to ensure contextual accuracy)..."
    );
    
    const contents = [{ role: "user", parts: [{ text: prompt }] }];
    const payload = { contents: contents, }; 

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

        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            
            const aiResponse = data.candidates[0].content.parts.map(p => p.text).join('\n').trim();
            const firstLine = aiResponse.split('\n')[0].trim().toUpperCase();

            let flag = "Kuning"; 
            const flagMatch = firstLine.match(/^(FACT|MISINFORMATION|CAUTION)/);

            if (flagMatch) {
                const keyword = flagMatch[0];
                if (keyword === "FACT") { flag = "Hijau"; } 
                else if (keyword === "MISINFORMATION") { flag = "Merah"; }
                else if (keyword === "CAUTION") { flag = "Kuning"; }
            }
            
            const reasonStart = aiResponse.replace(/^(FACT|MISINFORMATION|CAUTION)\s*(=)?\s*/i, '').trim();
            const parts = reasonStart.split('Reason:');
            const rawReasoning = (parts.length > 1) ? parts.slice(1).join('=').trim() : reasonStart;
            
            const formattedMessage = `
**"${claim}"**
Reason:
${rawReasoning} 
Link:
- [Contextual Source: ${pageUrl}](${pageUrl})
            `.trim(); 

            const finalResult = {
                flag: flag,
                message: `${flag.toUpperCase()}=${formattedMessage}`,
                claim: claim
            };

            saveFactCheckToHistory(finalResult);
            return finalResult;
        } else if (data.error) {
            return { flag: "Error", message: `API Error: ${data.error.message}`, debug: JSON.stringify(data.error) };
        } else {
            let detailedError = "Failed to process AI. Unexpected response (possibly due to prompt/content length).";
            if (data.promptFeedback && data.promptFeedback.blockReason) {
                detailedError = `Claim blocked by Safety Filter: ${data.promptFeedback.blockReason}`;
            }
            return { flag: "Error", message: detailedError, debug: JSON.stringify(data) };
        }

    } catch (error) {
        console.error("[Veritas URL Context Call] Fatal Fetch Error:", error);
        return {
            flag: "Error",
            message: `Network/Fatal Error during URL Context Check: ${error.message}`,
            debug: error.message
        };
    }
}