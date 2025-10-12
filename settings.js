// settings.js (i18n Implemented)

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    document.getElementById('saveButton').addEventListener('click', saveSettings);
});

function loadSettings() {
    chrome.storage.local.get(['geminiApiKey'], (result) => {
        document.getElementById('apiKeyInput').value = result.geminiApiKey || '';
    });
}

function saveSettings() {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    
    chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
        // V: Menggunakan i18n
        alert(chrome.i18n.getMessage('saveKeySuccess')); 
    });
}