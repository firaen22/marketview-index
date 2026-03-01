import { GoogleGenAI } from '@google/genai';

async function analyzeKey() {
    const apiKey = "AIzaSyC51CL7Kd4szcEzelVfJsHmDdZ6h3Sn_m0";
    const genAI = new GoogleGenAI({ apiKey });

    console.log("--- Analyzing Key Permissions ---");
    try {
        const result = await genAI.models.list();
        const allModels = result.models || [];

        if (allModels.length === 0) {
            console.log("No models accessible at all.");
        } else {
            console.log(`Found ${allModels.length} accessible models:`);
            allModels.forEach(m => {
                console.log(`- ID: ${m.name.replace('models/', '')} (${m.displayName})`);
            });
        }
    } catch (error) {
        console.error("ANALYSIS FAILED:", error.message);
    }
}

analyzeKey();
