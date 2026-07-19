// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexChartModal } from './IndexChartModal';
import type { IndexData } from '../types';

// LineChart re-exposes the rows it was handed so a test can assert WHICH period
// got plotted; everything else is inert.
vi.mock('recharts', () => ({
    LineChart: ({ data, children }: { data?: unknown; children?: React.ReactNode }) =>
        <div data-testid="chart" data-rows={JSON.stringify(data)}>{children}</div>,
    Line: () => null,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Tooltip: () => null,
    Legend: () => null,
    CartesianGrid: () => null,
    // Renders a formatted tick so the per-range axis format is assertable; a
    // `() => null` stub would leave tickFormatter permanently uncalled.
    XAxis: ({ tickFormatter }: { tickFormatter?: (v: string) => string }) =>
        <div data-testid="xtick">{tickFormatter?.('2021-07-19T00:00:00.000Z')}</div>,
    YAxis: () => null,
}));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function index(symbol: string, history: Array<{ date: string; value: number }>): IndexData {
    return {
        symbol,
        name: symbol,
        nameEn: symbol,
        category: 'Asia',
        price: history.at(-1)?.value ?? 0,
        change: 0,
        changePercent: 0,
        history,
    } as unknown as IndexData;
}

const YTD_HISTORY = [{ date: '2026-01-02', value: 100 }, { date: '2026-07-19', value: 110 }];
const FIVE_YEAR_HISTORY = [{ date: '2021-07-19', value: 40 }, { date: '2026-07-19', value: 110 }];

describe('IndexChartModal page-range switch', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    function renderModal(props: Partial<React.ComponentProps<typeof IndexChartModal>>) {
        act(() => {
            root.render(
                <IndexChartModal
                    item={index('^HSI', YTD_HISTORY)}
                    allData={[index('^HSI', YTD_HISTORY)]}
                    onClose={() => {}}
                    pageRange="YTD"
                    {...props}
                />,
            );
        });
    }

    it('plots the page data, not the open-time snapshot, after the page range moves', () => {
        // `item` is the object the page held when the chart opened (YTD); allData has
        // already been refetched for 5Y. Every line must come from the same period.
        renderModal({
            item: index('^HSI', YTD_HISTORY),
            allData: [index('^HSI', FIVE_YEAR_HISTORY)],
            pageRange: '5Y',
        });

        const rows = JSON.parse(container.querySelector('[data-testid="chart"]')!.getAttribute('data-rows')!);
        expect(rows).toHaveLength(FIVE_YEAR_HISTORY.length);
        expect(rows[0].date).toBe('2021-07-19');
    });

    it('puts a year on the axis for long ranges and keeps the day for short ones', () => {
        // A 5Y axis formatted month+day prints "Mar 3 … Mar 3" for ticks years apart,
        // and the projector audience only ever sees the axis — the tooltip has the
        // year but is never shown on stage.
        renderModal({
            item: index('^HSI', FIVE_YEAR_HISTORY),
            allData: [index('^HSI', FIVE_YEAR_HISTORY)],
            pageRange: '5Y',
        });
        expect(container.querySelector('[data-testid="xtick"]')!.textContent).toContain('21');

        renderModal({
            item: index('^HSI', YTD_HISTORY),
            allData: [index('^HSI', YTD_HISTORY)],
            pageRange: '1W',
        });
        expect(container.querySelector('[data-testid="xtick"]')!.textContent).toContain('19');
    });

    it('shows the loading placeholder while the page refetch is still in flight', () => {
        renderModal({ allData: [], pageRange: '5Y', pageLoading: true });

        expect(container.textContent).toContain('Loading');
        expect(container.querySelector('[data-testid="chart"]')).toBeNull();
    });

    it('falls through to the no-history placeholder once the page fetch has stopped', () => {
        // A failed fetch leaves allData empty indefinitely. The modal must not sit on
        // a spinner for the rest of the show, and must not fall back to the snapshot.
        renderModal({ allData: [], pageRange: '5Y', pageLoading: false });

        expect(container.textContent).not.toContain('Loading');
        expect(container.textContent).toContain('No history data available');
        expect(container.querySelector('[data-testid="chart"]')).toBeNull();
    });
});
