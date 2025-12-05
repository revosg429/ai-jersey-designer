/**
 * @fileoverview Google Apps Script file for generating images using the Gemini API (Imagen).
 *
 * NOTE: This script now uses the PropertiesService for secure storage of the API key.
 * You MUST run the setApiKey() function once in the Apps Script editor to save your key.
 */

// Placeholder for the API Key property name
const API_KEY_PROPERTY = 'GEMINI_API_KEY';
const IMAGE_MODEL = 'imagen-4.0-generate-001';

/**
 * [IMPORTANT] Saves your Gemini API key securely using the Script Properties service.
 * Run this function once in the Apps Script editor after setting your key below.
 */
function setApiKey() {
  // REPLACE "YOUR_GEMINI_API_KEY_HERE" with your actual API key before running.
  const myApiKey = "AIzaSyDZgYdi1_pjTq_yOvWMi0F5dyA_oZe8_K0"; 

  if (myApiKey === "AIzaSyDZgYdi1_pjTq_yOvWMi0F5dyA_oZe8_K0") {
    Logger.log("Error: Please replace 'YOUR_GEMINI_API_KEY_HERE' with your actual key before running setApiKey().");
    return;
  }
  
  PropertiesService.getScriptProperties().setProperty(API_KEY_PROPERTY, myApiKey);
  Logger.log("API Key saved securely to PropertiesService.");
}


/**
 * Generates an image based on a text prompt using the Imagen model.
 *
 * @param {string} prompt The text description of the image to generate.
 * @returns {string|null} The Base64 encoded string of the generated image (PNG format), or null on failure.
 */
function generateImage(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty(API_KEY_PROPERTY);

  if (!apiKey) {
    Logger.log(`Error: API Key not found. Please run the setApiKey() function first.`);
    return null;
  }
  
  if (!prompt) {
    Logger.log("Error: Prompt is empty.");
    return null;
  }
  
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:predict?key=${apiKey}`;

  // Define the request payload for the Imagen model
  const payload = {
    instances: [{ prompt: prompt }],
    parameters: {
      sampleCount: 1, // Generate one image
      outputMimeType: "image/png"
      // You can add 'aspectRatio' here, e.g., '1:1', '3:4', '4:3', '16:9', '9:16'
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true // Allows the script to catch HTTP errors
  };

  Logger.log(`Sending request for prompt: ${prompt}`);

  try {
    // Implement simple exponential backoff for resilience (max 3 retries)
    const MAX_RETRIES = 3;
    for (let i = 0; i < MAX_RETRIES; i++) {
        const response = UrlFetchApp.fetch(API_URL, options);
        const responseCode = response.getResponseCode();
        const responseText = response.getContentText();

        if (responseCode === 200) {
            const result = JSON.parse(responseText);
            
            // Check if predictions exist and contain image data
            if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
              const base64Image = result.predictions[0].bytesBase64Encoded;
              Logger.log("Image generation successful. Returning Base64 data.");
              return base64Image;
            } else {
              Logger.log("API response missing expected image data structure.");
              return null;
            }
        } else if (responseCode === 429 && i < MAX_RETRIES - 1) { // 429 is Too Many Requests (Rate Limit)
            const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
            Logger.log(`Rate limit exceeded (429). Retrying in ${delay / 1000} seconds...`);
            Utilities.sleep(delay);
        } else {
            Logger.log(`API Call Failed. Response Code: ${responseCode}`);
            Logger.log(`Response: ${responseText}`);
            return null;
        }
    }
    return null; // All retries failed

  } catch (error) {
    Logger.log(`An error occurred during API fetch: ${error.toString()}`);
    return null;
  }
}

/**
 * Example function to demonstrate how to call generateImage.
 * This is designed to be run directly in the Apps Script environment (Run > runTest).
 */
function runTest() {
  Logger.log("--- Checking API Key Setup ---");
  const apiKeyCheck = PropertiesService.getScriptProperties().getProperty(API_KEY_PROPERTY);
  if (!apiKeyCheck) {
    Logger.log("SETUP REQUIRED: The API key is not set. Please run the setApiKey() function first.");
    return;
  }
  
  const testPrompt = "A photorealistic image of a golden retriever wearing a tiny chef hat, standing in a brightly lit kitchen.";
  Logger.log("--- Starting Test Image Generation ---");
  
  const base64Data = generateImage(testPrompt);
  
  if (base64Data) {
    Logger.log("--- Image Data Successfully Received ---");
    Logger.log("To view the image, use a Base64 to Image decoder online or integrate with a Google service like DocumentApp or SpreadsheetApp.");
  } else {
    Logger.log("--- Image Generation Failed ---");
  }
}