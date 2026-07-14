import { GoogleGenAI } from '@google/genai';

async function testGeneration() {
    const apiKey = "AIzaSyC51CL7Kd4szcEzelVfJsHmDdZ6h3Sn_m0";
    const genAI = new GoogleGenAI({ apiKey });

    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: 'Say "Hello, MarketView"' }] }]
        });

        console.log("--- Generation Result ---");
        console.log("Response Keys:", Object.keys(response));

        // Check if it's a function or property
        if (typeof response.text === 'function') {
            console.log("response.text() result:", await response.text());
        } else {
            console.log("response.text property:", response.text);
        }

    } catch (error) {
        console.error("GENERATION FAILED:", error.message);
    }
}

testGeneration();
