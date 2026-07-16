// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const fetchProjectorState = vi.fn();
const fetchAssist = vi.fn();
const fetchAssistImage = vi.fn();
vi.mock('../presentCommandApi', () => ({
    fetchProjectorState: (...args: unknown[]) => fetchProjectorState(...args),
    fetchAssist: (...args: unknown[]) => fetchAssist(...args),
    fetchAssistImage: (...args: unknown[]) => fetchAssistImage(...args),
}));
const extractPdfPageText = vi.fn(async (_doc: unknown, _page: unknown) => 'slide text '.repeat(10));
const renderPdfPageToJpeg = vi.fn(async (_doc: unknown, _page: unknown) => 'A'.repeat(100));
vi.mock('../pdfText', () => ({
    loadPdf: vi.fn(async () => ({ numPages: 3, destroy: vi.fn() })),
    extractPdfPageText: (...args: unknown[]) => extractPdfPageText(args[0], args[1]),
    renderPdfPageToJpeg: (...args: unknown[]) => renderPdfPageToJpeg(args[0], args[1]),
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
        fetchAssistImage.mockReset();
        extractPdfPageText.mockResolvedValue('slide text '.repeat(10));
        renderPdfPageToJpeg.mockResolvedValue('A'.repeat(100));
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

    it('uses an image target when extracted PDF text is ineligible', async () => {
        extractPdfPageText.mockResolvedValue('short');
        fetchAssistImage.mockResolvedValue(ASSIST);

        root = createRoot(container);
        await act(async () => {
            root.render(createElement(Harness));
        });
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(800);
        });
        await flush();

        expect(fetchAssist).not.toHaveBeenCalled();
        expect(fetchAssistImage).toHaveBeenCalledWith(
            'A'.repeat(100),
            '7#2',
            'https://example.com/deck.pdf',
            'en',
            expect.any(AbortSignal),
        );
        expect(latest.status).toBe('ready');
    });

    it('returns notext only when text is ineligible and page rendering fails', async () => {
        extractPdfPageText.mockResolvedValue('');
        renderPdfPageToJpeg.mockResolvedValue(null);

        root = createRoot(container);
        await act(async () => {
            root.render(createElement(Harness));
        });
        await flush();

        expect(fetchAssist).not.toHaveBeenCalled();
        expect(fetchAssistImage).not.toHaveBeenCalled();
        expect(latest.status).toBe('notext');
    });

    it('uses the 60s image timeout instead of the 45s text timeout', async () => {
        extractPdfPageText.mockResolvedValue('');
        let aborted = false;
        fetchAssistImage.mockImplementation((_image, _slideId, _deckKey, _lang, signal: AbortSignal) =>
            new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => {
                    aborted = true;
                    reject(new DOMException('aborted', 'AbortError'));
                });
            }));

        root = createRoot(container);
        await act(async () => {
            root.render(createElement(Harness));
        });
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(800);
        });
        await flush();
        expect(fetchAssistImage).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(45_000);
        });
        await flush();
        expect(aborted).toBe(false);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(15_000);
        });
        await flush();
        expect(aborted).toBe(true);
        expect(latest.status).toBe('error');
    });
});
