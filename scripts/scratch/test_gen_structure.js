import { GoogleGenAI } from '@google/genai';

async function testGeneration() {
    const apiKey = "AIzaSyC51CL7Kd4szcEzelVfJsHmDdZ6h3Sn_m0";
    const genAI = new GoogleGenAI({ apiKey });

    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: [{ role: 'user', parts: [{ text: 'Say "Hello, MarketView"' }] }]
        });

        console.log("--- Generation Result ---");
        console.log("Response Keys:", Object.keys(response));
        console.log("Candidate 0 text:", response.candidates?.[0]?.content?.parts?.[0]?.text);
        console.log("Wait, does it have .text property?", "text" in response);

        // Check if it's a function or property
        if (typeof response.text === 'function') {
            process.stdout.write("response.text is a FUNCTION: " + await response.text() + "\n");
        } else {
            process.stdout.write("response.text is a PROPERTY: " + response.text + "\n");
        }

    } catch (error) {
        console.error("GENERATION FAILED:", error.message);
    }
}

testGeneration();
