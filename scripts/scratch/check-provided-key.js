import { GoogleGenAI } from '@google/genai';

async function verifyKey() {
    const apiKey = 'AIzaSyBFfgDRgoZxQjDeOgeIHIpV1uke3SNXqpg';
    console.log('Verifying Gemini API Key...');

    try {
        const genAI = new GoogleGenAI({ apiKey });
        const result = await genAI.models.list();
        const models = result.models || [];

        console.log(`Found ${models.length} total models.`);

        if (models.length === 0) {
            console.log('Full result:', JSON.stringify(result, null, 2));
        }

        console.log('\n--- Supported Gemini Models ---');
        models.filter(m => m.name.includes('gemini')).forEach(m => {
            console.log(`- ${m.name} (${m.displayName})`);
        });

        const hasFlash20 = models.some(m => m.name.includes('gemini-2.0-flash'));
        const hasFlash15 = models.some(m => m.name.includes('gemini-1.5-flash'));

        console.log('\nRecommended for this project:');
        if (hasFlash20) console.log('✅ gemini-2.0-flash (Available)');
        else if (hasFlash15) console.log('✅ gemini-1.5-flash (Available)');
        else console.log('⚠️ gemini-pro (Standard)');

    } catch (error) {
        console.error('\n❌ Verification Failed:');
        console.error(error.message);
    }
}

verifyKey();
