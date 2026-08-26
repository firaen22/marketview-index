// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ClientGlossarySession } from '../glossaryApi';
import {
    GLOSSARY_PUSH_DEBOUNCE_MS,
    useGlossarySession,
    type UseGlossarySessionResult,
} from './useGlossarySession';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let latest: UseGlossarySessionResult | null = null;

function Harness() {
    latest = useGlossarySession();
    return null;
}

async function flush() {
    for (let i = 0; i < 8; i += 1) {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
    }
}

interface FakeResponse {
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
}

function ok(body: unknown): FakeResponse {
    return { ok: true, status: 200, json: async () => body };
}

const waiting: Record<string, ((response: FakeResponse) => void)[]> = {};

function settle(action: string, response: FakeResponse) {
    const queue = waiting[action];
    if (!queue || queue.length === 0) {
        throw new Error(`no in-flight '${action}' request to settle`);
    }
    queue.shift()!(response);
}

const JOIN_CODE = 'ABCDEFGH';
const TERM = { term: 'bps', explanation: 'Basis points' };

function session(overrides: Record<string, unknown>): ClientGlossarySession {
    return {
        joinCode: JOIN_CODE,
        version: 1,
        status: 'live',
        mode: 'gradual',
        currentPage: 0,
        slideVersion: 0,
        startedAt: 1_000,
        endedAt: null,
        keepAfter: true,
        joins: 0,
        terms: [],
        termCount: 0,
        updatedAt: 1_000,
        ...overrides,
    } as unknown as ClientGlossarySession;
}

// What the server returns after a copilot explain pushed one term with the
// page-1 fallback: the term is stored and currentPage is stamped to 1, even
// though no deck was ever loaded.
const AFTER_COPILOT_PUSH = session({
    version: 2,
    currentPage: 1,
    terms: [{
        id: 'bps',
        term: 'bps',
        explanation: { en: 'Basis points' },
        firstPage: 1,
        unlockedAt: 1_500,
    }],
    termCount: 1,
    updatedAt: 1_500,
});

describe('useGlossarySession renew treats copilot-only content as not-from-the-deck', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        for (const key of Object.keys(waiting)) delete waiting[key];
        latest = null;
        vi.stubGlobal('fetch', vi.fn((_url: string, init?: { body?: string }) => {
            let action = 'get';
            if (init?.body) {
                try {
                    action = String(JSON.parse(init.body).action ?? 'get');
                } catch {
                    action = 'unparseable';
                }
            }
            return new Promise<FakeResponse>(resolve => {
                (waiting[action] ||= []).push(resolve);
            });
        }));
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
        vi.unstubAllGlobals();
    });

    async function startLiveSession() {
        await act(async () => {
            root.render(createElement(Harness));
        });
        await act(async () => {
            void latest!.start('gradual', true);
        });
        settle('start', ok({ session: session({}) }));
        await flush();
        expect(latest!.session?.joinCode).toBe(JOIN_CODE);
    }

    it('keeps the QR when the only content came from a copilot explain', async () => {
        await startLiveSession();

        // Warm-up Q&A before any deck is loaded: no page has ever been
        // reported, so reportTerms falls back to page 1.
        act(() => {
            latest!.reportTerms([TERM], 'en');
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(GLOSSARY_PUSH_DEBOUNCE_MS + 1);
        });
        settle('push', ok({ session: AFTER_COPILOT_PUSH }));
        await flush();
        expect(latest!.session?.terms).toHaveLength(1);

        // Presenter now uploads the first deck.
        await act(async () => {
            void latest!.renew();
        });
        await flush();

        // The session must survive: nothing from an old deck is stranded, so
        // the audience must not be forced to rescan a newly issued QR.
        expect(waiting.end).toBeUndefined();
        expect(latest!.session?.joinCode).toBe(JOIN_CODE);
        expect(latest!.session?.status).toBe('live');
    });

    it('still retires the session once the deck itself contributed a page', async () => {
        await startLiveSession();

        act(() => {
            latest!.reportPage(4);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(GLOSSARY_PUSH_DEBOUNCE_MS + 1);
        });
        settle('push', ok({ session: session({ version: 2, currentPage: 4 }) }));
        await flush();

        await act(async () => {
            void latest!.renew();
        });
        await flush();

        // Deck content is stranded by the swap, so the old code is retired.
        expect(waiting.end?.length).toBe(1);
    });
});
