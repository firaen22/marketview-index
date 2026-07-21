// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TickerConfigModal } from './TickerConfigModal';
import { getLocale } from '../locales';
import type { IndexData } from '../types';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const mk = (symbol: string, name: string): IndexData => ({
    symbol, name, category: 'US', price: 1, change: 0, changePercent: 0,
    ytdChange: 0, ytdChangePercent: 0, history: [],
} as unknown as IndexData);

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
});

describe('TickerConfigModal sweep-14 regression', () => {
    it('unchecking one symbol in show-all mode keeps the rest selected even when allSymbols arrived after mount', async () => {
        const t = { ...getLocale('en'), indexNames: {} } as never;
        const noop = () => {};

        // Mounted while market data is still loading: allSymbols is empty.
        await act(async () => {
            root.render(
                <TickerConfigModal allSymbols={[]} selected={null} language="en" t={t} onClose={noop} onSave={noop} />
            );
        });

        // Data arrives while the modal is open.
        const symbols = [mk('AAA', 'Alpha'), mk('BBB', 'Beta'), mk('CCC', 'Gamma')];
        await act(async () => {
            root.render(
                <TickerConfigModal allSymbols={symbols} selected={null} language="en" t={t} onClose={noop} onSave={noop} />
            );
        });

        // User unchecks AAA only.
        const alphaBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Alpha'));
        expect(alphaBtn).toBeTruthy();
        await act(async () => { alphaBtn!.click(); });

        // BBB and CCC must remain selected: 2 / 3.
        expect(container.textContent).toContain('2 / 3');
    });
});
