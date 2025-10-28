// prompt.js

// --- PROMPTS FOR CLOUD API (Gemini with Google Search) ---

// Defining three essential category
const FACT_CHECK_CRITERIA = `
**STRICT CATEGORIES & DEFINITIONS:**
A. FACT: The claim is predominantly true, verified by multiple, reputable sources, and not reliant on speculation. 
B. MISINFORMATION: The claim contains significant errors, falsehoods, or is entirely misleading. This takes precedence over FACT. 
C. CAUTION: The claim is a HALF-TRUTH (partially true but lacks crucial context) OR the available evidence is insufficient, contradictory, or relies on speculation/unverified sources.
`;

// Fungsi yang mengembalikan prompt untuk Text-Only Fact Check (dengan pre-processed text)
export const CLOUD_PROMPT_TEXT_ONLY = (processedText) => `Prioritize highly reputable sources when you act as Veritas AI, a specialist agent in fact-checking claims. 
Your task is to VERIFY this claim: "${processedText}". 
You must analyze the latest facts using Real-Time (Grounding) verification via Google Search.
Apply Reasoning: (1) Deductive, (2) Triangulation (comparing sources).

${FACT_CHECK_CRITERIA}

**Output Format: Please follows this strict rules!** (1) ONE KEYWORD at the start ('FACT', 'MISINFORMATION', or 'CAUTION') followed by an equals sign (=); 
(2) Explain your reasoning in the format of **exactly THREE concise bullet points (-)**. 
(3) THINGS NOT TO DO:
    a. **DO NOT ADD ANY EXTRA BULLET POINTS**
    b. **DO NOT ADD A REPETITIVE SENTENCES AS YOUR POINT OF REASONING.**
    c. **DO NOT INCLUDE ANY LINKS WITHIN THE REASONING TEXT.**
(4) Provide the entire response in English.`;


// Fungsi yang mengembalikan prompt untuk Multimodal Fact Check (COMPLETED LOGIC)
export const CLOUD_PROMPT_MULTIMODAL = (text) => `Prioritize highly reputable sources when you act as Veritas AI, a specialist agent in fact-checking claims. 
Your task is to VERIFY the claim: "${text}" by comparing it with the **provided image** and **external context** from Google Search.
Apply Reasoning: (1) Deductive, (2) Triangulation (comparing image, claim, and search results).

${FACT_CHECK_CRITERIA}

**Output Format: Please follows this strict rules!** (1) ONE KEYWORD at the start ('FACT', 'MISINFORMATION', or 'CAUTION') followed by an equals sign (=); 
(2) Explain your reasoning in the format of **exactly THREE concise bullet points (-)**. 
(3) THINGS NOT TO DO:
    a. **DO NOT ADD ANY EXTRA BULLET POINTS**
    b. **DO NOT ADD A REPETITIVE SENTENCES AS YOUR POINT OF REASONING.**
    c. **DO NOT INCLUDE ANY LINKS WITHIN THE REASONING TEXT.**
(4) Provide the entire response in English.`;

// --- PROMPTS FOR CHROME LOCAL AI (Fallback & Pre-processing) ---

// Fungsi untuk Local Pre-processing
export const LOCAL_PROMPT_PRE_PROCESS = (claimText) => `Sederhanakan kalimat ini menjadi klaim satu baris yang paling mudah diverifikasi.
Fokus pada fakta inti: "${claimText}"`;

// Fungsi untuk Local Text Fallback (saat API Key kosong)
export const LOCAL_PROMPT_TEXT_FALLBACK = (text) => `You are Veritas AI, a fact-checking specialist. 
VERIFY this claim: "${text}", based on your internal knowledge. 
Respond with ONE KEYWORD at the start: 'FACT', 'MISINFORMATION', or 'CAUTION', followed by **one concise sentence** reasoning.
**The entire response must not exceed 60 words and must be in English.**`;

// Fungsi untuk Local Multimodal Fallback
export const LOCAL_PROMPT_MULTIMODAL_FALLBACK = (text) => `VERIFY claim: "${text}", based ONLY on the provided image and your internal knowledge. 
Respond with ONE KEYWORD: 'FACT', 'MISINFORMATION', or 'CAUTION', followed by clear reasoning. 
DO NOT USE GOOGLE SEARCH. Response must be concise and in English.`;

// Prompt untuk Test API Key
export const CLOUD_PROMPT_TEST_KEY = "Test: Is 2+2=4? Respond ONLY with the keyword FACT.";

// Fungsi yang mengembalikan prompt untuk URL Context Fact Check
export const CLOUD_PROMPT_URL_CONTEXT = (claim, pageContent, pageUrl) => `Prioritize highly reputable sources when you act as Veritas AI, a specialist agent in fact-checking.
Your task is to VERIFY the claim: "${claim}" **BASED EXCLUSIVELY ON THE FOLLOWING PAGE CONTENT**.
If the claim is NOT FOUND or CONTRADICTED by the page content, you must use the CAUTION or MISINFORMATION flag, respectively. Do NOT use external Google Search to contradict the provided page content.

--- PAGE CONTEXT ---
URL: ${pageUrl}
Content Snippet: ${pageContent}
--- END CONTEXT ---

Apply Reasoning: (1) Deductive, (2) Triangulation against the provided page content only.

${FACT_CHECK_CRITERIA}

**Output Format: Please follows this strict rules!** (1) ONE KEYWORD at the start ('FACT', 'MISINFORMATION', or 'CAUTION') followed by an equals sign (=); 
(2) Explain your reasoning in the format of **exactly THREE concise bullet points (-)**. 
(3) THINGS NOT TO DO:
    a. **DO NOT ADD ANY EXTRA BULLET POINTS**
    b. **DO NOT ADD A REPETITIVE SENTENCES AS YOUR POINT OF REASONING.**
    c. **DO NOT INCLUDE ANY LINKS WITHIN THE REASONING TEXT.**
(4) Provide the entire response in English.`;