import { beforeEach, describe, expect, it, vi } from 'vitest';

const googleState = vi.hoisted(() => ({
    generateContent: vi.fn(),
    constructorArgs: [] as any[],
}));

const nimState = vi.hoisted(() => ({
    getNimApiKeys: vi.fn(),
    callNim: vi.fn(),
    callNimHedged: vi.fn(),
}));

vi.mock('@google/genai', () => ({
    GoogleGenAI: vi.fn().mockImplementation(function (args: any) {
        googleState.constructorArgs.push(args);
        return { models: { generateContent: googleState.generateContent } };
    }),
}));

vi.mock('../lib/nim.js', () => ({
    getNimApiKeys: nimState.getNimApiKeys,
    callNim: nimState.callNim,
    callNimHedged: nimState.callNimHedged,
    NIM_TEXT_MODELS: ['nim-text'],
    NIM_VISION_MODELS: ['nim-vision'],
}));

vi.mock('../lib/redis.js', () => ({
    redis: null,
}));

const { default: handler } = await import('./explain-jargon');

function makeReq(body: any) {
    return {
        method: 'POST',
        headers: {},
        body,
    };
}

function makeRes() {
    const res: any = {
        statusCode: 0,
        headersSent: false,
        body: undefined,
        setHeader: vi.fn(),
        status: vi.fn((status: number) => {
            res.statusCode = status;
            return res;
        }),
        json: vi.fn((body: unknown) => {
            res.body = body;
            res.headersSent = true;
            return res;
        }),
    };
    return res;
}

async function call(body: any) {
    const res = makeRes();
    await handler(makeReq(body) as any, res);
    return res;
}

describe('explain-jargon API handler', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        googleState.generateContent.mockReset();
        googleState.constructorArgs = [];
        nimState.getNimApiKeys.mockReset();
        nimState.callNim.mockReset();
        nimState.callNimHedged.mockReset();
        process.env.GEMINI_API_KEY = 'abcdefghijklmnopqrstuvwxyz';
        delete process.env.GEMINI_API_KEY_FALLBACK;
        nimState.getNimApiKeys.mockReturnValue(['nim-key']);
        nimState.callNim.mockResolvedValue('{"terms":[{"term":"Duration","explanation":"Interest-rate sensitivity."}]}');
    });

    it('rejects malformed Gemini JSON and falls back to NIM', async () => {
        googleState.generateContent
            .mockResolvedValueOnce({ text: 'not json' })
            .mockResolvedValueOnce({ text: '' });

        const res = await call({ text: 'Duration measures bond sensitivity.', lang: 'en' });

        expect(res.statusCode).toBe(200);
        expect(res.body.terms).toHaveLength(1);
        expect(res.body.terms[0].term).toBe('Duration');
        expect(nimState.callNim).toHaveBeenCalledTimes(1);
        expect(googleState.constructorArgs[0]).toMatchObject({ httpOptions: { timeout: 20000 } });
    });

    it('accepts parseable non-object Gemini JSON without using NIM', async () => {
        googleState.generateContent.mockResolvedValueOnce({ text: '[]' });

        const res = await call({ text: 'Plain slide text.', lang: 'en' });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true, terms: [] });
        expect(nimState.callNim).not.toHaveBeenCalled();
    });

    it('uses the vision timeout for image Gemini calls', async () => {
        googleState.generateContent.mockResolvedValueOnce({ text: '{"terms":[]}' });

        const res = await call({ imageBase64: 'A'.repeat(100), lang: 'en' });

        expect(res.statusCode).toBe(200);
        expect(googleState.constructorArgs[0]).toMatchObject({ httpOptions: { timeout: 50000 } });
    });

    it('returns 502 when the final backend output is malformed JSON', async () => {
        delete process.env.GEMINI_API_KEY;
        nimState.callNim.mockResolvedValue('not json');

        const res = await call({ text: 'Duration measures bond sensitivity.', lang: 'en' });

        expect(res.statusCode).toBe(502);
        expect(res.body).toEqual({ success: false, error: 'AI processing failed' });
    });
});
