import { describe, it, expect, afterEach } from 'vitest';
import { getNimApiKeys, extractNimText } from '../lib/nim';

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
