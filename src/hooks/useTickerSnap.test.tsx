// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useTickerSnap } from './useTickerSnap';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

function Ticker() {
    const { ref, style } = useTickerSnap();
    return createElement('div', { ref, style });
}

beforeEach(() => {
    class NoopResizeObserver {
        observe = vi.fn();
        disconnect = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', NoopResizeObserver);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

describe('useTickerSnap', () => {
    it('uses one-pixel steps for the measured half-width', async () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 15076 } as DOMRect);

        await act(async () => { root.render(createElement(Ticker)); });

        const style = (container.firstElementChild as HTMLElement).style;
        expect(style.getPropertyValue('--ticker-shift')).toBe('7538px');
        expect(style.animationTimingFunction).toBe('steps(7538, end)');
    });

    it('rounds fractional half-widths to the nearest pixel', async () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 15075.96875 } as DOMRect);

        await act(async () => { root.render(createElement(Ticker)); });

        const style = (container.firstElementChild as HTMLElement).style;
        expect(style.getPropertyValue('--ticker-shift')).toBe('7538px');
        expect(style.animationTimingFunction).toBe('steps(7538, end)');
    });

    it('does not emit animation style for a zero-width track', async () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 0 } as DOMRect);

        await act(async () => { root.render(createElement(Ticker)); });

        expect((container.firstElementChild as HTMLElement).getAttribute('style')).toBeNull();
    });
});
