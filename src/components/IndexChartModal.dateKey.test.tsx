// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexChartModal, chartDateKey } from './IndexChartModal';
import type { IndexData } from '../types';

vi.mock('recharts', () => ({
    LineChart: ({ data, children }: { data?: unknown; children?: React.ReactNode }) =>
        <div data-testid="chart" data-rows={JSON.stringify(data)}>{children}</div>,
    Line: () => null,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Tooltip: () => null,
    Legend: () => null,
    CartesianGrid: () => null,
    // Feeds the axis an impossible bare day so the label path is assertable.
    XAxis: ({ tickFormatter }: { tickFormatter?: (v: string) => string }) =>
        <div data-testid="xtick">{tickFormatter?.('2026-13-40')}</div>,
    YAxis: () => null,
}));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
// Keys are London days (zone-explicit); pin the audience's zone anyway so any
// local formatting in the render path is deterministic.
process.env.TZ = 'Asia/Hong_Kong';

function index(symbol: string, category: string, history: Array<{ date: string; value: number }>): IndexData {
    return {
        symbol,
        name: symbol,
        nameEn: symbol,
        category,
        price: history.at(-1)?.value ?? 0,
        change: 0,
        changePercent: 0,
        history,
    } as unknown as IndexData;
}

// Timestamps copied from the live /api/market-data response on 2026-09-06:
// each source stamps the same trading day at its own time-of-day.
const GSPC_1M = [
    { date: '2026-09-03T13:30:00.000Z', value: 100 },
    { date: '2026-09-04T13:30:00.000Z', value: 101 },
];
const FUND_1M = [
    { date: '2026-09-03T00:00:00.000Z', value: 10 },
    { date: '2026-09-04T00:00:00.000Z', value: 10.5 },
];
// FX bars are stamped at midnight London (23:00Z under BST): Sep 3 23:00Z is the Sep 4 bar.
const JPY_1M = [
    { date: '2026-09-02T23:00:00.000Z', value: 150 },
    { date: '2026-09-03T23:00:00.000Z', value: 153 },
];
// 5Y is weekly: ^GSPC bars are dated Monday, ^HSI Sunday, the TW fund Thursday.
const GSPC_5Y = [{ date: '2026-08-24T13:30:00.000Z', value: 100 }, { date: '2026-08-31T13:30:00.000Z', value: 101 }];
const HSI_5Y = [{ date: '2026-08-23T01:30:00.000Z', value: 200 }, { date: '2026-08-30T01:30:00.000Z', value: 202 }];
const FUND_5Y = [{ date: '2026-08-27T00:00:00.000Z', value: 10 }, { date: '2026-09-03T00:00:00.000Z', value: 10.5 }];

