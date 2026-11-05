// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import type { PresentCommand } from '../lib/presentCommand';

type HookOpts = {
    onCommand: (command: PresentCommand) => boolean;
    registerPollNow?: (pollNow: () => void) => void;
};
const hook: { opts: HookOpts | null } = { opts: null };
vi.mock('./hooks/usePresentCommand', () => ({
    usePresentCommand: (opts: HookOpts) => {
        hook.opts = opts;
    },
}));

// pdfjs needs DOMMatrix, which jsdom lacks; the slide is irrelevant here.
vi.mock('./components/SlideRenderer', () => ({ SlideRenderer: () => null }));

const { default: PresentationPage } = await import('./PresentationPage');

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const categoryCommand: PresentCommand = {
    v: 1,
    id: 'cat-page',
    kind: 'category',
    symbols: [],
    category: 'US',
    issuedAt: 1000,
};

let root: Root;
let container: HTMLDivElement;
let pollNow: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
    hook.opts = null;
    pollNow = vi.fn<() => void>();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function mountOnIndexWithLoadedIframe() {
    await act(async () => {
        root.render(<MemoryRouter><PresentationPage /></MemoryRouter>);
    });
    expect(hook.opts).not.toBeNull();
    act(() => hook.opts!.registerPollNow?.(pollNow));
    // First category command switches to the index view and is not consumed.
    let first = true;
    act(() => {
        first = hook.opts!.onCommand(categoryCommand);
    });
    expect(first).toBe(false);
    const iframe = container.querySelector('iframe[title="Market Index"]') as HTMLIFrameElement | null;
    expect(iframe).not.toBeNull();
    const win = iframe!.contentWindow!;
    const posted = vi.spyOn(win, 'postMessage');
    act(() => {
        iframe!.dispatchEvent(new Event('load'));
    });
    return { win, posted };
}

function sendFrom(source: MessageEventSource | null, data: unknown) {
    act(() => {
        window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin, source }));
    });
}

describe('PresentationPage index embed handshake (mounted page)', () => {
    it('pings the embed on load; ready from the embed opens the bridge, bumps poll, and category posts', async () => {
        const { win, posted } = await mountOnIndexWithLoadedIframe();
        expect(posted).toHaveBeenCalledWith({ type: 'mv-present-ping' }, window.location.origin);

        // Bridge still closed: the slot command is not consumed.
        expect(hook.opts!.onCommand(categoryCommand)).toBe(false);

        sendFrom(win, { type: 'mv-present-ready' });
        expect(pollNow).toHaveBeenCalledTimes(1);

        let ok = false;
        act(() => {
            ok = hook.opts!.onCommand(categoryCommand);
        });
        expect(ok).toBe(true);
        expect(posted).toHaveBeenCalledWith({ type: 'mv-category', category: 'US' }, window.location.origin);
    });

    it('ignores mv-present-ready from a same-origin window that is not the index embed', async () => {
        const { posted } = await mountOnIndexWithLoadedIframe();

        sendFrom(window, { type: 'mv-present-ready' });
        sendFrom(null, { type: 'mv-present-ready' });

        expect(pollNow).not.toHaveBeenCalled();
        expect(hook.opts!.onCommand(categoryCommand)).toBe(false);
        expect(posted).not.toHaveBeenCalledWith({ type: 'mv-category', category: 'US' }, window.location.origin);
    });
});
