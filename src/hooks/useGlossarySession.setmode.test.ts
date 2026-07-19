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

function fail(status: number, body: unknown): FakeResponse {
    return { ok: false, status, json: async () => body };
}

// One queue of unsettled fetch resolvers per `action` in the request body, so
// each round-trip can be held open for as long as the test needs.
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
        currentPage: 3,
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

const STARTED = session({ version: 1, mode: 'gradual', terms: [], joins: 0 });

// What the term push wrote to the server while setMode was still awaiting.
const AFTER_PUSH = session({
    version: 2,
    mode: 'gradual',
    joins: 4,
    terms: [{
        id: 'bps',
        term: 'bps',
        explanation: { en: 'Basis points' },
        firstPage: 3,
        unlockedAt: 1_500,
    }],
    termCount: 1,
    updatedAt: 1_500,
});

/** Drive the hook to: live session -> one term pushed (still in flight) -> setMode('all') in flight. */
async function arrangeInFlightSetMode() {
    await act(async () => {
        root.render(createElement(Harness));
    });

    await act(async () => {
        void latest!.start('gradual', true);
    });
    settle('start', ok({ session: STARTED }));
    await flush();
    expect(latest!.session?.mode).toBe('gradual');

    act(() => {
        latest!.reportTerms([TERM], 'en');
    });
    await act(async () => {
        await vi.advanceTimersByTimeAsync(GLOSSARY_PUSH_DEBOUNCE_MS + 1);
    });
    expect(waiting.push?.length).toBe(1); // push is out, held unresolved

    await act(async () => {
        void latest!.setMode('all');
    });
    expect(waiting.config?.length).toBe(1); // config is out, held unresolved
    expect(latest!.session?.mode).toBe('all'); // optimistic flip

    // The push lands FIRST, while config is still awaiting.
    settle('push', ok({ session: AFTER_PUSH }));
    await flush();
    expect(latest!.session?.terms).toHaveLength(1);
    expect((latest!.session as { joins: number }).joins).toBe(4);
}

describe('useGlossarySession setMode does not clobber a term push that lands mid-flight', () => {
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

    it('failure branch: a rejected config rolls back only mode, keeping terms and joins from the push', async () => {
        await arrangeInFlightSetMode();

        settle('config', fail(409, { error: 'version_conflict' }));
        await flush();

        // The catch branch really ran.
        expect(latest!.error).toBe('version_conflict');
        // Only the optimistic field is rolled back...
        expect(latest!.session?.mode).toBe('gradual');
        // ...the push's content survives. (Unfixed code restored the pre-await
        // snapshot here, wiping both of these.)
        expect(latest!.session?.terms).toHaveLength(1);
        expect(latest!.session?.terms[0]?.term).toBe('bps');
        expect((latest!.session as { joins: number }).joins).toBe(4);
    });

    it('success branch: a stale config response applies its own mode without reverting terms and joins', async () => {
        await arrangeInFlightSetMode();

        // The config endpoint owns mode/keepAfter only; its snapshot of
        // everything else predates the push that already landed.
        settle('config', ok({
            session: session({ version: 1, mode: 'all', terms: [], termCount: 0, joins: 0 }),
        }));
        await flush();

        expect(latest!.error).toBeNull();
        expect(latest!.session?.mode).toBe('all'); // config's own field applied
        expect(latest!.session?.terms).toHaveLength(1);
        expect(latest!.session?.terms[0]?.term).toBe('bps');
        expect((latest!.session as { joins: number }).joins).toBe(4);
    });
});
