// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MarketStatusChip } from './MarketStatusChip';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
});

describe('MarketStatusChip sweep-14 regression', () => {
    it('renders localized phase labels when phaseLabels is provided', async () => {
        await act(async () => {
            root.render(
                <MarketStatusChip
                    status={{ key: 'HK', phase: 'lunch', nextChangeAt: 10_000, calendarCoverage: 'covered' }}
                    now={0}
                    phaseLabels={{ open: '開市', lunch: '午休', closed: '休市' }}
                />
            );
        });
        expect(container.textContent).toContain('午休');
        expect(container.textContent).not.toContain('lunch');
    });

    it('counts down through every minute bucket instead of skipping "1m"', async () => {
        // The chip re-renders off a 10s clock (PresentationPage.tsx:589), so a
        // remaining time of exactly 60_000ms is never sampled in practice. With a
        // ceil-based minute bucket the "1m" bucket is one millisecond wide, so the
        // projector countdown jumps 2m -> <1m in front of the audience.
        for (const [remainingMs, expected] of [
            [180_000, '3m'], [120_000, '2m'], [119_000, '1m'],
            [61_000, '1m'], [60_000, '1m'], [59_000, '<1m'],
        ] as const) {
            await act(async () => {
                root.render(
                    <MarketStatusChip
                        status={{ key: 'US', phase: 'closed', nextChangeAt: remainingMs, calendarCoverage: 'covered' }}
                        now={0}
                    />
                );
            });
            expect(container.textContent, `${remainingMs}ms remaining`).toContain(expected);
        }
    });

    it('falls back to the raw phase when no labels are provided', async () => {
        await act(async () => {
            root.render(
                <MarketStatusChip status={{ key: 'US', phase: 'open', nextChangeAt: 10_000, calendarCoverage: 'covered' }} now={0} />
            );
        });
        expect(container.textContent).toContain('open');
    });
});
