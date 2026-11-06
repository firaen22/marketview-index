import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { presentActionInputSchema } from './actionSchema.js';
import { clearCatalogCache } from './catalog.js';
import { ACK_MAX_ATTEMPTS, ACK_POLL_INTERVAL_MS, ACK_POLL_SCHEDULE_MS } from './presentClient.js';
import { TOOL_DEFINITIONS, TOOL_HANDLERS } from './tools.js';

function ackPollDelaysMs(): number[] {
    return Array.from({ length: ACK_MAX_ATTEMPTS }, (_, i) =>
        ACK_POLL_SCHEDULE_MS[i] ?? ACK_POLL_INTERVAL_MS,
    );
}

function ackPollWallSeconds(): string {
    const wallMs = ackPollDelaysMs().reduce((sum, ms) => sum + ms, 0);
    return (wallMs / 1000).toFixed(1);
}

const ORIGIN = 'https://mv-polish.test';
const market = [{ symbol: '^HSI', name: 'Hang Seng' }, { symbol: 'QQQ', name: 'Nasdaq 100' }];
const macro = [{ symbol: 'US10Y', name: 'US 10Y' }];

type Route = (url: string, init?: RequestInit) => unknown;
let posts: Array<Record<string, unknown>> = [];

function stubFetch(routes: { market?: unknown; macro?: unknown; post?: unknown; status?: Route } = {}) {
    posts = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        const reply = (body: unknown, status = 200) =>
            new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
        if (u.includes('/api/market-data')) return reply(routes.market ?? { data: market });
        if (u.includes('/api/macro-data')) return reply(routes.macro ?? { data: macro });
        if (u.includes('/api/present-command') && init?.method === 'POST') {
            posts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
            return reply(routes.post ?? {
                success: true,
                command: { v: 1, id: 'c1', kind: 'compare', symbols: [], issuedAt: 1 },
            });
        }
        return reply(routes.status ? routes.status(u, init) : {
            success: true, command: null, serverTime: 1, projector: null, projectorLast: null, applied: null,
        });
    }));
}

const parse = (r: { content: { text: string }[]; isError?: boolean }) => ({
    isError: !!r.isError,
    body: JSON.parse(r.content[0].text) as Record<string, unknown>,
});

