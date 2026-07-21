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
                    status={{ key: 'HK', phase: 'lunch', nextChangeAt: 10_000 }}
                    now={0}
                    phaseLabels={{ open: '開市', lunch: '午休', closed: '休市' }}
                />
            );
        });
        expect(container.textContent).toContain('午休');
        expect(container.textContent).not.toContain('lunch');
    });

    it('falls back to the raw phase when no labels are provided', async () => {
        await act(async () => {
            root.render(
                <MarketStatusChip status={{ key: 'US', phase: 'open', nextChangeAt: 10_000 }} now={0} />
            );
        });
        expect(container.textContent).toContain('open');
    });
});
