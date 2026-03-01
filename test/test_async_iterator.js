import { GoogleGenAI } from '@google/genai';

async function analyzeKey() {
    const apiKey = "AIzaSyC51CL7Kd4szcEzelVfJsHmDdZ6h3Sn_m0";
    const genAI = new GoogleGenAI({ apiKey });

    try {
        const response = await genAI.models.list();
        console.log("Response keys:", Object.keys(response));

        let modelCount = 0;
        for await (const model of response) {
            modelCount++;
            if (modelCount <= 3) {
                console.log(`Model ${modelCount}:`, model.name);
            }
        }
        console.log("Total models iterated:", modelCount);
    } catch (error) {
        console.error("SDK FAILED:", error.message);
    }
}

analyzeKey();
