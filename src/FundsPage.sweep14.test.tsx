// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

vi.mock('recharts', () => ({
    Treemap: ({ children }: { children?: React.ReactNode }) => <div data-testid="treemap">{children}</div>,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Tooltip: () => null,
    LineChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
}));

const fund = {
    symbol: '0P00000EBQ',
    name: '駿利亨德森遠見基金 - 環球科技領先基金',
    nameEn: 'Janus Henderson Horizon Fund - Global Technology Leaders Fund',
    category: 'Fund',
    subCategory: 'Technology',
    price: 100, change: 1, changePercent: 0.5, ytdChange: 2, ytdChangePercent: 1, open: 99, high: 101, low: 98,
    history: [],
};

const useMarketDataMock = vi.fn();
vi.mock('./hooks/useMarketData', () => ({
    useMarketData: (...args: unknown[]) => useMarketDataMock(...args),
}));

const { default: FundsPage } = await import('./FundsPage');

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    vi.clearAllMocks();
});

async function render() {
    await act(async () => {
        root.render(
            <MemoryRouter>
                <FundsPage />
            </MemoryRouter>
        );
    });
}

describe('FundsPage sweep-14 regressions', () => {
    it('keeps showing existing fund data during a refresh instead of blanking to a spinner', async () => {
        useMarketDataMock.mockReturnValue({ data: [fund], isLoading: true, error: false, refresh: vi.fn() });
        await render();
        // Stale-but-present data must stay visible while a refresh is in flight.
        expect(container.textContent).toContain(fund.name);
    });

    it('shows the loading state only when there is no data yet', async () => {
        useMarketDataMock.mockReturnValue({ data: [], isLoading: true, error: false, refresh: vi.fn() });
        await render();
        expect(container.textContent).not.toContain(fund.name);
    });

    it('refresh button is labelled for assistive tech', async () => {
        useMarketDataMock.mockReturnValue({ data: [fund], isLoading: false, error: false, refresh: vi.fn() });
        await render();
        const labelled = Array.from(container.querySelectorAll('button[aria-label]')).map(b => b.getAttribute('aria-label'));
        expect(labelled.some(l => l === 'Refresh Data' || l === '手動更新數據')).toBe(true);
    });
});