describe('chartDateKey', () => {
    it('collapses same-day timestamps from different sources onto one day key', () => {
        expect(chartDateKey('2026-09-04T13:30:00.000Z', '1M')).toBe('2026-09-04');
        expect(chartDateKey('2026-09-04T01:30:00.000Z', '1M')).toBe('2026-09-04');
        expect(chartDateKey('2026-09-04T00:00:00.000Z', '1M')).toBe('2026-09-04');
        expect(chartDateKey('2026-09-04', 'YTD')).toBe('2026-09-04');
    });

    it('keys on the London day, so FX bars land on the session Yahoo labels them with', () => {
        expect(chartDateKey('2026-09-03T23:00:00.000Z', '1M')).toBe('2026-09-04'); // 00:00 BST
        expect(chartDateKey('2026-09-03T22:59:59.000Z', '1M')).toBe('2026-09-03'); // 23:59 BST
        expect(chartDateKey('2026-09-04T20:59:32.000Z', '1M')).toBe('2026-09-04'); // in-progress bar
        expect(chartDateKey('2026-01-15T23:30:00.000Z', '1M')).toBe('2026-01-15'); // GMT, no shift
        expect(chartDateKey('2026-01-15T00:00:00.000Z', '1M')).toBe('2026-01-15');
    });

    it('buckets 5Y weekly bars onto the Sunday that starts their week', () => {
        expect(chartDateKey('2026-08-30T01:30:00.000Z', '5Y')).toBe('2026-08-30'); // Sun
        expect(chartDateKey('2026-08-31T13:30:00.000Z', '5Y')).toBe('2026-08-30'); // Mon
        expect(chartDateKey('2026-09-03T00:00:00.000Z', '5Y')).toBe('2026-08-30'); // Thu
        expect(chartDateKey('2026-09-05T22:59:59.000Z', '5Y')).toBe('2026-08-30'); // Sat 23:59 BST
        expect(chartDateKey('2026-09-05T23:00:00.000Z', '5Y')).toBe('2026-09-06'); // Sun 00:00 BST
        expect(chartDateKey('2027-01-02T12:00:00.000Z', '5Y')).toBe('2026-12-27'); // year boundary
    });

    it('passes an unparseable date through unchanged', () => {
        expect(chartDateKey('n/a', '1M')).toBe('n/a');
        expect(chartDateKey('', '5Y')).toBe('');
        expect(chartDateKey('2026-13-40', '1M')).toBe('2026-13-40');
    });

    it('always yields a fixed-width ISO day regardless of host locale output', () => {
        for (const v of ['2026-09-04T13:30:00.000Z', '2026-01-15T23:30:00.000Z', '1999-12-31T23:59:59.000Z']) {
            expect(chartDateKey(v, '1M')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(chartDateKey(v, '5Y')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
    });
});

describe('IndexChartModal compare rows share a date key across sources', () => {
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

    function rows(props: Partial<React.ComponentProps<typeof IndexChartModal>>) {
        act(() => {
            root.render(
                <IndexChartModal
                    item={index('^GSPC', 'US', GSPC_1M)}
                    allData={[]}
                    onClose={() => {}}
                    pageRange="1M"
                    {...props}
                />,
            );
        });
        return JSON.parse(container.querySelector('[data-testid="chart"]')!.getAttribute('data-rows')!);
    }

    it('renders an impossible bare day verbatim instead of overflowing it into a real date', () => {
        const gspc = index('^GSPC', 'US', GSPC_1M);
        rows({ item: gspc, allData: [gspc] });
        expect(container.querySelector('[data-testid="xtick"]')!.textContent).toBe('2026-13-40');
    });

    it('puts a fund NAV and an index close for the same day on one row', () => {
        const gspc = index('^GSPC', 'US', GSPC_1M);
        const fund = index('0P00000EBQ', 'Fund', FUND_1M);
        const r = rows({ item: gspc, allData: [gspc, fund], initialCompareSymbols: ['0P00000EBQ'] });

        // Two or more series default to percent mode, so the row holds % change
        // from each series' own first point: (101-100)/100 and (10.5-10)/10.
        expect(r.map((x: { date: string }) => x.date)).toEqual(['2026-09-03', '2026-09-04']);
        expect(r[1]['^GSPC']).toBe(1);
        expect(r[1]['0P00000EBQ']).toBe(5);
    });

    it('puts an FX bar stamped 23:00Z on the same row as the next day\'s US close', () => {
        const gspc = index('^GSPC', 'US', GSPC_1M);
        const jpy = index('JPY=X', 'FX', JPY_1M);
        const r = rows({ item: gspc, allData: [gspc, jpy], initialCompareSymbols: ['JPY=X'] });

        expect(r.map((x: { date: string }) => x.date)).toEqual(['2026-09-03', '2026-09-04']);
        expect(r[1]['^GSPC']).toBe(1);
        expect(r[1]['JPY=X']).toBe(2);
    });

    it('puts the in-progress FX bar (last-trade stamp) on the same row as that day\'s US close', () => {
        // Yahoo stamps the most recent FX bar at its last trade (20:59Z Fri), not at
        // midnight London; under an Asia/Hong_Kong key it would be Saturday.
        const gspc = index('^GSPC', 'US', GSPC_1M);
        const jpy = index('JPY=X', 'FX', [
            { date: '2026-09-02T23:00:00.000Z', value: 150 },
            { date: '2026-09-04T20:59:32.000Z', value: 153 },
        ]);
        const r = rows({ item: gspc, allData: [gspc, jpy], initialCompareSymbols: ['JPY=X'] });

        expect(r.map((x: { date: string }) => x.date)).toEqual(['2026-09-03', '2026-09-04']);
        expect(r[1]).toMatchObject({ '^GSPC': 1, 'JPY=X': 2 });
    });

    it('puts weekly bars dated on different weekdays on one row for 5Y', () => {
        const gspc = index('^GSPC', 'US', GSPC_5Y);
        const hsi = index('^HSI', 'Asia', HSI_5Y);
        const fund = index('0P00000EBQ', 'Fund', FUND_5Y);
        const r = rows({
            item: gspc,
            allData: [gspc, hsi, fund],
            pageRange: '5Y',
            initialCompareSymbols: ['^HSI', '0P00000EBQ'],
        });

        expect(r.map((x: { date: string }) => x.date)).toEqual(['2026-08-23', '2026-08-30']);
        expect(r[1]).toMatchObject({ '^GSPC': 1, '^HSI': 1, '0P00000EBQ': 5 });
    });
});
