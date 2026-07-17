import { describe, expect, it, vi } from 'vitest';
import type { CatalogItem } from '../lib/presentCommand';
import { findMacro, normalizeMacros, resolveMacros, runMacro, validateMacroDraft, type Macro } from './copilotMacros';

const catalog: CatalogItem[] = [
    { symbol: '^HSI', name: '恒生指數', nameEn: 'Hang Seng Index', group: 'market' },
    { symbol: '^GSPC', name: '標普500', nameEn: 'S&P 500', group: 'market' },
];

describe('copilot macro helpers', () => {
    it('normalizes custom macros and resolves built-in shadowing', () => {
        const custom = normalizeMacros([
            { name: ' opening ', steps: [' heatmap '] },
            { name: '', steps: ['x'] },
            { name: 'bad', steps: [] },
            { name: 'long-step', steps: ['🧠'.repeat(200)] },
            { name: 'too-long-step', steps: ['🧠'.repeat(201)] },
        ]);

        expect(custom).toEqual([
            { name: 'opening', steps: ['heatmap'] },
            { name: 'long-step', steps: ['🧠'.repeat(200)] },
        ]);
        expect(resolveMacros(custom).find(macro => macro.name === 'opening')?.steps).toEqual(['heatmap']);
        expect(resolveMacros(custom).some(macro => macro.name === 'q&a')).toBe(true);
    });

    it('finds macros case-insensitively after trimming', () => {
        expect(findMacro(' OPENING ', [{ name: 'opening', steps: ['x'] }])?.name).toBe('opening');
        expect(findMacro('missing', [{ name: 'opening', steps: ['x'] }])).toBeNull();
    });

    it('rejects (not throws on) non-string step values from malformed callers', () => {
        const result = validateMacroDraft('My macro', [null, undefined, 42, 'show HSI'] as unknown as string[], {
            catalog,
            quickLabels: [],
            existingMacros: [],
        });

        // Non-string entries are dropped like blank lines; the valid step survives.
        expect(result).toEqual({ ok: true, macro: { name: 'My macro', steps: ['show HSI'] } });
        expect(() => validateMacroDraft('My macro', [null] as unknown as string[], { catalog, quickLabels: [], existingMacros: [] })).not.toThrow();
    });

    it('validates macro names against commands, glossary, prefixes, quick labels, and duplicates', () => {
        const existing: Macro[] = [{ name: 'Morning', steps: ['heatmap'] }];

        const validate = (name: string, quickLabels = ['Heatmap'], editingName?: string) => validateMacroDraft(name, ['show HSI'], { catalog, quickLabels, existingMacros: existing, editingName });

        expect(validate('My macro')).toEqual({ ok: true, macro: { name: 'My macro', steps: ['show HSI'] } });
        expect(validate('HSI')).toMatchObject({ ok: false, message: expect.stringContaining('command') });
        expect(validate('EBITDA')).toMatchObject({ ok: false, message: expect.stringContaining('glossary') });
        expect(validate('duration')).toMatchObject({ ok: false, message: expect.stringContaining('glossary') });
        expect(validate('explain duration')).toMatchObject({ ok: false, message: expect.stringContaining('prefix') });
        expect(validate('focus HSI')).toMatchObject({ ok: false, message: expect.stringContaining('prefix') });
        expect(validate('聚焦恒指')).toMatchObject({ ok: false, message: expect.stringContaining('prefix') });
        expect(validate('解釋久期')).toMatchObject({ ok: false, message: expect.stringContaining('prefix') });
        expect(validate('explainer')).toEqual({ ok: true, macro: { name: 'explainer', steps: ['show HSI'] } });
        expect(validate('heatmap')).toMatchObject({ ok: false, message: expect.stringContaining('quick') });
        expect(validate('Morning', ['Dashboard'])).toMatchObject({ ok: false, message: expect.stringContaining('duplicates') });
        expect(validate('morning', ['Dashboard'])).toMatchObject({ ok: false, message: expect.stringContaining('duplicates') });
        expect(validate('Morning', ['Dashboard'], 'Morning')).toEqual({ ok: true, macro: { name: 'Morning', steps: ['show HSI'] } });
        expect(validate('   ', ['Dashboard'])).toMatchObject({ ok: false, message: expect.stringContaining('required') });
    });
});

describe('runMacro', () => {
    it('runs steps serially, continues after failed and throwing steps, and uses the passed sendStep directly', async () => {
        vi.useFakeTimers();
        const sendStep = vi.fn(async (text: string) => {
            if (text === 'bad') return null;
            if (text === 'throw') throw new Error('nope');
            return { id: text };
        });
        const progress = vi.fn();
        const promise = runMacro({ name: 'm', steps: ['a', 'bad', 'throw', 'b'] }, sendStep, progress, new AbortController().signal);

        await vi.advanceTimersByTimeAsync(2700);
        await expect(promise).resolves.toEqual({ completed: 2, failed: 2 });
        expect(sendStep).toHaveBeenNthCalledWith(1, 'a');
        expect(sendStep).toHaveBeenNthCalledWith(2, 'bad');
        expect(sendStep).toHaveBeenNthCalledWith(3, 'throw');
        expect(sendStep).toHaveBeenNthCalledWith(4, 'b');
        expect(progress).toHaveBeenCalledTimes(4);
        vi.useRealTimers();
    });

    it('returns empty counts for empty or already-aborted macros', async () => {
        const sendStep = vi.fn();
        const aborted = new AbortController();
        aborted.abort();

        await expect(runMacro({ name: 'empty', steps: [] }, sendStep, vi.fn(), new AbortController().signal)).resolves.toEqual({ completed: 0, failed: 0 });
        await expect(runMacro({ name: 'abort', steps: ['a'] }, sendStep, vi.fn(), aborted.signal)).resolves.toEqual({ completed: 0, failed: 0 });
        expect(sendStep).not.toHaveBeenCalled();
    });

    it('returns partial counts on abort between steps without throwing', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const sendStep = vi.fn(async () => ({ id: 'ok' }));
        const promise = runMacro({ name: 'm', steps: ['a', 'b'] }, sendStep, vi.fn(), controller.signal);

        await vi.waitFor(() => expect(sendStep).toHaveBeenCalledTimes(1));
        controller.abort();
        await expect(promise).resolves.toEqual({ completed: 1, failed: 0 });
        expect(sendStep).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });
});
