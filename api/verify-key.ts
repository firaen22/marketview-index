import { GoogleGenAI } from '@google/genai';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const { apiKey } = req.body;
        if (!apiKey) {
            return res.status(400).json({ success: false, message: 'API Key is required' });
        }

        const genAI = new GoogleGenAI({ apiKey });

        // Attempt to list models to verify the key and its permissions
        const modelListResult: any = await genAI.models.list();
        const models = modelListResult.models || [];

        // Filter for Gemini models that support text generation
        const geminiModels = models.filter((m: any) =>
            m.name.includes('gemini')
        ).map((m: any) => ({
            name: m.name.replace('models/', ''),
            displayName: m.displayName,
            description: m.description,
            version: m.version
        }));

        const hasFlash20 = geminiModels.some(m => m.name.includes('2.0-flash'));
        const hasFlash15 = geminiModels.some(m => m.name.includes('1.5-flash'));

        return res.status(200).json({
            success: true,
            models: geminiModels,
            recommended: hasFlash20 ? 'gemini-2.0-flash' : (hasFlash15 ? 'gemini-1.5-flash' : 'gemini-pro'),
            keyValid: true
        });

    } catch (error: any) {
        console.error('API Key Verification Error:', error);
        return res.status(200).json({
            success: false,
            keyValid: false,
            message: error.message || 'Invalid API Key or permission denied.'
        });
    }
}
