import { GoogleGenAI } from '@google/genai';

async function analyzeKey() {
    const apiKey = "AIzaSyC51CL7Kd4szcEzelVfJsHmDdZ6h3Sn_m0";
    const genAI = new GoogleGenAI({ apiKey });

    console.log("--- Raw SDK Response ---");
    try {
        const result = await genAI.models.list();
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("SDK FAILED:", error.message);
    }
}

analyzeKey();
