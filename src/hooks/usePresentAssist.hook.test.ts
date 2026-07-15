// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const fetchProjectorState = vi.fn();
const fetchAssist = vi.fn();
vi.mock('../presentCommandApi', () => ({
    fetchProjectorState: (...args: unknown[]) => fetchProjectorState(...args),
    fetchAssist: (...args: unknown[]) => fetchAssist(...args),
}));
vi.mock('../pdfText', () => ({
    loadPdf: vi.fn(async () => ({ numPages: 3, destroy: vi.fn() })),
    extractPdfPageText: vi.fn(async () => 'slide text '.repeat(10)),
}));

const { usePresentAssist } = await import('./usePresentAssist');

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const SLIDE = { mode: 'pdf' as const, content: 'https://example.com/deck.pdf', updatedAt: 7 };
const ASSIST = { points: ['a point'], questions: [] };

let root: Root;
let container: HTMLDivElement;
let latest: ReturnType<typeof usePresentAssist>;

function Harness() {
    latest = usePresentAssist({ slide: SLIDE, lang: 'en', enabled: true });
    return null;
}

async function flush() {
    // Drain microtasks + due timers a few rounds so poll/debounce chains settle.
    for (let i = 0; i < 8; i += 1) {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
    }
}

describe('usePresentAssist integration', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        document.body.appendChild(container);
        // Fresh object identity per poll, same logical state — the regression
        // this file pins is the assist effect re-firing on poll identity churn.
        fetchProjectorState.mockImplementation(async () => ({
            projector: { mode: 'pdf', page: 2, v: 7, at: Date.now() },
            serverTime: Date.now(),
        }));
        fetchAssist.mockReset();
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
    });

    it('a slow assist request survives poll cycles instead of being re-aborted (regression)', async () => {
        // Assist takes 6s — longer than the 4s projector poll interval.
        fetchAssist.mockImplementation((_text, _lang, signal: AbortSignal) =>
            new Promise((resolve, reject) => {
                const timer = setTimeout(() => resolve(ASSIST), 6000);
                signal?.addEventListener('abort', () => {
                    clearTimeout(timer);
                    reject(new DOMException('aborted', 'AbortError'));
                });
            }));

        root = createRoot(container);
        await act(async () => {
            root.render(createElement(Harness));
        });
        await flush();

        // Walk through: debounce (800ms) + three poll cycles + assist latency.
        for (const step of [800, 4000, 4000, 4000, 2000]) {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(step);
            });
            await flush();
        }

        expect(fetchAssist).toHaveBeenCalledTimes(1);
        expect(latest.status).toBe('ready');
        expect(latest.assist).toEqual(ASSIST);
        expect(latest.page).toBe(2);
        expect(latest.live).toBe(true);
    });

    it('debounce coalesces and stays effective after a retry', async () => {
        fetchAssist.mockRejectedValueOnce(new Error('boom'));
        fetchAssist.mockResolvedValue(ASSIST);

        root = createRoot(container);
        await act(async () => {
            root.render(createElement(Harness));
        });
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(800);
        });
        await flush();
        expect(fetchAssist).toHaveBeenCalledTimes(1);
        expect(latest.status).toBe('error');

        // Retry bypasses the debounce once…
        await act(async () => {
            latest.retry();
        });
        await flush();
        expect(fetchAssist).toHaveBeenCalledTimes(2);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        await flush();
        expect(latest.status).toBe('ready');

        // …and once the target is cached, a further retry serves from the
        // client cache instead of spending another server request.
        await act(async () => {
            latest.retry();
        });
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(800);
        });
        await flush();
        expect(fetchAssist).toHaveBeenCalledTimes(2);
        expect(latest.status).toBe('ready');
    });
});
