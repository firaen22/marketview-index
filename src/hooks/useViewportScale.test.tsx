// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useRootScale, useViewportScale } from './useViewportScale';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

const realGetComputedStyle = window.getComputedStyle.bind(window);

/**
 * jsdom does no layout, so `clamp(16px, 100vmin/67.5, 32px)` never resolves.
 * Stand in for it: the root reports 32px exactly while the scale class is on,
 * which is what the real rule computes at 4K.
 */
function stubComputedRootFont() {
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
        if (el === document.documentElement) {
            return {
                fontSize: el.classList.contains('mv-viewport-scale') ? '32px' : '16px',
            } as CSSStyleDeclaration;
        }
        return realGetComputedStyle(el, pseudo ?? undefined);
    }) as typeof window.getComputedStyle;
}

async function flush() {
    // A MutationObserver callback is a microtask, so one extra turn after the
    // commit is enough for the class change to reach the subscriber.
    for (let i = 0; i < 4; i += 1) {
        await act(async () => { await Promise.resolve(); });
    }
}

beforeEach(() => {
    stubComputedRootFont();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.documentElement.className = '';
    window.getComputedStyle = realGetComputedStyle;
});

describe('useViewportScale', () => {
    it('adds the scale class while mounted and removes it on unmount', async () => {
        function Route() {
            useViewportScale();
            return null;
        }

        await act(async () => { root.render(createElement(Route)); });
        expect(document.documentElement.classList.contains('mv-viewport-scale')).toBe(true);

        await act(async () => { root.unmount(); });
        expect(document.documentElement.classList.contains('mv-viewport-scale')).toBe(false);

        // Re-create so the shared afterEach unmount stays valid.
        root = createRoot(container);
    });

    // The regression this guards: React flushes a CHILD's effects before its
    // parent's, so a child reading the root font on mount sees the unscaled
    // 16px and reports 1. PdfViewer hit this for real — its canvas rendered at
    // 1x on a 4K projector until something happened to fire a resize.
    it('reports the scaled ratio to a child that mounted before the class landed', async () => {
        const seen: number[] = [];

        function Child() {
            seen.push(useRootScale());
            return null;
        }
        function Route() {
            useViewportScale();
            return createElement(Child);
        }

        await act(async () => { root.render(createElement(Route)); });
        await flush();

        expect(seen[0]).toBe(1);
        expect(seen[seen.length - 1]).toBe(2);
    });

    it('reports 1 on a route that never opts in', async () => {
        const seen: number[] = [];

        function Bare() {
            seen.push(useRootScale());
            return null;
        }

        await act(async () => { root.render(createElement(Bare)); });
        await flush();

        expect(new Set(seen)).toEqual(new Set([1]));
    });
});
