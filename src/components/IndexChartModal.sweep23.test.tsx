// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexChartModal } from './IndexChartModal';
import type { IndexData } from '../types';

// Captures the formatters recharts would call so tick/tooltip text is assertable.
const captured: { tick?: (v: number) => string; tip?: (v: number, n: string) => [string, string] } = {};
vi.mock('recharts', () => ({
    LineChart: ({ data, children }: { data?: unknown; children?: React.ReactNode }) =>
        <div data-testid="chart" data-rows={JSON.stringify(data)}>{children}</div>,
    Line: () => null,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Tooltip: ({ formatter }: { formatter?: (v: number, n: string) => [string, string] }) => { captured.tip = formatter; return null; },
    Legend: () => null,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: ({ tickFormatter }: { tickFormatter?: (v: number) => string }) => { captured.tick = tickFormatter; return null; },
}));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
process.env.TZ = 'Asia/Hong_Kong';

const D1 = '2026-09-01T13:30:00.000Z', D2 = '2026-09-02T13:30:00.000Z', D3 = '2026-09-03T13:30:00.000Z';

function index(symbol: string, category: string, history: Array<{ date: string; value: number | null }>): IndexData {
    return { symbol, name: symbol, nameEn: symbol, category, price: 1, change: 0, changePercent: 0, history } as unknown as IndexData;
}

describe('IndexChartModal sweep 23', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        captured.tick = undefined;
        captured.tip = undefined;
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.unstubAllGlobals();
    });

    function render(props: Partial<React.ComponentProps<typeof IndexChartModal>> & { item: IndexData }) {
        act(() => {
            root.render(<IndexChartModal allData={[props.item]} onClose={() => {}} pageRange="1M" {...props} />);
        });
    }
    const rows = () => JSON.parse(container.querySelector('[data-testid="chart"]')!.getAttribute('data-rows')!);

    it('rebases every % line on the first day all of them share', () => {
        const a = index('A', 'US', [{ date: D1, value: 100 }, { date: D2, value: 110 }, { date: D3, value: 121 }]);
        const b = index('B', 'US', [{ date: D2, value: 50 }, { date: D3, value: 55 }]);
        render({ item: a, allData: [a, b], initialCompareSymbols: ['B'] });
        const r = rows();
        expect(r[1]).toMatchObject({ date: '2026-09-02', A: 0, B: 0 });
        expect(r[2].A).toBeCloseTo(10);
        expect(r[2].B).toBeCloseTo(10);
        expect(r[0].A).toBeCloseTo(-100 / 11);
    });

    it('never puts a raw value on the % axis when the first point is zero', () => {
        const a = index('A', 'US', [{ date: D1, value: 100 }, { date: D2, value: 110 }]);
        const b = index('B', 'US', [{ date: D1, value: 0 }, { date: D2, value: 5 }]);
        render({ item: a, allData: [a, b], initialCompareSymbols: ['B'] });
        expect(rows()[1].B).toBe(0);
    });

    it('drops a null point instead of drawing a -100% spike', () => {
        const a = index('A', 'US', [{ date: D1, value: 100 }, { date: D2, value: null }, { date: D3, value: 110 }]);
        const b = index('B', 'US', [{ date: D1, value: 10 }, { date: D2, value: 11 }, { date: D3, value: 12 }]);
        render({ item: a, allData: [a, b], initialCompareSymbols: ['B'] });
        const r = rows();
        expect(r[1].A).toBeUndefined();
        expect(r[2].A).toBeCloseTo(10);
    });

    it('keeps the direction of change for a negative base', () => {
        const a = index('A', 'US', [{ date: D1, value: 100 }, { date: D2, value: 110 }]);
        const y = index('Y', 'Rates', [{ date: D1, value: -0.5 }, { date: D2, value: -0.2 }]);
        render({ item: a, allData: [a, y], initialCompareSymbols: ['Y'] });
        expect(rows()[1].Y).toBeCloseTo(60);
    });

    it('drops the charted symbol and repeats from a copilot compare list', () => {
        const a = index('A', 'US', [{ date: D1, value: 100 }]);
        const b = index('B', 'US', [{ date: D1, value: 10 }]);
        render({ item: a, allData: [a, b], initialCompareSymbols: ['A', 'B', 'B'] });
        expect(container.querySelectorAll('[aria-label^="Remove "]').length).toBe(1);
        expect(container.querySelector('[aria-label="Remove B"]')).not.toBeNull();
    });

    it('labels nominal FX ticks with decimals and yields with a % unit', () => {
        const fx = index('EURUSD=X', 'Currency', [{ date: D1, value: 1.08 }, { date: D2, value: 1.09 }]);
        render({ item: fx });
        expect(captured.tick!(1.085)).toBe('1.085');
        expect(captured.tick!(1.09)).not.toBe(captured.tick!(1.08));

        const tnx = index('^TNX', 'Rates', [{ date: D1, value: 4.2 }, { date: D2, value: 4.6 }]);
        render({ item: tnx });
        expect(captured.tick!(4.4)).toBe('4.4%');
        expect(captured.tip!(4.25, 'x')[0]).toBe('4.25%');
    });

    it('draws the page\'s fresh data once the page moves onto the range the modal fetched', async () => {
        const oldHist = [{ date: D1, value: 1 }, { date: D2, value: 2 }];
        const newHist = [{ date: D1, value: 1 }, { date: D2, value: 2 }, { date: D3, value: 3 }];
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ success: true, data: [index('A', 'US', oldHist)] }),
        })));
        const ytd = index('A', 'US', [{ date: D1, value: 9 }]);
        render({ item: ytd, pageRange: 'YTD' });
        const btn = [...container.querySelectorAll('button')].find(b => b.textContent === '1Y')!;
        await act(async () => { btn.click(); });
        await act(async () => { await Promise.resolve(); });
        expect(rows()).toHaveLength(2);

        const fresh = index('A', 'US', newHist);
        render({ item: fresh, allData: [fresh], pageRange: '1Y' });
        expect(rows()).toHaveLength(3);
    });
});

