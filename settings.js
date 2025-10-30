// settings.js

document.addEventListener('DOMContentLoaded', initializeSettings);

// === CONSTANTS ===
const STATUS_COLORS = {
    SUCCESS_BG: '#d4edda',
    SUCCESS_TEXT: '#155724',
    ERROR_BG: '#f8d7da',
    ERROR_TEXT: '#721c24',
    WARNING_BG: '#fff3cd',
    WARNING_TEXT: '#856404',
    DEFAULT_BG: '#f5f5f5',
    DEFAULT_TEXT: 'black'
};

// === INITIALIZATION ===
function initializeSettings() {
    restoreKey();
    document.getElementById('saveButton').addEventListener('click', saveKey);
    document.getElementById('testButton').addEventListener('click', testKey);
}

// === SAVE KEY ===
function saveKey() {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    const status = document.getElementById('status');

    status.style.backgroundColor = STATUS_COLORS.WARNING_BG;
    status.style.color = STATUS_COLORS.WARNING_TEXT;

    if (apiKey.length < 30) {
        updateStatus('❌ Key is too short. Please ensure it was copied correctly!', 'error');
        return;
    }

    chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
        updateStatus('✅ API Key saved successfully!', 'success');

        // Slight delay before refreshing the display
        setTimeout(() => restoreKey(), 750);
    });
}

// === RESTORE KEY ===
function restoreKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const status = document.getElementById('status');

    // Clear input field for new entry
    apiKeyInput.value = '';
    status.style.backgroundColor = STATUS_COLORS.DEFAULT_BG;

    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            const maskedKey = `${result.geminiApiKey.slice(0, 5)}...${result.geminiApiKey.slice(-5)}`;
            status.textContent = `Key Status: Saved & Loaded (${maskedKey})`;
            status.style.color = 'blue';
        } else {
            updateStatus('No API Key saved yet.', 'default');
        }
    });
}

// === TEST KEY ===
function testKey() {
    const status = document.getElementById('status');
    const apiKey = document.getElementById('apiKeyInput').value.trim();

    if (apiKey.length < 30) {
        updateStatus('⚠️ Please paste the FULL API Key into the field to run the test.', 'error');
        return;
    }

    updateStatus('⏳ Testing key stability...', 'warning');

    chrome.runtime.sendMessage({ action: 'testGeminiKey', apiKey }, (response) => {
        if (chrome.runtime.lastError) {
            updateStatus('❌ Test Failed: Service Worker Error. Try reloading the extension.', 'error');
            return;
        }

        if (response && response.success) {
            updateStatus('✅ API Key is VALID and working!', 'success');
        } else {
            updateStatus(`❌ Test Failed: ${response?.message || 'Check network or API Key permission.'}`, 'error');
        }
    });
}

// === HELPER FUNCTION ===
function updateStatus(message, type = 'default') {
    const status = document.getElementById('status');
    status.textContent = message;

    switch (type) {
        case 'success':
            status.style.backgroundColor = STATUS_COLORS.SUCCESS_BG;
            status.style.color = STATUS_COLORS.SUCCESS_TEXT;
            break;
        case 'error':
            status.style.backgroundColor = STATUS_COLORS.ERROR_BG;
            status.style.color = STATUS_COLORS.ERROR_TEXT;
            break;
        case 'warning':
            status.style.backgroundColor = STATUS_COLORS.WARNING_BG;
            status.style.color = STATUS_COLORS.WARNING_TEXT;
            break;
        default:
            status.style.backgroundColor = STATUS_COLORS.DEFAULT_BG;
            status.style.color = STATUS_COLORS.DEFAULT_TEXT;
            break;
    }
}