beforeEach(() => {
    clearCatalogCache();
    vi.stubEnv('MARKETVIEW_ORIGIN', ORIGIN);
    vi.stubEnv('PRESENT_API_KEY', 'test-key');
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('polish 1 — custom overlay refused locally', () => {
    it('https src → custom_overlay_forbidden, no fetch', async () => {
        stubFetch();
        const fetchFn = fetch as ReturnType<typeof vi.fn>;
        const r = parse(await TOOL_HANDLERS.present_action({
            action: 'overlay',
            src: 'https://example.com/a.png',
            wait_for_ack: false,
        }));
        expect(r.isError).toBe(true);
        expect(r.body.error).toBe('custom_overlay_forbidden');
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('data URL src → custom_overlay_forbidden, no fetch', async () => {
        stubFetch();
        const fetchFn = fetch as ReturnType<typeof vi.fn>;
        const r = parse(await TOOL_HANDLERS.present_action({
            action: 'overlay',
            src: 'data:image/svg+xml;base64,PHN2Zy8+',
            wait_for_ack: false,
        }));
        expect(r.isError).toBe(true);
        expect(r.body.error).toBe('custom_overlay_forbidden');
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('refuses overlay even when PRESENT_API_KEY is unset', async () => {
        vi.unstubAllEnvs();
        vi.stubEnv('MARKETVIEW_ORIGIN', ORIGIN);
        delete process.env.PRESENT_API_KEY;
        stubFetch();
        const fetchFn = fetch as ReturnType<typeof vi.fn>;
        const r = parse(await TOOL_HANDLERS.present_action({
            action: 'overlay',
            src: 'https://example.com/x.png',
        }));
        expect(r.body.error).toBe('custom_overlay_forbidden');
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('overlay_clear still POSTs clear overlay', async () => {
        stubFetch();
        const r = parse(await TOOL_HANDLERS.present_action({ action: 'overlay_clear', wait_for_ack: false }));
        expect(r.isError).toBe(false);
        expect(posts[0]).toEqual({ action: 'overlay', clear: true });
    });
});

describe('polish 2 — compare highlight window', () => {
    const compareBase = { action: 'compare' as const, symbols: ['^HSI', 'QQQ'], wait_for_ack: false };

    it('compare highlight JSON Schema descriptions mention calendar day and on or before', () => {
        type Branch = { properties: Record<string, { const?: string; description?: string }> };
        const compareBranch = (presentActionInputSchema.oneOf as unknown as Branch[]).find(
            b => b.properties.action?.const === 'compare',
        );
        expect(compareBranch).toBeDefined();
        for (const key of ['highlightFrom', 'highlightTo'] as const) {
            const desc = compareBranch!.properties[key]?.description ?? '';
            expect(desc, key).toMatch(/calendar day/i);
            expect(desc, key).toMatch(/on or before/i);
        }
    });

    it('only highlightFrom → invalid_arguments, no POST', async () => {
        stubFetch();
        const r = parse(await TOOL_HANDLERS.present_action({ ...compareBase, highlightFrom: '2026-01-01' }));
        expect(r.isError).toBe(true);
        expect(r.body.error).toBe('invalid_arguments');
        expect(posts.length).toBe(0);
    });

    it('only highlightTo → invalid_arguments, no POST', async () => {
        stubFetch();
        const r = parse(await TOOL_HANDLERS.present_action({ ...compareBase, highlightTo: '2026-01-01' }));
        expect(r.isError).toBe(true);
        expect(r.body.error).toBe('invalid_arguments');
        expect(posts.length).toBe(0);
    });

    it('2026-02-31 → invalid_arguments', async () => {
        stubFetch();
        const r = parse(await TOOL_HANDLERS.present_action({
            ...compareBase,
            highlightFrom: '2026-02-31',
            highlightTo: '2026-03-01',
        }));
        expect(r.isError).toBe(true);
        expect(r.body.error).toBe('invalid_arguments');
        expect(posts.length).toBe(0);
    });

    it('2026-13-01 → invalid_arguments', async () => {
        stubFetch();
        const r = parse(await TOOL_HANDLERS.present_action({
            ...compareBase,
            highlightFrom: '2026-01-01',
            highlightTo: '2026-13-01',
        }));
        expect(r.isError).toBe(true);
        expect(r.body.error).toBe('invalid_arguments');
        expect(posts.length).toBe(0);
    });

    it('2026-1-01 → invalid_arguments (pattern)', async () => {
        stubFetch();
        const r = parse(await TOOL_HANDLERS.present_action({
            ...compareBase,
            highlightFrom: '2026-1-01',
            highlightTo: '2026-01-02',
        }));
        expect(r.isError).toBe(true);
        expect(r.body.error).toBe('invalid_arguments');
        expect(posts.length).toBe(0);
    });

    it('reversed dates → invalid_arguments', async () => {
        stubFetch();
        const r = parse(await TOOL_HANDLERS.present_action({
            ...compareBase,
            highlightFrom: '2026-06-01',
            highlightTo: '2026-01-01',
        }));
        expect(r.isError).toBe(true);
        expect(r.body.error).toBe('invalid_arguments');
        expect(posts.length).toBe(0);
    });

    it('equal dates → valid POST with both', async () => {
        stubFetch();
        const r = parse(await TOOL_HANDLERS.present_action({
            ...compareBase,
            highlightFrom: '2026-05-01',
            highlightTo: '2026-05-01',
        }));
        expect(r.isError).toBe(false);
        expect(posts[0]).toMatchObject({ highlightFrom: '2026-05-01', highlightTo: '2026-05-01' });
    });

    it('both valid → POST carries both; none → POST without them', async () => {
        stubFetch();
        await TOOL_HANDLERS.present_action({
            ...compareBase,
            highlightFrom: '2026-01-01',
            highlightTo: '2026-03-01',
        });
        expect(posts[0]).toMatchObject({ highlightFrom: '2026-01-01', highlightTo: '2026-03-01' });

        posts = [];
        stubFetch();
        await TOOL_HANDLERS.present_action(compareBase);
        expect(posts[0]).not.toHaveProperty('highlightFrom');
        expect(posts[0]).not.toHaveProperty('highlightTo');
    });
});

describe('polish 3 — present_send trim and length', () => {
    it('empty, whitespace-only → invalid, no fetch', async () => {
        stubFetch();
        const fetchFn = fetch as ReturnType<typeof vi.fn>;
        for (const text of ['', '   ', '\n\t']) {
            const r = parse(await TOOL_HANDLERS.present_send({ text, wait_for_ack: false }));
            expect(r.isError, text).toBe(true);
            expect(r.body.error).toBe('invalid_arguments');
        }
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('padded 198-char core → POST trimmed text', async () => {
        stubFetch();
        const core = 'x'.repeat(198);
        const r = parse(await TOOL_HANDLERS.present_send({ text: '     ' + core, wait_for_ack: false }));
        expect(r.isError).toBe(false);
        expect(posts.length).toBe(1);
        expect(posts[0]).toMatchObject({ action: 'send', text: core });
    });

    it('201 non-space chars → invalid', async () => {
        stubFetch();
        const r = parse(await TOOL_HANDLERS.present_send({ text: 'y'.repeat(201), wait_for_ack: false }));
        expect(r.isError).toBe(true);
        expect(posts.length).toBe(0);
    });

    it('100 astral emoji (200 UTF-16 units) valid; 101 invalid', async () => {
        stubFetch();
        const ok = parse(await TOOL_HANDLERS.present_send({ text: '😀'.repeat(100), wait_for_ack: false }));
        expect(ok.isError).toBe(false);
        expect(posts.length).toBe(1);

        posts = [];
        stubFetch();
        const bad = parse(await TOOL_HANDLERS.present_send({ text: '😀'.repeat(101), wait_for_ack: false }));
        expect(bad.isError).toBe(true);
        expect(posts.length).toBe(0);
    });
});

describe('polish 4 — unknown keys on present_action', () => {
    it('rejects typos on view, highlight, compare, page without fetch', async () => {
        stubFetch();
        const fetchFn = fetch as ReturnType<typeof vi.fn>;
        const cases = [
            { action: 'view', view: 'index', waitForAck: false },
            { action: 'highlight', symbol: '^HSI', extra: true },
            { action: 'compare', symbols: ['^HSI', 'QQQ'], typo: 1 },
            { action: 'page', direction: 'next', wait_for_ack: true },
        ] as const;
        for (const args of cases) {
            const r = parse(await TOOL_HANDLERS.present_action({ ...args, wait_for_ack: false } as Record<string, unknown>));
            expect(r.isError, JSON.stringify(args)).toBe(true);
            expect(r.body.error).toBe('invalid_arguments');
        }
        expect(fetchFn).not.toHaveBeenCalled();
    });
});

describe('polish 5 — ack description matches waitForCommandAck defaults', () => {
    it('no tool description contains 8×1.5', () => {
        for (const def of TOOL_DEFINITIONS) {
            expect(def.description).not.toMatch(/8×1\.5/);
        }
    });

    it('no present_action arm wait_for_ack description mentions Page', () => {
        type Branch = { properties?: Record<string, { description?: string }> };
        for (const branch of presentActionInputSchema.oneOf as unknown as Branch[]) {
            const desc = branch.properties?.wait_for_ack?.description ?? '';
            expect(desc).not.toMatch(/Page/);
        }
    });

    it('present_send description uses ACK_MAX_ATTEMPTS GETs max and computed wall time', () => {
        const sendDef = TOOL_DEFINITIONS.find(d => d.name === 'present_send');
        expect(sendDef).toBeDefined();
        const desc = sendDef!.description;
        expect(desc).toContain(`${ACK_MAX_ATTEMPTS} GETs max`);
        expect(desc).toContain(`≈ ${ackPollWallSeconds()} s wall`);
    });
});

describe('polish 6 — page turns not acknowledged', () => {
    it('page result has note and no acknowledged', async () => {
        stubFetch({
            post: { success: true, command: { v: 1, id: 'p1', kind: 'page', symbols: [], issuedAt: 1 } },
        });
        const r = parse(await TOOL_HANDLERS.present_action({ action: 'page', direction: 'next' }));
        expect(r.isError).toBe(false);
        expect(typeof r.body.note).toBe('string');
        expect(String(r.body.note)).toMatch(/15 s/);
        expect(r.body).not.toHaveProperty('acknowledged');
    });

    it('present_status notes exclude page turns from applied.id polling', async () => {
        stubFetch();
        const r = parse(await TOOL_HANDLERS.present_status({}));
        const notes = r.body.notes as string[];
        expect(notes.some(n => /not page turns/i.test(n))).toBe(true);
        expect(notes.some(n => /applied\.id/.test(n) && /page/i.test(n))).toBe(true);
    });
});
