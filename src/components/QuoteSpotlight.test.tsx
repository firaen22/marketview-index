// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { QuoteSpotlight } from './QuoteSpotlight';
import type { QuoteItem } from '../types/QuoteItem';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

const item: QuoteItem = {
    id: 'HSI',
    name: 'Hang Seng Index',
    value: 18000,
    changePct: 1.23,
    group: 'market',
};

function mount(overrides: {
    pinned?: boolean;
    pinnedLabel?: string;
    index?: number;
    total?: number;
    onPrev?: () => void;
    onNext?: () => void;
    onDismiss?: () => void;
} = {}) {
    const onDismiss = overrides.onDismiss ?? vi.fn();
    act(() => {
        root.render(
            <QuoteSpotlight
                item={item}
                lang="en"
                onDismiss={onDismiss}
                pinned={overrides.pinned}
                pinnedLabel={overrides.pinnedLabel}
                index={overrides.index}
                total={overrides.total}
                onPrev={overrides.onPrev}
                onNext={overrides.onNext}
            />,
        );
    });
    return { onDismiss };
}

describe('QuoteSpotlight', () => {
    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => { root.unmount(); });
        container.remove();
    });

    it('renders a Pinned pill when pinned is true', () => {
        mount({ pinned: true });
        const nodes = Array.from(container.querySelectorAll('*'));
        expect(nodes.some((el) => el.textContent === 'Pinned')).toBe(true);
    });

    it('renders a custom pinnedLabel and not the default Pinned text', () => {
        mount({ pinned: true, pinnedLabel: '已釘選' });
        const nodes = Array.from(container.querySelectorAll('*'));
        expect(nodes.some((el) => el.textContent === '已釘選')).toBe(true);
        expect(nodes.some((el) => el.textContent === 'Pinned')).toBe(false);
        expect(container.textContent).not.toContain('Pinned');
    });

    it('does not render a Pinned pill when pinned is omitted', () => {
        mount();
        expect(container.querySelector('[aria-label="Pinned"]')).toBeNull();
        expect(container.textContent).not.toContain('Pinned');
    });

    it('renders prev/next nav and 1/3 counter', () => {
        mount({ index: 0, total: 3, onPrev: vi.fn(), onNext: vi.fn() });
        expect(container.querySelector('[aria-label="Previous quote"]')).not.toBeNull();
        expect(container.querySelector('[aria-label="Next quote"]')).not.toBeNull();
        expect(container.textContent).toContain('1/3');
    });

    it('hides nav buttons when total is 1', () => {
        mount({ total: 1 });
        expect(container.querySelector('[aria-label="Previous quote"]')).toBeNull();
        expect(container.querySelector('[aria-label="Next quote"]')).toBeNull();
    });

    it('calls onDismiss once when the dismiss button is clicked', () => {
        const onDismiss = vi.fn();
        mount({ onDismiss });
        const button = container.querySelector('[aria-label="Dismiss spotlight"]');
        expect(button).not.toBeNull();
        act(() => { (button as HTMLButtonElement).click(); });
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });
});

describe('QuoteSpotlight gesture integration', () => {
    it('is routed via PresentationPage onSwipe/onTap handlers, tested there', () => {
        // The component receives the item; the handlers decide whether it owns the
        // gesture. That routing logic is tested in PresentationPage.spotlight.test.ts
        // (spotlightGestureTarget). Component tests verify the UI only.
    });
});

