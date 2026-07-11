import { describe, it, expect, afterEach, vi } from 'vitest';
import { getNimApiKeys, extractNimText, callNimHedged } from '../lib/nim';

const ORIGINAL_KEY = process.env.NVIDIA_NIM_API_KEY;
const ORIGINAL_FALLBACK = process.env.NVIDIA_NIM_API_KEY_FALLBACK;

function restoreEnv(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

describe('getNimApiKeys', () => {
    afterEach(() => {
        restoreEnv('NVIDIA_NIM_API_KEY', ORIGINAL_KEY);
        restoreEnv('NVIDIA_NIM_API_KEY_FALLBACK', ORIGINAL_FALLBACK);
    });

    it('returns [] when both env vars are unset', () => {
        delete process.env.NVIDIA_NIM_API_KEY;
        delete process.env.NVIDIA_NIM_API_KEY_FALLBACK;
        expect(getNimApiKeys()).toEqual([]);
    });

    it('returns a single key', () => {
        process.env.NVIDIA_NIM_API_KEY = 'nvapi-abc';
        delete process.env.NVIDIA_NIM_API_KEY_FALLBACK;
        expect(getNimApiKeys()).toEqual(['nvapi-abc']);
    });

    it('splits comma-separated keys and trims spaces', () => {
        process.env.NVIDIA_NIM_API_KEY = 'nvapi-a, nvapi-b ,nvapi-c';
        delete process.env.NVIDIA_NIM_API_KEY_FALLBACK;
        expect(getNimApiKeys()).toEqual(['nvapi-a', 'nvapi-b', 'nvapi-c']);
    });

    it('reads the fallback var after the primary', () => {
        process.env.NVIDIA_NIM_API_KEY = 'nvapi-a';
        process.env.NVIDIA_NIM_API_KEY_FALLBACK = 'nvapi-b';
        expect(getNimApiKeys()).toEqual(['nvapi-a', 'nvapi-b']);
    });

    it('works with fallback only', () => {
        delete process.env.NVIDIA_NIM_API_KEY;
        process.env.NVIDIA_NIM_API_KEY_FALLBACK = 'nvapi-b';
        expect(getNimApiKeys()).toEqual(['nvapi-b']);
    });

    it('returns [] for empty-string and comma-only values', () => {
        process.env.NVIDIA_NIM_API_KEY = '';
        process.env.NVIDIA_NIM_API_KEY_FALLBACK = ' , ,';
        expect(getNimApiKeys()).toEqual([]);
    });
});

describe('extractNimText', () => {
    it('returns plain content', () => {
        expect(extractNimText({ content: '{"terms":[]}' })).toBe('{"terms":[]}');
    });

    it('falls back to reasoning_content when content is empty', () => {
        expect(extractNimText({ content: '', reasoning_content: '{"a":1}' })).toBe('{"a":1}');
    });

    it('falls back to reasoning_content when content is whitespace', () => {
        expect(extractNimText({ content: '   ', reasoning_content: '{"a":1}' })).toBe('{"a":1}');
    });

    it('falls back to reasoning_content when content is not a string', () => {
        expect(extractNimText({ content: 42, reasoning_content: '{"a":1}' })).toBe('{"a":1}');
    });

    it('returns empty string when both are missing or empty', () => {
        expect(extractNimText({ content: '', reasoning_content: '' })).toBe('');
        expect(extractNimText({})).toBe('');
    });

    it('returns empty string for null / undefined / non-object', () => {
        expect(extractNimText(null)).toBe('');
        expect(extractNimText(undefined)).toBe('');
        expect(extractNimText('string')).toBe('');
    });

    it('strips a ```json fence', () => {
        expect(extractNimText({ content: '```json\n{"terms":[]}\n```' })).toBe('{"terms":[]}');
    });

    it('strips a bare ``` fence', () => {
        expect(extractNimText({ content: '```\n{"terms":[]}\n```' })).toBe('{"terms":[]}');
    });

    it('passes unfenced content through unchanged', () => {
        expect(extractNimText({ content: '{"x": "no fences here"}' })).toBe('{"x": "no fences here"}');
    });

    it('does not touch interior backticks', () => {
        const payload = '{"explanation": "use `duration` here"}';
        expect(extractNimText({ content: payload })).toBe(payload);
    });
});

describe('callNimHedged', () => {
    const ORIGINAL_FETCH = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = ORIGINAL_FETCH;
        vi.restoreAllMocks();
    });

    type Behaviour = { latencyMs: number; ok: boolean };

    // Stub NIM's HTTP layer so each model resolves/fails on a controllable
    // timer. Returns a live per-model call counter so tests can prove which
    // models were actually fired (the whole point of the hedge is that healthy
    // runs fire ONLY the primary).
    function installFakeNim(behaviours: Record<string, Behaviour>) {
        const calls: Record<string, number> = {};
        globalThis.fetch = vi.fn((_url: string, init: any) => {
            const model = JSON.parse(init.body).model as string;
            calls[model] = (calls[model] ?? 0) + 1;
            const b = behaviours[model];
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve(b.ok
                        ? { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: `WON:${model}` } }] }) }
                        : { ok: false, status: 500, text: async () => 'boom' });
                }, b.latencyMs);
            });
        }) as unknown as typeof fetch;
        return calls;
    }

    const KEYS = ['k1'];
    const OPTS = { timeoutMs: 2000, hedgeDelayMs: 50 };

    it('fast primary wins alone — backups never fire', async () => {
        const calls = installFakeNim({
            A: { latencyMs: 5, ok: true },
            B: { latencyMs: 5, ok: true },
            C: { latencyMs: 5, ok: true },
        });
        const result = await callNimHedged(KEYS, ['A', 'B', 'C'], [], 10, OPTS);
        expect(result).toBe('WON:A');
        expect(calls).toEqual({ A: 1 }); // B and C never called
    });

    it('slow primary → escalates after the delay and a backup wins', async () => {
        const calls = installFakeNim({
            A: { latencyMs: 400, ok: true }, // primary lags past the 50ms hedge
            B: { latencyMs: 5, ok: true },   // backup answers first
            C: { latencyMs: 400, ok: true },
        });
        const result = await callNimHedged(KEYS, ['A', 'B', 'C'], [], 10, OPTS);
        expect(result).toBe('WON:B');
        expect(calls.A).toBe(1);
        expect(calls.B).toBe(1);
        expect(calls.C).toBe(1); // both backups fired on escalation
    });

    it('primary fails fast → escalates immediately, not after the full delay', async () => {
        const calls = installFakeNim({
            A: { latencyMs: 5, ok: false }, // primary rejects almost instantly
            B: { latencyMs: 5, ok: true },
            C: { latencyMs: 5, ok: true },
        });
        const start = Date.now();
        const result = await callNimHedged(KEYS, ['A', 'B', 'C'], [], 10, { timeoutMs: 2000, hedgeDelayMs: 500 });
        const elapsed = Date.now() - start;
        expect(result).toBe('WON:B');
        expect(calls.A).toBe(1);
        expect(calls.B).toBe(1);
        expect(elapsed).toBeLessThan(400); // did NOT wait the 500ms hedge delay
    });

    it('all models fail → rejects', async () => {
        installFakeNim({
            A: { latencyMs: 5, ok: false },
            B: { latencyMs: 5, ok: false },
            C: { latencyMs: 5, ok: false },
        });
        await expect(callNimHedged(KEYS, ['A', 'B', 'C'], [], 10, OPTS)).rejects.toThrow();
    });

    it('single model → returns it with no backups', async () => {
        const calls = installFakeNim({ A: { latencyMs: 5, ok: true } });
        const result = await callNimHedged(KEYS, ['A'], [], 10, OPTS);
        expect(result).toBe('WON:A');
        expect(calls).toEqual({ A: 1 });
    });
});
