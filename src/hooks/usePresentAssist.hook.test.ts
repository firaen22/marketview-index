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

    it('starting prepare invalidates a live run still resolving its target (no double fetch) (regression)', async () => {
        // The reachable window: the hook is settled, the projector flips to a
        // new page, and the re-fired live run is mid-extract (nothing armed or
        // in flight for clearAssistRequest to kill) when Prepare is tapped.
        // Without the loadKeyRef bump that run resumes, arms its debounce, and
        // fires a second generation for a page the prepare loop is warming.
        let fetchCalls = 0;
        fetchAssist.mockImplementation(() => {
            fetchCalls += 1;
            // Later (prepare-loop) generations are slow, so they have not yet
            // cached the flipped-to page when a leaked live debounce would fire.
            return fetchCalls === 1
                ? Promise.resolve(ASSIST)
                : new Promise(resolve => setTimeout(() => resolve(ASSIST), 2000));
        });

        root = createRoot(container);
        await act(async () => {
            root.render(createElement(Harness));
        });
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(800);
        });
        await flush();
        expect(latest.status).toBe('ready');
        expect(fetchAssist).toHaveBeenCalledTimes(1);

        // Projector flips to page 3; the re-fired live run parks in extract.
        extractPdfPageText.mockImplementationOnce(async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return 'slide text '.repeat(10);
        });
        fetchProjectorState.mockImplementation(async () => ({
            projector: { mode: 'pdf', page: 3, v: 7, at: Date.now() },
            serverTime: Date.now(),
        }));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4000);
        });
        await flush();

        await act(async () => {
            latest.prepare.start();
        });
        await flush();
        expect(latest.prepare.status).toBe('preparing');

        // Parked extract resolves, debounce window passes, prepare runs out
        // (page 2 is already cached, so it warms pages 1 and 3).
        for (const step of [1000, 800, 2000, 2000, 2000]) {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(step);
            });
            await flush();
        }

        expect(latest.prepare.status).toBe('done');
        // 1 initial live + 2 prepare-loop generations — no fourth call from
        // the superseded live run.
        expect(fetchAssist).toHaveBeenCalledTimes(3);
    });

    it('a language switch mid-prepare cancels the run AND revives the assist effect (regression)', async () => {
        fetchAssist.mockResolvedValue(ASSIST);

        let lang: 'en' | 'zh-TW' = 'en';
        function SwapHarness() {
            latest = usePresentAssist({ slide: SLIDE, lang, enabled: true });
            return null;
        }

        root = createRoot(container);
        await act(async () => {
            root.render(createElement(SwapHarness));
        });
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(800);
        });
        await flush();
        expect(latest.status).toBe('ready');

        // Prepare hangs on its first uncached page, keeping the run active.
        fetchAssist.mockImplementation(() => new Promise(() => undefined));
        await act(async () => {
            latest.prepare.start();
        });
        await flush();
        expect(latest.prepare.status).toBe('preparing');
        const callsBeforeSwitch = fetchAssist.mock.calls.length;

        // Switch language while preparing: the assist effect (declared before
        // the cancel effect) already bailed on 'preparing' this render — the
        // cancel effect must bump the nonce or notes stay dead until the next
        // page change.
        lang = 'zh-TW';
        await act(async () => {
            root.render(createElement(SwapHarness));
        });
        await flush();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(800);
        });
        await flush();

        expect(latest.prepare.status).toBe('idle');
        // The revived effect went back to work in the new language (its fetch
        // is the hanging mock, so it parks in 'loading' — the dead state this
        // regression pins is stuck-'ready' with stale notes and no new fetch).
        expect(fetchAssist.mock.calls.length).toBeGreaterThan(callsBeforeSwitch);
        expect(latest.status).toBe('loading');
    });
});
