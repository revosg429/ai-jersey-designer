// --- NETLIFY FUNCTION HANDLER ---

/*
  This file is structured to be deployed as a Netlify Function.
  It is triggered by an HTTPS request and accesses the API key 
  from a secure environment variable.
*/

// IMPORTANT: The API Key MUST be stored in an environment variable named GEMINI_API_KEY on Netlify.
const API_KEY = process.env.GEMINI_API_KEY; 

const GEMINI_MODEL = 'gemini-2.5-flash-image-preview';
// Note: We are using the native global fetch() available in modern Node.js environments.

// Netlify Function Handler Signature: exports.handler = async (event, context)
exports.handler = async (event, context) => {
    // 1. CORS Preflight Check (Crucial for cross-origin requests from the frontend)
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*', // Replace * with your actual site URL when deployed
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        };
    }
    
    // Check for API Key before proceeding
    if (!API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "CRITICAL: API Key not configured on the server." }),
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" }),
        };
    }

    try {
        // Parse the request body from the frontend
        const body = JSON.parse(event.body);
        const { prompt, logoData } = body;

        const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;

        // 2. Construct the secure payload for the Google API
        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: logoData.mimeType,
                            data: logoData.data
                        }
                    }
                ]
            }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE']
            },
        };

        // 3. Call the Google API securely from the Netlify Function
        const apiResponse = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!apiResponse.ok) {
            const errorBody = await apiResponse.json();
            console.error("Gemini API Error:", errorBody);
            // Forward relevant error to the client
            return {
                statusCode: apiResponse.status,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: errorBody.error?.message || 'Gemini API call failed.' }),
            };
        }

        const result = await apiResponse.json();
        
        // 4. Extract ONLY the base64 image data
        const base64Data = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

        if (base64Data) {
            // 5. Send only the image data back to the client
            return {
                statusCode: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ base64Data: base64Data }),
            };
        } else {
            return {
                statusCode: 500,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: "Image generation failed to return data." }),
            };
        }

    } catch (error) {
        console.error("Netlify Function internal error:", error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: `Internal server error: ${error.message}` }),
        };
    }
};