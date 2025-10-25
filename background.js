// background.js (CLEAN V10: Prompt Logic Extracted to prompt.js)

import {
    CLOUD_PROMPT_TEXT_ONLY,
    CLOUD_PROMPT_MULTIMODAL,
    LOCAL_PROMPT_PRE_PROCESS,
    LOCAL_PROMPT_TEXT_FALLBACK,
    LOCAL_PROMPT_MULTIMODAL_FALLBACK,
    CLOUD_PROMPT_TEST_KEY
} from './prompt.js';

// --- LOCAL AI HELPER FUNCTIONS (START) ---
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
// --- LOCAL AI HELPER FUNCTIONS (END) ---

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


// FUNCTION 1: SENDING RESULT TO POPUP
// Stores the result and opens the extension popup
function sendResultToPopup(result, isContextual = false) {
    chrome.storage.local.set({
        'lastFactCheckResult': result,
        'isContextualCheck': isContextual
    }, () => {
        chrome.action.openPopup();
    });
}

// Sends a standard Chrome notification upon completion/failure
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

// NEW LISTENER: Clickable Notification
// Listens for clicks on the notification to open the popup
chrome.notifications.onClicked.addListener((notificationId) => {
    // Open extension popup when notification is clicked
    chrome.action.openPopup();
    // Optional: Clear notification after clicking
    chrome.notifications.clear(notificationId);
});

// ====================================================================
// FUNCTION 2: CONTEXT MENU SETUP
// ====================================================================

// Creates context menus when the extension is installed
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

    // SUMMARIZATION MENU REMOVED - Focusing on stable features.

    console.log(
        "Veritas Text & Multimodal Context Menus created."
    );
});

// ====================================================================
// FUNCTION 3: MAIN CONTEXT MENU LISTENER (Right-Click) (PATCH: Retry Logic)
// ====================================================================

// Main listener for context menu clicks (right-click)
chrome.contextMenus.onClicked.addListener(async (info, tab) => {

    const selectedText = info.selectionText;
    const currentTabId = tab.id;

    // SUMMARIZATION LOGIC REMOVED. Only Fact Check logic remains.

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
            // Run API Call (Async)
            result = await runFactCheckHybrid(selectedText);
        } else {
            // Run Multimodal API Call 
            const imageUrl = info.srcUrl;
            // REMOVED AUTOPASTE CLAIM: Force user to input claim for multimodal checks
            // The selected text is ignored here. We use a placeholder string.
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
// FUNCTION 4: LISTENER FOR UPLOAD FROM POPUP
// Listener for messages from the popup (e.g., direct image upload)
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
                chrome.storage.local.set({ 'lastFactCheckResult': result });

                chrome.runtime.sendMessage({
                    action: 'updateFinalResult',
                    resultData: result
                });
                sendResponse({ success: true, result: result });

            }).catch(error => {
                const errorResult = { flag: "Error", message: `Upload Fact Check Failed: ${error.message}`, claim: claim };
                sendFactCheckNotification(claim, false);
                chrome.storage.local.set({ 'lastFactCheckResult': errorResult });

                chrome.runtime.sendMessage({ action: "updateFinalResult", resultData: errorResult });
                sendResponse({ success: false, error: errorResult });
            });

            return true; // Indicates an asynchronous response
        }
        if (request.action === 'testGeminiKey') {
            const apiKeyToTest = request.apiKey;

            // Calls the API key test logic
            testGeminiKeyLogic(apiKeyToTest).then(response => {
                sendResponse(response);
            });
            return true; // Indicates an asynchronous response
        }
    }
);

// ====================================================================
// CORE FUNCTION: GEMINI API CALL (Cloud API Core Handler)
// Handles communication with the Gemini Cloud API, including tool use (Google Search) and parsing.
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

    const payload = {
        contents: contents,
        tools: [{ googleSearch: {} }] // Enable Google Search Grounding
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

            // --- NEW FORMATTING LOGIC START ---

            // Strip the leading FLAG= prefix
            const reasonStart = aiResponse.replace(/^(FACT|MISINFORMATION|CAUTION)\s*(=)?\s*/i, '').trim();
            // Assuming the reasoning text follows the flag prefix
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
// FUNCTION 5: RUN FACT CHECK HYBRID (TEXT ONLY) 
// Handles the hybrid flow: Cache check -> Local AI Fallback/Pre-processing -> Cloud API call
// ====================================================================

async function runFactCheckHybrid(text) {

    // --- 1. CHECK CACHE ---
    const cachedResult = getFromCache(text);
    if (cachedResult) {
        console.log("[Veritas Cache] Result found in memory cache. Returning instantly.");
        return cachedResult;
    }

    const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
    const geminiApiKey = resultStorage.geminiApiKey;

    // --- 2. HANDLE NO API KEY / FALLBACK TO LOCAL AI (Unique Logic) ---
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
                config: { maxOutputTokens: 60 }, // Max token strictly reduced
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

    // --- 3. IF API KEY IS PRESENT: Use pipeline Local Pre-processing + executeGeminiCall ---

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
    // --- CHECK CACHE ---
    const cachedResult = getFromCache(text);
    if (cachedResult) {
        console.log("[Veritas Cache] Result found in memory cache. Returning instantly.");
        return cachedResult;
    }
    // --- END CHECK CACHE ---

    try {
        const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
        const geminiApiKey = resultStorage.geminiApiKey;

        // 1. Convert URL to Base64 (Required for Local/Cloud)
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
    // --- END CHECK CACHE ---

    const resultStorage = await chrome.storage.local.get(['geminiApiKey']);
    const geminiApiKey = resultStorage.geminiApiKey;

    if (!geminiApiKey) {
        // Simple error message for direct upload/call without key
        return { flag: "Error", message: "Gemini API Key is not set. Cloud access blocked.", claim: "Multimodal Check Failed" };
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
// FUNCTION 9: TEST API KEY LOGIC (CALLED FROM settings.js)
// Tests if the user's provided API key is valid.
// ====================================================================
async function testGeminiKeyLogic(apiKey) {
    // Use imported test prompt
    const testPrompt = CLOUD_PROMPT_TEST_KEY;
    const testContents = [{ role: "user", parts: [{ text: testPrompt }] }];

    const payload = {
        contents: testContents,
        config: { maxOutputTokens: 10 } // Very short response token limit
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

        if (response.ok && data.candidates && data.candidates.length > 0) {
            const aiResponse = data.candidates[0].content.parts.map(p => p.text).join('\n').trim().toUpperCase();
            if (aiResponse.startsWith("FACT")) {
                return { success: true, message: "Key successfully validated." };
            }
        }

        let errorMessage = data.error ? data.error.message : 'API returned unexpected data.';
        if (errorMessage.includes("API_KEY_INVALID")) {
            errorMessage = "API Key is invalid or restricted.";
        }
        return { success: false, message: errorMessage };

    } catch (error) {
        return { success: false, message: `Network/Fetch Error: ${error.message}` };
    }
}

// Listener for Test Key from settings.js
chrome.runtime.onMessage.addListener(
    (request, sender, sendResponse) => {
        // ... (Existing 'multimodalUpload' listener) ...

        if (request.action === 'testGeminiKey') {
            const apiKeyToTest = request.apiKey;

            testGeminiKeyLogic(apiKeyToTest).then(response => {
                sendResponse(response);
            });
            return true; // Asynchronous response requires returning true
        }
    }
);