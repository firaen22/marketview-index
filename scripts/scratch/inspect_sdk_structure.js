import { GoogleGenAI } from '@google/genai';

async function analyzeKey() {
    const apiKey = "AIzaSyC51CL7Kd4szcEzelVfJsHmDdZ6h3Sn_m0";
    const genAI = new GoogleGenAI({ apiKey });

    try {
        const result = await genAI.models.list();
        console.log("Type of result:", typeof result);
        console.log("Is array?", Array.isArray(result));
        console.log("Keys of result:", Object.keys(result));

        // Check if it's an array-like object or has a models property
        const models = Array.isArray(result) ? result : (result.models || []);
        console.log("Models length:", models.length);
        if (models.length > 0) {
            console.log("First model name:", models[0].name);
        }
    } catch (error) {
        console.error("SDK FAILED:", error.message);
    }
}

analyzeKey();
