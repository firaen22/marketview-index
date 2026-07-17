import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketStatCard } from './MarketStatCard';

vi.mock('recharts', () => ({
    LineChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Line: () => null,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
}));

const item = {
    symbol: '^HSI',
    name: '恒生指數',
    nameEn: 'Hang Seng Index',
    category: 'Asia',
    price: 20000,
    change: 1,
    changePercent: 0.5,
    ytdChange: 2,
    ytdChangePercent: 1,
    low: 19000,
    high: 21000,
    history: [{ date: '2026-01-01', value: 20000 }],
};

const t: any = {
    language: 'en',
    activeRange: 'YTD',
    rangeLabels: { YTD: 'YTD' },
    range: 'Range',
    ytd: 'YTD',
    indexNames: {},
};

describe('MarketStatCard highlight behavior', () => {
    let container: HTMLDivElement;
    let root: Root;
    let scrollSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        scrollSpy = vi.fn();
        Element.prototype.scrollIntoView = scrollSpy as unknown as Element['scrollIntoView'];
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('scrolls highlighted cards once and not again on unrelated rerender', () => {
        act(() => {
            root.render(<MarketStatCard item={item as any} t={t} highlighted />);
        });
        expect(scrollSpy).toHaveBeenCalledTimes(1);

        act(() => {
            root.render(<MarketStatCard item={{ ...item, price: 20001 } as any} t={t} highlighted />);
        });
        expect(scrollSpy).toHaveBeenCalledTimes(1);
    });
});