describe('IndexChartModal sweep 23 (opencode findings)', () => {
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

    it('does not force % mode for a compare chip that draws no line', () => {
        const a = index('A', 'US', [{ date: D1, value: 100 }, { date: D2, value: 110 }]);
        const b = index('B', 'US', []);
        act(() => { root.render(<IndexChartModal item={a} allData={[a, b]} onClose={() => {}} pageRange="1M" initialCompareSymbols={['B']} />); });
        const r = JSON.parse(container.querySelector('[data-testid="chart"]')!.getAttribute('data-rows')!);
        expect(r[1].A).toBe(110);
    });

    it('shows the page\'s current price in the header, not the open-time snapshot', () => {
        const opened = { ...index('A', 'US', [{ date: D1, value: 100 }]), price: 100 } as IndexData;
        const now = { ...opened, price: 123.45 } as IndexData;
        act(() => { root.render(<IndexChartModal item={opened} allData={[now]} onClose={() => {}} pageRange="1M" />); });
        expect(container.textContent).toContain('123.45');
    });
});

describe('IndexChartModal sweep 23 (grok findings)', () => {
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
        vi.unstubAllGlobals();
    });

    it('draws a server_stale_cache snapshot for another period instead of the error banner', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ success: false, source: 'server_stale_cache', data: [index('A', 'US', [{ date: D1, value: 1 }, { date: D2, value: 2 }])] }),
        })));
        const a = index('A', 'US', [{ date: D1, value: 9 }]);
        act(() => { root.render(<IndexChartModal item={a} allData={[a]} onClose={() => {}} pageRange="YTD" />); });
        const btn = [...container.querySelectorAll('button')].find(b => b.textContent === '1Y')!;
        await act(async () => { btn.click(); });
        await act(async () => { await Promise.resolve(); });
        expect(container.textContent).not.toContain("Couldn't load");
        expect(JSON.parse(container.querySelector('[data-testid="chart"]')!.getAttribute('data-rows')!)).toHaveLength(2);
    });

    it('still shows the error banner for a failure body with no data', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: false, error: 'x' }) })));
        const a = index('A', 'US', [{ date: D1, value: 9 }]);
        act(() => { root.render(<IndexChartModal item={a} allData={[a]} onClose={() => {}} pageRange="YTD" />); });
        const btn = [...container.querySelectorAll('button')].find(b => b.textContent === '1Y')!;
        await act(async () => { btn.click(); });
        await act(async () => { await Promise.resolve(); });
        expect(container.textContent).toContain("Couldn't load 1Y");
    });

    it('reads the % base from the bar the row actually shows when two share a bucket', () => {
        const a = index('A', 'US', [
            { date: '2026-06-03T23:00:00.000Z', value: 100 },
            { date: '2026-06-04T20:59:00.000Z', value: 110 },
            { date: '2026-06-05T20:59:00.000Z', value: 121 },
        ]);
        const b = index('B', 'US', [{ date: '2026-06-04T13:30:00.000Z', value: 10 }, { date: '2026-06-05T13:30:00.000Z', value: 11 }]);
        act(() => { root.render(<IndexChartModal item={a} allData={[a, b]} onClose={() => {}} pageRange="1M" initialCompareSymbols={['B']} />); });
        const r = JSON.parse(container.querySelector('[data-testid="chart"]')!.getAttribute('data-rows')!);
        expect(r[0]).toMatchObject({ date: '2026-06-04', A: 0, B: 0 });
        expect(r[1].A).toBeCloseTo(10);
    });
});

