// settings.js

document.addEventListener('DOMContentLoaded', initializeSettings);

function initializeSettings() {
    restoreKey();
    document.getElementById('saveButton').addEventListener('click', saveKey);
    document.getElementById('testButton').addEventListener('click', testKey);
}

function saveKey() {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    const status = document.getElementById('status');
    
    status.style.backgroundColor = '#fff3cd';
    status.style.color = '#856404';

    if (apiKey.length < 30) {
        status.textContent = '❌ Key is too short. Please ensure it was copied correctly!';
        return;
    }

    // Using chrome.storage.local.set to securely store data
    chrome.storage.local.set({ 'geminiApiKey': apiKey }, () => {
        status.textContent = '✅ API Key saved successfully!';
        status.style.backgroundColor = '#d4edda';
        status.style.color = '#155724';
        
        // Pause briefly before reloading status
        setTimeout(() => {
            restoreKey();
        }, 750);
    });
}

function restoreKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const status = document.getElementById('status');
    status.style.backgroundColor = '#f5f5f5';

    // Using chrome.storage.local.get to retrieve data
    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            // Display only a part of the key as an indication it is saved
            apiKeyInput.value = '**********' + result.geminiApiKey.slice(-5);
            status.textContent = `Key loaded: ${result.geminiApiKey.slice(0, 5)}...${result.geminiApiKey.slice(-5)}`;
            status.style.color = 'blue';
        } else {
            apiKeyInput.value = '';
            status.textContent = 'No API Key saved yet.';
            status.style.color = 'black';
        }
    });
}

function testKey() {
    const status = document.getElementById('status');
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    
    if (apiKey.length < 30) {
        status.textContent = '❌ Cannot test: Key is invalid or too short.';
        status.style.backgroundColor = '#f8d7da';
        status.style.color = '#721c24';
        return;
    }

    status.textContent = '⏳ Testing key stability...';
    status.style.backgroundColor = '#fff3cd';
    status.style.color = '#856404';
    
    // Kirim pesan ke background.js untuk menjalankan fungsi test API
    chrome.runtime.sendMessage({ action: 'testGeminiKey', apiKey: apiKey }, (response) => {
        if (chrome.runtime.lastError) {
            status.textContent = `❌ Test Failed: Service Worker Error. Try reloading the extension.`;
            status.style.backgroundColor = '#f8d7da';
            status.style.color = '#721c24';
            return;
        }

        if (response && response.success) {
            status.textContent = `✅ API Key is VALID and working!`;
            status.style.backgroundColor = '#d4edda';
            status.style.color = '#155724';
        } else {
            status.textContent = `❌ Test Failed: ${response.message || 'Check network or API Key permission.'}`;
            status.style.backgroundColor = '#f8d7da';
            status.style.color = '#721c24';
        }
    });
}