// This function handles the request to the Gemini API for image generation (multi-modal: text + image).

const API_KEY = process.env.GEMINI_API_KEY; // Ensure this is correctly named in Netlify env vars
// IMPORTANT: Switched model back to the multi-modal version to handle logo input
const MODEL_NAME = 'gemini-2.5-flash-image-preview'; 

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
        const { prompt, logoData } = JSON.parse(event.body);

        if (!prompt) {
            return { 
                statusCode: 400, 
                body: 'Missing prompt',
                headers: CORS_HEADERS,
            };
        }
        
        // **CRITICAL FIX:** Ensure the Base64 data string does not contain the URI prefix
        let rawBase64Data = logoData.data;
        if (rawBase64Data.includes(',')) {
            // Strip the part before the first comma (e.g., 'data:image/png;base64,')
            rawBase64Data = rawBase64Data.split(',')[1];
        }
        
        // Log input size for debugging potential payload limits
        console.log(`Input data size: ${rawBase64Data.length} chars (approx ${Math.ceil(rawBase64Data.length * 0.75 / 1024)} KB)`);


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

        // Switched to the generateContent endpoint for multi-modal
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
        
        // Payload structure for gemini-2.5-flash-image-preview (multi-modal)
        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: logoData.mimeType,
                            data: rawBase64Data // Use the cleaned raw base64 data
                        }
                    }
                ]
            }],
            generationConfig: {
                // Requesting both TEXT and IMAGE modalities in the response
                responseModalities: ['TEXT', 'IMAGE'] 
            }
        };

        const response = await callApiWithBackoff(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // The image data extraction path for generateContent is different from :predict
        const base64Data = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

        if (base64Data) {
            const imageUrl = `data:image/png;base64,${base64Data}`;

            return {
                statusCode: 200,
                headers: CORS_HEADERS, // Include CORS headers in success response
                body: JSON.stringify({ imageUrl: imageUrl })
            };
        } else {
            // === NEW IMPROVED ERROR HANDLING (ADJUSTED FOR GENERATECONTENT) ===
            
            const candidates = response.candidates || [];
            
            // Check for empty candidates array, often means content policy violation
            if (candidates.length === 0) {
                return {
                    statusCode: 400,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        error: "Generation Error: The input or prompt may violate safety guidelines, or the model failed to generate output."
                    })
                };
            }
            
            // Check for safety filter issues if candidates exist but no image part was found
            const safetyRating = candidates[0]?.safetyRatings?.map(r => 
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