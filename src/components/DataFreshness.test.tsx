// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DataFreshness } from './DataFreshness';
import { getLocale } from '../locales';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const t = getLocale('en');
const NOW = Date.parse('2026-07-20T12:00:00.000Z');

describe('DataFreshness', () => {
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

    function render(mode: 'live' | 'cached' | 'stale' | 'unavailable', lastUpdatedAt: number | null) {
        act(() => {
            root.render(createElement(DataFreshness, { mode, lastUpdatedAt, now: NOW, t }));
        });
    }

    it('renders nothing in the steady state, so the warning keeps its meaning', () => {
        render('live', NOW);
        expect(container.textContent).toBe('');
        render('cached', NOW);
        expect(container.textContent).toBe('');
    });

    it('warns, in the active language, once the feed is degraded', () => {
        render('stale', NOW - 12 * 60_000);
        expect(container.textContent).toContain(t.dataFreshness.stale);
        render('unavailable', null);
        expect(container.textContent).toContain(t.dataFreshness.unavailable);
    });

    it('keeps the ticking age OUT of the live region', () => {
        // The age re-rounds every minute for as long as the feed stays degraded.
        // Inside role="status" each tick is a fresh screen-reader announcement of
        // no new state, so only the mode label may remain announceable.
        render('stale', NOW - 12 * 60_000);
        const region = container.querySelector('[role="status"]');
        expect(region).not.toBeNull();
        expect(region?.getAttribute('aria-live')).toBe('polite');
        expect(container.textContent).toContain('12m');

        const announced = [...(region?.childNodes ?? [])]
            .filter((n) => !(n instanceof HTMLElement) || n.getAttribute('aria-hidden') !== 'true')
            .map((n) => n.textContent)
            .join('');
        expect(announced).toContain(t.dataFreshness.stale);
        expect(announced, 'the ticking age must be aria-hidden').not.toContain('12m');
    });

    it('omits the age entirely when the server never said how old the data is', () => {
        render('unavailable', null);
        expect(container.textContent).toBe(`⚠${t.dataFreshness.unavailable}`);
    });

    it('buckets the age into a language-neutral compact duration', () => {
        for (const [ageMs, expected] of [
            [30_000, '<1m'],
            [5 * 60_000, '5m'],
            [3 * 60 * 60_000, '3h'],
            [2 * 24 * 60 * 60_000, '2d'],
        ] as const) {
            render('stale', NOW - ageMs);
            expect(container.textContent, `age ${ageMs}ms`).toContain(expected);
        }
    });

    it('does not render a negative age from a clock skewed ahead of the server', () => {
        render('stale', NOW + 60_000);
        expect(container.textContent).toBe(`⚠${t.dataFreshness.stale}`);
    });
});
