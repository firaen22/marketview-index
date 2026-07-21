// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { useMacroData } = await import('./useMacroData');

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface RecordedCall {
    url: string;
    resolve: (body: unknown) => void;
}

let calls: RecordedCall[];
let root: Root;
let container: HTMLDivElement;
let latest: ReturnType<typeof useMacroData>;

function Harness() {
    latest = useMacroData({ lang: 'en' });
    return null;
}

async function flush() {
    for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
    }
}

beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
        return new Promise((resolve) => {
            calls.push({
                url: String(input),
                resolve: (body: unknown) => resolve({ ok: true, json: async () => body }),
            });
        });
    }));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.unstubAllGlobals();
});

describe('useMacroData sweep-14 regression', () => {
    it('a slow earlier request cannot overwrite the result of a newer refresh', async () => {
        await act(async () => { root.render(createElement(Harness)); });
        await flush();
        expect(calls.length).toBe(1); // initial fetch, left pending

        act(() => { void latest.refresh(true); });
        await flush();
        expect(calls.length).toBe(2);

        // Newer (forced) request resolves first with fresh data…
        await act(async () => {
            calls[1].resolve({ success: true, data: [{ id: 'fresh' }] });
        });
        await flush();
        expect(latest.data).toEqual([{ id: 'fresh' }]);

        // …then the stale initial request finally resolves. It must be discarded.
        await act(async () => {
            calls[0].resolve({ success: true, data: [{ id: 'stale' }] });
        });
        await flush();
        expect(latest.data).toEqual([{ id: 'fresh' }]);
    });
});
