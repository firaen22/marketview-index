// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useMarketData } from './useMarketData';

/**
 * Regression coverage for the `requestSeqRef` stale-response guard.
 *
 * This is the repo's #1 recurring bug class (retrofitted one file at a time into
 * useMarketData #2, useNewsData #21, useJargon, useSlideSync #21) and it had NO
 * automated coverage on this hook: deleting the guard line left the entire suite
 * green. Rapid range-switching on the projector is the live reproduction — an
 * older request landing last repaints the chart with the previous range's numbers
 * and nothing flags it, because the payload itself is a valid success.
 *
 * The guard now also gates `dataMode`/`lastUpdatedAt`, so a lost race would
 * additionally mislabel freshness, not just data.
 */

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

function response(symbol: string, timestamp: string): Response {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
            success: true,
            source: 'live_api_cached',
            timestamp,
            data: [{
                symbol, name: symbol, price: 100, changePercent: 1,
                change: 1, ytdChange: 5, ytdChangePercent: 5,
                open: 100, high: 100, low: 100, history: [], category: 'US',
            }],
        }),
    } as unknown as Response;
}

describe('useMarketData out-of-order response guard', () => {
    let container: HTMLDivElement;
    let root: Root;
    let latest: ReturnType<typeof useMarketData>;
    let gates: ReturnType<typeof deferred<Response>>[];

    beforeEach(() => {
        localStorage.clear();
        gates = [];
        container = document.createElement('div');
        root = createRoot(container);
        vi.stubGlobal('fetch', vi.fn(() => {
            const gate = deferred<Response>();
            gates.push(gate);
            return gate.promise;
        }));
    });
    afterEach(() => {
        act(() => root.unmount());
        vi.restoreAllMocks();
    });

    function Probe({ range }: { range: string }) {
        latest = useMarketData({ range, lang: 'en' });
        return null;
    }

    it('a slower older request must not overwrite a newer one that already landed', async () => {
        await act(async () => { root.render(createElement(Probe, { range: 'YTD' })); });
        expect(gates.length, 'mount should issue exactly one fetch').toBe(1);

        await act(async () => { gates[0].resolve(response('MOUNT', '2026-07-20T00:00:00.000Z')); });
        expect(latest.data.map((d) => d.symbol)).toEqual(['MOUNT']);

        // Two overlapping refreshes; neither has resolved yet.
        await act(async () => { latest.refresh(); });
        await act(async () => { latest.refresh(); });
        expect(gates.length).toBe(3);

        // The NEWER request (index 2) wins the race back.
        await act(async () => { gates[2].resolve(response('NEW', '2026-07-20T02:00:00.000Z')); });
        expect(latest.data.map((d) => d.symbol)).toEqual(['NEW']);
        expect(latest.lastUpdatedAt).toBe(Date.parse('2026-07-20T02:00:00.000Z'));

        // The OLDER request (index 1) arrives late. Without the guard it would
        // repaint stale numbers over fresh ones and rewind lastUpdatedAt.
        await act(async () => { gates[1].resolve(response('OLD', '2026-07-20T01:00:00.000Z')); });
        expect(latest.data.map((d) => d.symbol), 'older response overwrote a newer one').toEqual(['NEW']);
        expect(latest.lastUpdatedAt, 'older response rewound lastUpdatedAt').toBe(
            Date.parse('2026-07-20T02:00:00.000Z'),
        );
    });
});
