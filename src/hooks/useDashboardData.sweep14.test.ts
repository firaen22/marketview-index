// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const { useDashboardData } = await import('./useDashboardData');

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface RecordedCall {
    url: string;
    signal: AbortSignal | undefined;
    resolve: (body: unknown) => void;
}

let marketCalls: RecordedCall[];
let root: Root;
let container: HTMLDivElement;
let latest: ReturnType<typeof useDashboardData>;

function Harness() {
    latest = useDashboardData({ timeRange: 'YTD', language: 'en', geminiKey: '', lastUpdatedLabel: 'Updated' });
    return null;
}

async function flush() {
    for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
    }
}

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    marketCalls = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/api/market-news')) {
            return Promise.resolve({
                ok: true,
                json: async () => ({ success: true, data: [], marketSummary: '', isAiTranslated: true }),
            });
        }
        return new Promise((resolve, reject) => {
            const signal = init?.signal ?? undefined;
            signal?.addEventListener('abort', () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
            });
            marketCalls.push({
                url,
                signal,
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
    vi.useRealTimers();
});

describe('useDashboardData sweep-14 regressions', () => {
    it('hourly background poll does not abort an in-flight forced foreground refresh', async () => {
        await act(async () => { root.render(createElement(Harness)); });
        await flush();
        expect(marketCalls.length).toBe(1); // initial foreground fetch

        // User clicks refresh: forced foreground fetch (may abort the initial one — that is fine).
        act(() => { latest.refresh(); });
        await flush();
        expect(marketCalls.length).toBe(2);
        const forced = marketCalls[1];
        expect(forced.url).toContain('refresh=true');
        expect(forced.signal?.aborted).toBe(false);

        // Hourly poll fires while the forced refresh is still in flight.
        await act(async () => { vi.advanceTimersByTime(60 * 60 * 1000); });
        await flush();
        expect(marketCalls.length).toBe(3);

        // The background poll must NOT cancel the user's forced refresh.
        expect(forced.signal?.aborted).toBe(false);
    });

    it('stale-cache/success:false responses still update lastUpdated', async () => {
        await act(async () => { root.render(createElement(Harness)); });
        await flush();
        expect(marketCalls.length).toBe(1);

        const ts = '2026-07-21T02:00:00.000Z';
        await act(async () => {
            marketCalls[0].resolve({
                success: false,
                source: 'server_stale_cache',
                timestamp: ts,
                data: [{ symbol: '^HSI', name: 'Hang Seng Index', category: 'Asia', price: 1, change: 0, changePercent: 0, ytdChange: 0, ytdChangePercent: 0, history: [] }],
            });
        });
        await flush();

        expect(latest.fallbackMessage).toBeTruthy();
        expect(latest.lastUpdated?.toISOString()).toBe(ts);
    });
});
