// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ClientGlossarySession } from '../glossaryApi';
import {
    GLOSSARY_PUSH_DEBOUNCE_MS,
    GLOSSARY_SESSION_STORAGE_KEY,
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

describe('useGlossarySession sweep 19', () => {
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

    it('end() drops a pending debounced push instead of letting it fire mid-end', async () => {
        await startLiveSession();

        // Schedule a debounced push, then end before the debounce elapses.
        act(() => {
            latest!.reportTerms([{ term: 'bps', explanation: 'Basis points' }], 'en');
        });
        await act(async () => {
            void latest!.end();
        });
        settle('end', ok({ success: true }));
        await flush();

        // Run well past the debounce window: no push request may appear —
        // pre-fix it fired against the just-ended (or quickly reopened) session.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(GLOSSARY_PUSH_DEBOUNCE_MS * 3);
        });
        expect(waiting['push'] ?? []).toHaveLength(0);
    });

    it('rehydrate keeps the stored join code when a captive portal answers 200 without a session', async () => {
        localStorage.setItem(GLOSSARY_SESSION_STORAGE_KEY, JOIN_CODE);

        await act(async () => {
            root.render(createElement(Harness));
        });
        // Malformed 200: body parses but carries no session object.
        settle('get', ok({ hotspot: 'login required' }));
        await flush();

        // Pre-fix this read as "expired" and DELETED the stored code.
        expect(localStorage.getItem(GLOSSARY_SESSION_STORAGE_KEY)).toBe(JOIN_CODE);
        expect(latest!.session).toBeNull();
        expect(latest!.error).not.toBeNull();
    });

    it('rehydrate still clears the stored code on a real 404', async () => {
        localStorage.setItem(GLOSSARY_SESSION_STORAGE_KEY, JOIN_CODE);

        await act(async () => {
            root.render(createElement(Harness));
        });
        settle('get', { ok: false, status: 404, json: async () => ({ error: 'not_found' }) });
        await flush();

        expect(localStorage.getItem(GLOSSARY_SESSION_STORAGE_KEY)).toBeNull();
        expect(latest!.session).toBeNull();
    });
});
