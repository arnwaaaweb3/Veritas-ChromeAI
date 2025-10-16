// settings.js

document.addEventListener('DOMContentLoaded', restoreKey);

document.getElementById('saveButton').addEventListener('click', saveKey);

function saveKey() {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    const status = document.getElementById('status');

    if (apiKey.length < 30) {
        status.textContent = '❌ Key is too short. Please ensure it was copied correctly!';
        status.style.color = 'red';
        return;
    }

    // Using chrome.storage.local.set to securely store data
    chrome.storage.local.set({ 'geminiApiKey': apiKey }, () => {
        status.textContent = '✅ API Key saved successfully!';
        status.style.color = 'green';
        // Pause briefly before reloading status
        setTimeout(() => {
            restoreKey();
        }, 750);
    });
}

function restoreKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const status = document.getElementById('status');

    // Using chrome.storage.local.get to retrieve data
    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            // Display only a part of the key as an indication it is saved
            apiKeyInput.value = '**********' + result.geminiApiKey.slice(-5);
            status.textContent = `Key saved: ${result.geminiApiKey.slice(0, 5)}...${result.geminiApiKey.slice(-5)}`;
            status.style.color = 'blue';
        } else {
            apiKeyInput.value = '';
            status.textContent = 'No API Key saved yet.';
            status.style.color = 'black';
        }
    });
}