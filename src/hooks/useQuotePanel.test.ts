// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useQuotePanel } from './useQuotePanel';
import type { IndexData, MacroData } from '../types';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const index = (symbol: string, price: number): IndexData => ({
    symbol,
    name: symbol,
    price,
    changePercent: 1.2,
    history: [],
} as unknown as IndexData);

type PanelState = ReturnType<typeof useQuotePanel>;

let root: Root | null = null;
let container: HTMLElement | null = null;
let latest: PanelState;

function Harness({ marketData, macroData }: { marketData: IndexData[]; macroData: MacroData[] }) {
    latest = useQuotePanel({ marketData, macroData });
    return null;
}

function render(marketData: IndexData[], macroData: MacroData[] = []) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(createElement(Harness, { marketData, macroData })));
    return (nextMarket: IndexData[], nextMacro: MacroData[] = []) =>
        act(() => root!.render(createElement(Harness, { marketData: nextMarket, macroData: nextMacro })));
}

afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
    root = null;
    container = null;
});

describe('useQuotePanel pinned/spotlight freshness', () => {
    it('pinned items pick up refreshed prices instead of keeping the pin-time snapshot', () => {
        const rerender = render([index('^HSI', 100)]);
        act(() => latest.toggle(latest.allItems[0]));
        expect(latest.pinned[0].value).toBe(100);

        rerender([index('^HSI', 110)]);
        expect(latest.pinned[0].value).toBe(110);
    });

    it('spotlight item picks up refreshed prices', () => {
        const rerender = render([index('^HSI', 100)]);
        act(() => latest.openSpotlight(latest.allItems[0]));
        rerender([index('^HSI', 120)]);
        expect(latest.spotlight?.value).toBe(120);
    });

    it('chart item picks up the refreshed history instead of the open-time snapshot', () => {
        // The chart modal reads .history off this object. marketData is fetched per
        // time range, so a frozen snapshot draws the OLD range under the NEW range's
        // label while the modal's comparison lines (read from live marketData) draw
        // the new one — one chart, two periods, no error surfaced.
        const ytd = index('^HSI', 100);
        (ytd as { history: unknown }).history = [{ date: '2026-01-02', value: 100 }];
        const oneYear = index('^HSI', 110);
        (oneYear as { history: unknown }).history = [
            { date: '2025-07-19', value: 90 },
            { date: '2026-07-19', value: 110 },
        ];

        const rerender = render([ytd]);
        act(() => latest.openChart(latest.allItems[0]));
        expect(latest.chartItem?.history).toHaveLength(1);

        rerender([oneYear]);
        expect(latest.chartItem?.history).toHaveLength(2);
        expect(latest.chartItem?.price).toBe(110);
    });

    it('keeps the chart snapshot as a fallback when the charted item leaves the data set', () => {
        const rerender = render([index('^HSI', 100), index('^GSPC', 50)]);
        act(() => latest.openChart(latest.allItems[0]));

        rerender([index('^GSPC', 55)]);
        expect(latest.chartItem?.symbol).toBe('^HSI');
        expect(latest.chartItem?.price).toBe(100);
    });

    it('keeps the snapshot as a fallback when the item leaves the data set', () => {
        const rerender = render([index('^HSI', 100), index('^GSPC', 50)]);
        act(() => latest.toggle(latest.allItems[0]));

        rerender([index('^GSPC', 55)]);
        expect(latest.pinned).toHaveLength(1);
        expect(latest.pinned[0].id).toBe('^HSI');
        expect(latest.pinned[0].value).toBe(100);
    });
});