describe('IndexChartModal sweep 23 (gate findings)', () => {
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
    const draw = (item: IndexData, allData: IndexData[], cmp: string[]) => {
        act(() => { root.render(<IndexChartModal item={item} allData={allData} onClose={() => {}} pageRange="1M" initialCompareSymbols={cmp} />); });
        return JSON.parse(container.querySelector('[data-testid="chart"]')!.getAttribute('data-rows')!);
    };

    it('stays nominal when a compare series has only unusable points', () => {
        const a = index('A', 'US', [{ date: D1, value: 100 }, { date: D2, value: 110 }]);
        const b = index('B', 'US', [{ date: D1, value: null }]);
        expect(draw(a, [a, b], ['B'])[1].A).toBe(110);
    });

    it('reads the base from the later of two non-adjacent bars in one bucket', () => {
        const a = index('A', 'US', [{ date: D1, value: 100 }, { date: D2, value: 200 }, { date: '2026-09-01T20:59:00.000Z', value: 110 }]);
        const b = index('B', 'US', [{ date: D1, value: 10 }, { date: D2, value: 11 }]);
        const r = draw(a, [a, b], ['B']);
        expect(r[0]).toMatchObject({ date: '2026-09-01', A: 0, B: 0 });
    });

    it('drops an overflowing % value instead of drawing Infinity', () => {
        const a = index('A', 'US', [{ date: D1, value: -1e308 }, { date: D2, value: 1e308 }]);
        const b = index('B', 'US', [{ date: D1, value: 10 }, { date: D2, value: 11 }]);
        const r = draw(a, [a, b], ['B']);
        expect(r[1].A).toBeUndefined();
    });

    it('does not move the common start for a compare series that draws no % line', () => {
        const a = index('A', 'US', [{ date: D1, value: 100 }, { date: D2, value: 120 }]);
        const b = index('B', 'US', [{ date: D2, value: 0 }]);
        const r = draw(a, [a, b], ['B']);
        expect(r[0].A).toBe(0);
        expect(r[1].A).toBe(20);
    });
});
