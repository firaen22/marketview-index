// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useMacroData } from './useMacroData';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let latest: ReturnType<typeof useMacroData> | null = null;

function Probe() {
    latest = useMacroData({ lang: 'en' });
    return null;
}

async function mountWith(body: unknown) {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json(body))));
    await act(async () => { root.render(<Probe />); });
    await act(async () => { await Promise.resolve(); });
}

/** useMacroData had no shape gate (useMarketData has usableQuotes): a
 *  `success:true` envelope whose `data` was null/non-array reached
 *  useQuotePanel's `.map` and threw during the /present render. */
describe('sweep 22 — useMacroData shape gate', () => {
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        latest = null;
    });
    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
        vi.unstubAllGlobals();
    });

    it('keeps data an array when a successful envelope carries null data', async () => {
        await mountWith({ success: true, data: null });
        expect(Array.isArray(latest!.data)).toBe(true);
        expect(latest!.data).toEqual([]);
        expect(latest!.isLoading).toBe(false);
    });

    it('drops rows that are not objects or have no string symbol/name', async () => {
        await mountWith({ success: true, data: [
            null,
            'junk',
            { symbol: 'CPI', name: 'CPI', value: 3, changePercent: 0.1, date: '2026-08-01' },
            { name: 'no symbol', value: 1, changePercent: 0, date: '2026-08-01' },
            { symbol: 42, name: 'numeric symbol', value: 1, changePercent: 0, date: '2026-08-01' },
        ] });
        expect(latest!.data.map((d) => d.symbol)).toEqual(['CPI']);
    });

    it('drops rows whose value/changePercent are not finite or whose date is not a string', async () => {
        // MacroStatCard dereferences value.toFixed, changePercent.toFixed and
        // date.split unguarded on / and /present.
        await mountWith({ success: true, data: [
            { symbol: 'OK', name: 'ok', value: 3, changePercent: 0.1, date: '2026-08-01' },
            { symbol: 'NOVAL', name: 'x', value: null, changePercent: 0.1, date: '2026-08-01' },
            { symbol: 'NOPCT', name: 'x', value: 1, changePercent: undefined, date: '2026-08-01' },
            { symbol: 'NODATE', name: 'x', value: 1, changePercent: 0, date: null },
        ] });
        expect(latest!.data.map((d) => d.symbol)).toEqual(['OK']);
    });
});
