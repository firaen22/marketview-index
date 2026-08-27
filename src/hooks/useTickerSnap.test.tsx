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

// Mirrors DashboardHeader: while `isLoading` is true the ticker track is not
// rendered at all, so the ref holds null on the first commit and the element
// only appears on a later render.
function LateTicker({ mounted }: { mounted: boolean }) {
    const { ref, style } = useTickerSnap();
    return mounted ? createElement('div', { ref, style }) : createElement('span', null, 'loading');
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

    it('re-measures a track that unmounts and comes back a different width', async () => {
        // PresentationPage drops the whole compact strip when the presenter
        // cycles stripMode with the S key, so coming back mounts a NEW node —
        // whose width has usually changed with the pinned symbols.
        let width = 1000;
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
            .mockImplementation(() => ({ width } as DOMRect));

        await act(async () => { root.render(createElement(LateTicker, { mounted: true })); });
        const first = container.firstElementChild as HTMLElement;
        expect(first.style.getPropertyValue('--ticker-shift')).toBe('500px');

        await act(async () => { root.render(createElement(LateTicker, { mounted: false })); });
        width = 800;
        await act(async () => { root.render(createElement(LateTicker, { mounted: true })); });

        const second = container.firstElementChild as HTMLElement;
        expect(second).not.toBe(first);
        expect(second.style.getPropertyValue('--ticker-shift')).toBe('400px');
        expect(second.style.animationTimingFunction).toBe('steps(400, end)');
    });

    it('measures a track that only mounts after the first render', async () => {
        // useMarketData starts isLoading=true, so this is the ONLY path the
        // dashboard ticker ever takes.
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 15076 } as DOMRect);

        await act(async () => { root.render(createElement(LateTicker, { mounted: false })); });
        await act(async () => { root.render(createElement(LateTicker, { mounted: true })); });

        const style = (container.firstElementChild as HTMLElement).style;
        expect(style.getPropertyValue('--ticker-shift')).toBe('7538px');
        expect(style.animationTimingFunction).toBe('steps(7538, end)');
    });
});
