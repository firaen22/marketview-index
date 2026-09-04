// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useWakeLock } from './useWakeLock';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
});

function Wrapper({ enabled = true }: { enabled?: boolean }) {
    useWakeLock(enabled);
    return null;
}

it('requests a screen wake lock once on mount', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    (navigator as any).wakeLock = {
        request: vi.fn().mockResolvedValue({ release, addEventListener: vi.fn() }),
    };

    await act(async () => {
        root.render(createElement(Wrapper));
    });

    expect(navigator.wakeLock.request).toHaveBeenCalledOnce();
    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');
});

it('does not throw or call wakeLock when the API is missing', async () => {
    delete (navigator as any).wakeLock;

    await act(async () => {
        root.render(createElement(Wrapper));
    });

    // Should reach this line without throwing.
    expect(true).toBe(true);
});

it('does not throw when request rejects', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    (navigator as any).wakeLock = {
        request: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
        release,
    };

    await act(async () => {
        root.render(createElement(Wrapper));
    });

    expect(true).toBe(true);
});

it('re-acquires after release event followed by visibilitychange', async () => {
    let releaseHandler: (() => void) | undefined;
    const sentinel = {
        release: vi.fn().mockResolvedValue(undefined),
        addEventListener: vi.fn().mockImplementation((_: string, cb: () => void) => {
            releaseHandler = cb;
        }),
    };
    const request = vi.fn().mockResolvedValue(sentinel);
    (navigator as any).wakeLock = { request };

    await act(async () => {
        root.render(createElement(Wrapper));
    });
    expect(request).toHaveBeenCalledOnce();

    // Simulate the sentinel being released by the browser.
    await act(async () => {
        releaseHandler!();
        // Then the page becomes visible again.
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(request).toHaveBeenCalledTimes(2);
});

it('releases the sentinel on unmount', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const sentinel = { release, addEventListener: vi.fn() };
    (navigator as any).wakeLock = {
        request: vi.fn().mockResolvedValue(sentinel),
    };

    await act(async () => {
        root.render(createElement(Wrapper));
    });

    await act(async () => {
        root.unmount();
        root = createRoot(container); // re-create for afterEach
    });

    expect(release).toHaveBeenCalledOnce();
});
