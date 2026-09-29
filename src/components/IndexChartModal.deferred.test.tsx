// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexChartModal } from './IndexChartModal';
import type { IndexData } from '../types';

vi.mock('recharts', () => ({
    LineChart: ({ data, children }: { data?: unknown; children?: React.ReactNode }) => <div data-testid="chart" data-rows={JSON.stringify(data)}>{children}</div>,
    Line: () => null, ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Tooltip: () => null, Legend: () => null, CartesianGrid: () => null, XAxis: () => null, YAxis: () => null,
}));

const D1 = '2026-09-01T13:30:00.000Z', D2 = '2026-09-02T13:30:00.000Z';
function index(symbol: string, history: Array<{ date: string; value: number }>): IndexData {
    return { symbol, name: symbol, nameEn: symbol, category: 'US', price: 1, change: 0, changePercent: 0, history } as unknown as IndexData;
}

describe('IndexChartModal deferred fixes', () => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
    afterEach(() => { act(() => root.unmount()); container.remove(); });

    it('keeps nominal mode for an all-zero compare and leaves Nominal enabled', () => {
        const a = index('A', [{ date: D1, value: 100 }, { date: D2, value: 120 }]);
        const b = index('B', [{ date: D2, value: 0 }]);
        act(() => { root.render(<IndexChartModal item={a} allData={[a, b]} onClose={() => {}} pageRange="1M" initialCompareSymbols={['B']} />); });
        const rows = JSON.parse(container.querySelector('[data-testid="chart"]')!.getAttribute('data-rows')!);
        expect(rows[1]).toMatchObject({ A: 120 });
        const nominal = [...container.querySelectorAll('button')].find(button => button.textContent === 'Nominal');
        expect(nominal?.disabled).toBe(false);
    });
});
