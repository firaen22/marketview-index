import { afterEach, describe, expect, it, vi } from 'vitest';
import { callNim } from './nim';

describe('callNim sweep 23', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('falls through to the next model when a model answers with empty text', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const seen: string[] = [];
        vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => {
            const model = JSON.parse(init.body).model;
            seen.push(model);
            const content = model === 'a' ? '' : '{"ok":true}';
            return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) } as any;
        }));
        await expect(callNim(['k'], ['a', 'b'], [], 10)).resolves.toBe('{"ok":true}');
        expect(seen).toEqual(['a', 'b']);
    });

    it('throws when every model answers empty', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '  ' } }] }) }) as any));
        await expect(callNim(['k'], ['a'], [], 10)).rejects.toThrow('All NIM keys/models failed');
    });
});
