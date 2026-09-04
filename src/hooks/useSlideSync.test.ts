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

const { mockLoadRemoteSlide } = vi.hoisted(() => ({
    mockLoadRemoteSlide: vi.fn<() => Promise<PresentSlide | null>>().mockResolvedValue(null),
}));

vi.mock('../slideApi', () => ({
    // Shrunk from 256 KB so an "oversize" payload is a 2 KB string.
    MAX_CONTENT_BYTES: 1024,
    isValidPresentSlide: () => true,
    loadRemoteSlide: () => mockLoadRemoteSlide(),
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

function Harness(props: { pollRemoteMs?: number } = {}) {
    latest = useSlideSync(props.pollRemoteMs !== undefined ? { pollRemoteMs: props.pollRemoteMs } : undefined);
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
        mockLoadRemoteSlide.mockReset();
        mockLoadRemoteSlide.mockResolvedValue(null);
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
        mockLoadRemoteSlide.mockReset();
        mockLoadRemoteSlide.mockResolvedValue(null);
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

describe('useSlideSync remote polling', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        window.dispatchEvent(new StorageEvent('storage', { key: 'marketflow_settings' }));
        mockLoadRemoteSlide.mockReset();
        mockLoadRemoteSlide.mockResolvedValue(null);
        resolveSave = null;
        rejectSave = null;
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
    });

    it('(a) no option -> loadRemoteSlide called exactly once (mount) after 60 s of fake time', async () => {
        await act(async () => {
            root.render(createElement(Harness));
        });
        await flush();
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
        });
        await flush();
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(1);
    });

    it('(b) pollRemoteMs 10_000 -> called at mount, then again at ~10 s and ~20 s', async () => {
        await act(async () => {
            root.render(createElement(Harness, { pollRemoteMs: 10_000 }));
        });
        await flush();
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        await flush();
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(2);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        await flush();
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(3);
    });

    it('(c) a newer remote slide replaces state; an older one (updatedAt lower) does not', async () => {
        mockLoadRemoteSlide.mockResolvedValue({ mode: 'markdown', content: 'v1', updatedAt: 1000 });
        await act(async () => {
            root.render(createElement(Harness, { pollRemoteMs: 10_000 }));
        });
        await flush();
        expect(latest.slide.content).toBe('v1');
        expect(latest.slide.updatedAt).toBe(1000);

        // Remote returns an older slide — ignored
        mockLoadRemoteSlide.mockResolvedValue({ mode: 'markdown', content: 'v0-stale', updatedAt: 500 });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        await flush();
        expect(latest.slide.content).toBe('v1');
        expect(latest.slide.updatedAt).toBe(1000);

        // Remote returns a newer slide — applied
        mockLoadRemoteSlide.mockResolvedValue({ mode: 'markdown', content: 'v2-fresh', updatedAt: 2000 });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        await flush();
        expect(latest.slide.content).toBe('v2-fresh');
        expect(latest.slide.updatedAt).toBe(2000);
    });

    it('(d) a rejected promise does not break subsequent polls', async () => {
        await act(async () => {
            root.render(createElement(Harness, { pollRemoteMs: 10_000 }));
        });
        await flush();
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(1);

        // First poll rejects
        mockLoadRemoteSlide.mockRejectedValueOnce(new Error('fetch failed'));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        await flush();
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(2);

        // Subsequent poll resolves successfully and updates state
        mockLoadRemoteSlide.mockResolvedValueOnce({ mode: 'markdown', content: 'recovered', updatedAt: 5000 });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        await flush();
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(3);
        expect(latest.slide.content).toBe('recovered');
    });

    it('(e) unmount stops polling', async () => {
        await act(async () => {
            root.render(createElement(Harness, { pollRemoteMs: 10_000 }));
        });
        await flush();
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(1);

        await act(async () => {
            root.unmount();
        });
        await flush();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(30_000);
        });
        await flush();
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(1);
    });

    it('skips fetch when document is hidden and polls immediately when visible', async () => {
        await act(async () => {
            root.render(createElement(Harness, { pollRemoteMs: 10_000 }));
        });
        await flush();
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(1);

        // Hide document
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        await flush();
        // Skipped: count stays at 1
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(1);

        // Restore visible state and fire event
        Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });
        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await flush();
        // Immediately triggered poll on becoming visible
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(2);
    });

    it('never applies a remote slide while a local save is pending or in flight', async () => {
        await act(async () => {
            root.render(createElement(Harness, { pollRemoteMs: 10_000 }));
        });
        await flush();

        // Local edit (sets slide, sets saving, schedules save)
        await act(async () => {
            latest.saveSlide({ content: 'local deck' });
        });
        expect(latest.slide.content).toBe('local deck');
        expect(latest.cloudStatus).toBe('saving');

        // Remote poll returns newer slide while save is pending / in flight
        mockLoadRemoteSlide.mockResolvedValue({ mode: 'markdown', content: 'remote deck', updatedAt: Date.now() + 50000 });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        await flush();

        // Safety guard: local edit is not overwritten
        expect(latest.slide.content).toBe('local deck');
    });

    it('applies a newer remote deck after a local edit has finished saving (timer handle cleared)', async () => {
        await act(async () => {
            root.render(createElement(Harness, { pollRemoteMs: 10_000 }));
        });
        await flush();

        await act(async () => {
            latest.saveSlide({ content: 'local deck' });
        });
        // Debounce fires, save goes in flight, then resolves.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(800);
        });
        await flush();
        expect(resolveSave).toBeTypeOf('function');
        await act(async () => { resolveSave!(); });
        await flush();
        expect(latest.cloudStatus).toBe('ok');

        mockLoadRemoteSlide.mockResolvedValue({ mode: 'markdown', content: 'phone deck', updatedAt: Date.now() + 50_000 });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        await flush();
        expect(latest.slide.content).toBe('phone deck');
    });

    it('a poll in flight when polling is disabled does not reschedule', async () => {
        let resolveLoad: ((v: PresentSlide | null) => void) | null = null;
        await act(async () => {
            root.render(createElement(Harness, { pollRemoteMs: 10_000 }));
        });
        await flush();
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(1);

        mockLoadRemoteSlide.mockImplementationOnce(() => new Promise(res => { resolveLoad = res; }));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(2);

        await act(async () => {
            root.render(createElement(Harness, { pollRemoteMs: 0 }));
        });
        await act(async () => { resolveLoad!(null); });
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
        });
        await flush();
        expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(2);
    });

    it('treats 0, negative, NaN, non-finite pollRemoteMs as no polling', async () => {
        for (const invalid of [0, -1000, Number.NaN, Number.POSITIVE_INFINITY]) {
            await act(async () => {
                root.unmount();
                root = createRoot(container);
            });
            mockLoadRemoteSlide.mockClear();
            await act(async () => {
                root.render(createElement(Harness, { pollRemoteMs: invalid }));
            });
            await flush();
            expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(1);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(30_000);
            });
            await flush();
            expect(mockLoadRemoteSlide).toHaveBeenCalledTimes(1);
        }
    });
});
