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

        // Phase 1: List models to check initial authorization
        let geminiModels: any[] = [];
        try {
            const modelListResult: any = await genAI.models.list();
            for await (const model of modelListResult) {
                if (model.name.includes('gemini')) {
                    geminiModels.push({
                        name: model.name.replace('models/', ''),
                        displayName: model.displayName
                    });
                }
            }
        } catch (listErr: any) {
            const errMsg = listErr.message || '';
            if (errMsg.includes('apiKey expired')) {
                return res.status(200).json({ success: false, keyValid: false, errorCode: 'KEY_EXPIRED', message: 'The API key has expired. Please renew it in Google AI Studio.' });
            }
            if (errMsg.includes('API key not found') || errMsg.includes('invalid')) {
                return res.status(200).json({ success: false, keyValid: false, errorCode: 'KEY_INVALID', message: 'Invalid API key format or the key does not exist.' });
            }
            throw listErr; // Fall through to general catch
        }

        if (geminiModels.length === 0) {
            return res.status(200).json({ success: false, keyValid: false, errorCode: 'NO_GEMINI_MODELS', message: 'This key is valid but does not have access to any Gemini models.' });
        }

        // Phase 2: Attempt a "Hello" generation to verify actual connectivity and usage
        try {
            // Find the best available model from the list we just got
            const preferredModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro'];
            let modelName = geminiModels[0].name; // fallback to whatever is first

            for (const preferred of preferredModels) {
                if (geminiModels.some(m => m.name === preferred)) {
                    modelName = preferred;
                    break;
                }
            }

            await genAI.models.generateContent({
                model: modelName,
                contents: [{ role: 'user', parts: [{ text: 'Ping' }] }]
            });
        } catch (genErr: any) {
            const msg = typeof genErr === 'string' ? genErr : (genErr.message || JSON.stringify(genErr));
            if (msg.includes('rate limit') || msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
                return res.status(200).json({
                    success: true,
                    keyValid: true,
                    models: geminiModels,
                    warning: 'RATE_LIMITED',
                    message: 'Your API key is VALID and has access, but has EXHAUSTED its current quota (429 Resource Exhausted). Please check your Google AI Studio plan or wait for it to reset.'
                });
            }
            if (msg.includes('safety')) {
                return res.status(200).json({ success: true, keyValid: true, models: geminiModels, message: 'Key is valid (Safety filters triggered on test ping).' });
            }
            return res.status(200).json({ success: false, keyValid: false, errorCode: 'CONNECTION_FAILED', message: `Key is valid but generation failed: ${msg.substring(0, 150)}` });
        }

        const has20 = geminiModels.some(m => m.name.includes('2.0'));
        const has15 = geminiModels.some(m => m.name.includes('1.5'));

        return res.status(200).json({
            success: true,
            keyValid: true,
            models: geminiModels,
            recommended: has20 ? 'gemini-2.0-flash' : (has15 ? 'gemini-1.5-flash' : 'gemini-pro'),
            message: 'Connectivity verified. All systems operational.'
        });

    } catch (error: any) {
        console.error('API Key Verification Error:', error);

        // Final comprehensive error parsing
        let friendlyMessage = 'An unexpected error occurred during verification.';
        const raw = error.message || '';

        if (raw.includes('apiKey expired')) friendlyMessage = '您的 API 金鑰已過期，請更換。 (Key Expired)';
        else if (raw.includes('not found')) friendlyMessage = '找不到此金鑰，請檢查輸入是否正確。 (Key Not Found)';
        else if (raw.includes('permission')) friendlyMessage = '權限不足，請確認您的 Google AI 專案已啟用。 (Permission Denied)';
        else if (raw.includes('quota')) friendlyMessage = '配額已滿或速度受限。 (Quota Exceeded)';
        else friendlyMessage = raw.substring(0, 150);

        return res.status(200).json({
            success: false,
            keyValid: false,
            message: friendlyMessage,
            rawError: process.env.NODE_ENV === 'development' ? raw : undefined
        });
    }
}
