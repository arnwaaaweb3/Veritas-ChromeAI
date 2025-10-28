// content_script_url.js
// Extracts necessary information from the current web page.

function extractPageContent() {
    try {
        // Extract Main Text Content (Limit to 8k chars)
        const textContent = document.body.innerText.substring(0, 8000); 
        
        // Extract Top 5 Image URLs
        const imgUrls = Array.from(document.querySelectorAll('img'))
            .map(img => img.src)
            .filter(src => src && src.startsWith('http'))
            .slice(0, 5);

        // Extract Meta Description/Title
        const pageTitle = document.title;
        const pageUrl = window.location.href;
        
        return {
            textContent: textContent,
            pageTitle: pageTitle,
            pageUrl: pageUrl,
            images: imgUrls
        };
    } catch (e) {
        console.error("Veritas URL Scraper Failed:", e);
        return { error: "Failed to scrape page content." };
    }
}

// Send the extracted content back to the background script
chrome.runtime.sendMessage({
    action: 'urlContentScraped',
    data: extractPageContent()
});