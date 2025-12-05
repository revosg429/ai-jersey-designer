// This function handles the request to the Imagen API for image generation.

const API_KEY = process.env.GEMINI_API_KEY; // Ensure this is correctly named in Netlify env vars
const MODEL_NAME = 'imagen-4.0-generate-001'; // Standard model for text-to-image

// Define headers for CORS access
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*', // Allows access from any domain
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
    // 1. Handle CORS Preflight Check
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: CORS_HEADERS,
        };
    }

    if (event.httpMethod !== 'POST') {
        return { 
            statusCode: 405, 
            body: 'Method Not Allowed',
            headers: CORS_HEADERS,
        };
    }

    // Check for API Key before proceeding
    if (!API_KEY) {
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "CRITICAL: API Key not configured on the server." }),
        };
    }

    try {
        const { prompt } = JSON.parse(event.body);

        if (!prompt) {
            return { 
                statusCode: 400, 
                body: 'Missing prompt',
                headers: CORS_HEADERS,
            };
        }

        // 1. Exponential Backoff Utility for retries
        const callApiWithBackoff = async (url, options, retries = 3) => {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, options);
                    if (response.status === 429) { // Rate limit error
                        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                        console.warn(`Rate limit hit (429). Retrying in ${delay / 1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    if (!response.ok) {
                        const errorBody = await response.text();
                        // Throw a specific error for external API issues
                        throw new Error(`External API Error ${response.status}: ${errorBody}`);
                    }
                    return response.json();
                } catch (error) {
                    if (i === retries - 1) throw error; // Re-throw if last attempt
                    // The error is handled by the loop/retry logic
                }
            }
        };

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:predict?key=${API_KEY}`;
        
        // Payload structure for imagen-4.0-generate-001
        const payload = {
            instances: [{ prompt: prompt }],
            parameters: {
                sampleCount: 1,
                // Optionally add other parameters like aspect ratio
                aspectRatio: "1:1"
            }
        };

        const response = await callApiWithBackoff(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const prediction = response.predictions?.[0];

        if (prediction && prediction.bytesBase64Encoded) {
            const base64Data = prediction.bytesBase64Encoded;
            const imageUrl = `data:image/png;base64,${base64Data}`;

            return {
                statusCode: 200,
                headers: CORS_HEADERS, // Include CORS headers in success response
                body: JSON.stringify({ imageUrl: imageUrl })
            };
        } else {
            // === NEW IMPROVED ERROR HANDLING ===
            // Check for safety filter issues, which is a common cause of missing image data
            const safetyRating = response.candidates?.[0]?.safetyRatings?.map(r => 
                `${r.category.split('_').pop()}: ${r.probability}`
            ).join('; ');

            const errorMessage = safetyRating 
                ? `Image was filtered by safety systems. Ratings: ${safetyRating}`
                : "Could not extract image data from API response (check Netlify logs for full response).";
                
            // Log the full response body for detailed server-side debugging
            console.error("API response missing image data. Full response:", JSON.stringify(response, null, 2));

            return {
                statusCode: 500,
                headers: CORS_HEADERS, // Include CORS headers in error response
                body: JSON.stringify({ 
                    error: `Generation Error: ${errorMessage}` 
                })
            };
            // ====================================
        }

    } catch (error) {
        // Extract and format the specific quota error message if present
        let errorMessage = error.message;

        // Try to parse the specific quota error out of the message
        try {
            const match = error.message.match(/External API Error \d+: (.*)/s);
            if (match && match[1]) {
                const apiError = JSON.parse(match[1]);
                if (apiError.error?.message) {
                    errorMessage = apiError.error.message;
                }
            }
        } catch (e) {
            // ignore JSON parsing errors
        }

        console.error('Function execution error:', error.message);
        return {
            statusCode: 500,
            headers: CORS_HEADERS, // Include CORS headers in final error response
            body: JSON.stringify({ error: `Generation Error: Failed to generate image. ${errorMessage}` })
        };
    }
};