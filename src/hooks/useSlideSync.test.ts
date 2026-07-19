// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PresentSlide } from '../settings';
import type { UseSlideSyncResult } from './useSlideSync';

// Deferred save handles — captured per saveRemoteSlide() call so a test can
// decide when (and how) an in-flight save settles.
let resolveSave: (() => void) | null = null;
let rejectSave: ((e: unknown) => void) | null = null;

vi.mock('../slideApi', () => ({
    // Shrunk from 256 KB so an "oversize" payload is a 2 KB string.
    MAX_CONTENT_BYTES: 1024,
    isValidPresentSlide: () => true,
    loadRemoteSlide: async () => null,
    StaleSaveError: class StaleSaveError extends Error {
        constructor(public remote = false) { super('x'); }
    },
    saveRemoteSlide: () => new Promise<void>((res, rej) => {
        resolveSave = res;
        rejectSave = rej;
    }),
}));

const { useSlideSync } = await import('./useSlideSync');

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let latest: UseSlideSyncResult;

function Harness() {
    latest = useSlideSync();
    return null;
}

async function flush() {
    for (let i = 0; i < 8; i += 1) {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
    }
}

function slide(content: string): PresentSlide {
    return { mode: 'markdown', content, updatedAt: Date.now() };
}

describe('useSlideSync oversize edit vs. in-flight save', () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        // saveSlide() persists the merged slide BEFORE its size check, so an
        // oversize slide would otherwise become the next test's initial state.
        localStorage.clear();
        // settings.ts memoises the parsed settings in a module-level cache that
        // localStorage.clear() cannot reach; its own 'storage' listener drops it.
        window.dispatchEvent(new StorageEvent('storage', { key: 'marketflow_settings' }));
        resolveSave = null;
        rejectSave = null;
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root.render(createElement(Harness));
        });
        await flush();
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
    });

    it('keeps the oversize error when a save raced by that edit resolves', async () => {
        await act(async () => {
            latest.doRemoteSave(slide('small'));
        });
        expect(latest.cloudStatus).toBe('saving');
        expect(resolveSave).toBeTypeOf('function');

        // Presenter pastes a deck too big to sync while that save is in flight.
        await act(async () => {
            latest.saveSlide({ content: 'x'.repeat(2048) });
        });
        expect(latest.cloudStatus).toBe('error');
        expect(latest.sizeWarning).not.toBeNull();

        // The raced save now comes back OK. It must not repaint the indicator.
        await act(async () => {
            resolveSave!();
        });
        await flush();

        expect(latest.cloudStatus).toBe('error');
        expect(latest.sizeWarning).not.toBeNull();
        expect(latest.lastSavedAt).toBeNull();

        // ...and the 2s decay-to-idle that the OK path schedules must not fire.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });
        expect(latest.cloudStatus).toBe('error');
    });

    it('still reports a normal save as ok and decays to idle', async () => {
        await act(async () => {
            latest.doRemoteSave(slide('under the limit'));
        });
        expect(latest.cloudStatus).toBe('saving');

        await act(async () => {
            resolveSave!();
        });
        await flush();

        expect(latest.cloudStatus).toBe('ok');
        expect(typeof latest.lastSavedAt).toBe('number');
        expect(latest.sizeWarning).toBeNull();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(latest.cloudStatus).toBe('idle');
    });

    it('keeps the oversize error when the raced save rejects', async () => {
        await act(async () => {
            latest.doRemoteSave(slide('small'));
        });
        expect(latest.cloudStatus).toBe('saving');
        expect(rejectSave).toBeTypeOf('function');

        await act(async () => {
            latest.saveSlide({ content: 'y'.repeat(2048) });
        });
        expect(latest.cloudStatus).toBe('error');
        expect(latest.sizeWarning).not.toBeNull();

        // Unrelated network failure on the superseded save: its own
        // error + 3s decay to idle would wipe the oversize warning state.
        await act(async () => {
            rejectSave!(new Error('boom'));
        });
        await flush();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3000);
        });
        expect(latest.cloudStatus).toBe('error');
        expect(latest.sizeWarning).not.toBeNull();
    });
});

// loadRemoteSlide is mocked to return null for every test in this file, which is
// exactly the state that makes this reachable in production: the mount load fails
// (or has not landed), so the hook is still holding DEFAULT_SLIDE with updatedAt 0.
describe('useSlideSync Save before the deck has loaded', () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        localStorage.clear();
        window.dispatchEvent(new StorageEvent('storage', { key: 'marketflow_settings' }));
        resolveSave = null;
        rejectSave = null;
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root.render(createElement(Harness));
        });
        await flush();
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
    });

    it('refuses to post the never-loaded placeholder instead of overwriting the live deck', async () => {
        // Precondition: nothing has been loaded or edited, so updatedAt is still 0.
        expect(latest.slide.updatedAt).toBe(0);

        // Both Save buttons call doRemoteSave() with no argument
        // (PresentationControl.tsx, SlideEditorPanel.tsx), so it saves slideRef.
        await act(async () => {
            latest.doRemoteSave();
        });

        // No request at all: updatedAt 0 would take the server's legacy branch,
        // which writes unconditionally with a fresh Date.now() and beats the real deck.
        expect(resolveSave).toBeNull();
        expect(latest.cloudStatus).toBe('error');
        expect(latest.sizeWarning).not.toBeNull();
    });

    it('still saves normally once the slide has a real timestamp', async () => {
        await act(async () => {
            latest.saveSlide({ content: 'real edit' });
        });
        expect(latest.slide.updatedAt).toBeGreaterThan(0);

        await act(async () => {
            latest.doRemoteSave();
        });
        expect(latest.cloudStatus).toBe('saving');
        expect(resolveSave).toBeTypeOf('function');
    });
});
