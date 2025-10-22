# 🚀 VERITAS AI - TESTING INSTRUCTIONS

This application is a **Chrome Extension** utilizing the new **Chrome Built-in AI APIs (Gemini Nano)** for Hybrid Fact-Checking.

## 1. How to Install and Load the Extension (Side-loading)

1.  Download the ZIP file of our latest commit (or Clone the repository).
2.  Open **Google Chrome**.
3.  Navigate to **chrome://extensions/**.
4.  Activate **Developer Mode** (toggle switch in the top-right corner).
5.  Click the **"Load unpacked"** button.
6.  Select the **root folder** of the cloned repository (`Veritas-ChromeAI-main/`).
7.  The Veritas AI extension should now appear in your toolbar.

## 2. Setting up the API Key (Hybrid Mode)

1.  Right-click the Veritas AI icon in the toolbar, and select **"Options"** (or open the settings.html page directly).
2.  Input a valid Gemini Developer API Key into the field.
3.  Click **"Save API Key"**, then click **"Test Key"** to confirm Cloud access is functional.

## 3. Testing Core Features

* **Test 1: Text Fact Check (Hybrid Performance)**: Highlight any text on a webpage. Right-click $\rightarrow$ "Veritas: Fact Check Text Claim". (This uses Local Pre-processing + Cloud Grounding).
* **Test 2: Multimodal Fact Check**: Right-click an image on a webpage. Select "Veritas: Fact Check Claim + Image (Multimodal)".