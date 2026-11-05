import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './createServer.js';
import { clearCatalogCache, fetchCommandCatalog } from './catalog.js';
import { requestJson } from './presentClient.js';

const ORIGIN = 'https://mv.test';

type Call = { url: string; method: string; body: Record<string, unknown> | null; headers: Record<string, string>; at: number };

function statusBody(extra: Record<string, unknown> = {}) {
    return {
        success: true, command: null, serverTime: 1,
        projector: { mode: 'index', page: 1, v: 1, at: 1 }, projectorLast: null, applied: null,
        control: { mode: 'slide', at: 5 }, pageCommands: [],
        ...extra,
    };
}

const CATALOG_MARKET = { data: [{ symbol: '^HSI', name: 'Hang Seng' }, { symbol: 'QQQ', name: 'Nasdaq 100' }] };
const CATALOG_MACRO = { data: [{ symbol: 'US10Y', name: 'US 10Y' }] };

function installFetch(route: (call: Call, calls: Call[]) => Response | Promise<Response>) {
    const calls: Call[] = [];
    const t0 = Date.now();
    const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const call: Call = {
            url,
            method: init?.method ?? 'GET',
            body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
            headers: (init?.headers ?? {}) as Record<string, string>,
            at: Date.now() - t0,
        };
        calls.push(call);
        if (url.includes('/api/market-data')) return Response.json(CATALOG_MARKET);
        if (url.includes('/api/macro-data')) return Response.json(CATALOG_MACRO);
        return route(call, calls);
    });
    vi.stubGlobal('fetch', fn);
    return calls;
}

async function connect() {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(serverT);
    const client = new Client({ name: 'wiring-test', version: '0' });
    await client.connect(clientT);
    return client;
}

function parse(result: Awaited<ReturnType<Client['callTool']>>) {
    const content = result.content as { type: string; text: string }[];
    return JSON.parse(content[0].text);
}

beforeEach(() => {
    process.env.MARKETVIEW_ORIGIN = ORIGIN;
    process.env.PRESENT_API_KEY = 'test-key';
    clearCatalogCache();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete process.env.MARKETVIEW_ORIGIN;
    delete process.env.PRESENT_API_KEY;
});

describe('MCP wiring (real Client ↔ Server)', () => {
    it('lists all five tools', async () => {
        const client = await connect();
        const { tools } = await client.listTools();
        expect(tools.map(t => t.name).sort()).toEqual(
            ['present_action', 'present_assist', 'present_send', 'present_slide', 'present_status'],
        );
    });

    it('present_status passes control through, no key header', async () => {
        delete process.env.PRESENT_API_KEY;
        const calls = installFetch(() => Response.json(statusBody()));
        const out = parse(await (await connect()).callTool({ name: 'present_status', arguments: {} }));
        expect(out.control).toEqual({ mode: 'slide', at: 5 });
        expect(out.projectorLive).toBe(true);
        expect(calls[0].headers['x-api-key']).toBeUndefined();
    });

    it('present_send: catalog → POST send → ack via applied.id', async () => {
        const calls = installFetch((call) => {
            if (call.method === 'POST') return Response.json({ success: true, command: { v: 1, id: 'c1', kind: 'chart', symbols: ['QQQ'], issuedAt: 1 } });
            return Response.json(statusBody({ applied: { id: 'c1', kind: 'chart', at: 2 } }));
        });
        const out = parse(await (await connect()).callTool({ name: 'present_send', arguments: { text: 'show NDX' } }));
        expect(out.acknowledged).toBe(true);
        expect(out.ackAttempts).toBe(1);
        const post = calls.find(c => c.method === 'POST')!;
        expect(post.body).toMatchObject({ action: 'send', text: 'show NDX', lang: 'en' });
        expect((post.body!.catalog as unknown[]).length).toBe(3);
        expect(post.headers['x-api-key']).toBe('test-key');
        // First ack GET is delayed (projector cannot have acked at t=0).
        const firstGet = calls.find(c => c.url.endsWith('/api/present-command') && c.method === 'GET')!;
        expect(firstGet.at - post.at).toBeGreaterThanOrEqual(650);
    });

    it('present_action category posts structured body; page skips ack GETs', async () => {
        const calls = installFetch((call) => {
            if (call.method === 'POST') {
                const kind = call.body!.action === 'page' ? 'page' : 'category';
                return Response.json({ success: true, command: { v: 1, id: 'k1', kind, symbols: [], issuedAt: 1 } });
            }
            return Response.json(statusBody({ projector: { mode: 'index', page: 1, v: 1, at: 1, lid: 'k1' } }));
        });
        const client = await connect();
        const cat = parse(await client.callTool({ name: 'present_action', arguments: { action: 'category', category: 'US' } }));
        expect(cat.acknowledged).toBe(true);
        expect(calls.find(c => c.method === 'POST')!.body).toEqual({ action: 'category', category: 'US' });
        const before = calls.length;
        const page = parse(await client.callTool({ name: 'present_action', arguments: { action: 'page', direction: 'next' } }));
        expect(page.acknowledged).toBeUndefined();
        expect(calls.slice(before).map(c => c.method)).toEqual(['POST']);
    });

    it('ack 429 after a successful POST is NOT a tool error', async () => {
        installFetch((call) => {
            if (call.method === 'POST') return Response.json({ success: true, command: { v: 1, id: 'v1', kind: 'view', symbols: [], issuedAt: 1 } });
            return Response.json({ error: 'rate_limited' }, { status: 429 });
        });
        const result = await (await connect()).callTool({ name: 'present_action', arguments: { action: 'view', view: 'index' } });
        expect(result.isError).not.toBe(true);
        const out = parse(result);
        expect(out.command.id).toBe('v1');
        expect(out.acknowledged).toBe(false);
        expect(out.ackError).toMatch(/rate_limited.*WAS posted/);
    });

    it('present_assist text + vision send the API body shapes', async () => {
        const calls = installFetch(() => Response.json({ success: true, assist: { points: ['p'], questions: [] } }));
        const client = await connect();
        const text = 'x'.repeat(45);
        const t = parse(await client.callTool({ name: 'present_assist', arguments: { text } }));
        expect(t.assist.points).toEqual(['p']);
        expect(calls[0].body).toEqual({ action: 'assist', text, lang: 'en' });
        const img = 'A'.repeat(200);
        await client.callTool({ name: 'present_assist', arguments: { imageBase64: img, slideId: '1730000000000#3', deckKey: 'deck', lang: 'zh-TW' } });
        expect(calls[1].body).toEqual({ action: 'assist', imageBase64: img, slideId: '1730000000000#3', deckKey: 'deck', lang: 'zh-TW' });
    });

    it('present_assist rejects short text, mixed modes, and missing key — no fetch', async () => {
        const calls = installFetch(() => Response.json({}));
        const client = await connect();
        expect((await client.callTool({ name: 'present_assist', arguments: { text: 'too short' } })).isError).toBe(true);
        expect((await client.callTool({ name: 'present_assist', arguments: { text: 'x'.repeat(45), imageBase64: 'A'.repeat(200) } })).isError).toBe(true);
        delete process.env.PRESENT_API_KEY;
        expect((await client.callTool({ name: 'present_assist', arguments: { text: 'x'.repeat(45) } })).isError).toBe(true);
        expect(calls).toHaveLength(0);
    });

    it('present_slide get (no key) and save (key, updatedAt default now)', async () => {
        delete process.env.PRESENT_API_KEY;
        const calls = installFetch((call) => call.method === 'GET'
            ? Response.json({ success: true, slide: { mode: 'markdown', content: '# hi', updatedAt: 9 } })
            : Response.json({ success: true, slide: { ...call.body, updatedAt: call.body!.updatedAt } }));
        const client = await connect();
        const got = parse(await client.callTool({ name: 'present_slide', arguments: { op: 'get' } }));
        expect(got.slide).toMatchObject({ mode: 'markdown', content: '# hi', contentLength: 4 });
        expect((await client.callTool({ name: 'present_slide', arguments: { op: 'save', mode: 'markdown', content: 'x' } })).isError).toBe(true);
        process.env.PRESENT_API_KEY = 'test-key';
        const before = Date.now();
        const saved = parse(await client.callTool({ name: 'present_slide', arguments: { op: 'save', mode: 'html', content: '<b>x</b>' } }));
        const post = calls.find(c => c.method === 'POST')!;
        expect(post.url).toBe(`${ORIGIN}/api/present-slide`);
        expect(post.body!.updatedAt as number).toBeGreaterThanOrEqual(before);
        expect(saved.saved).toMatchObject({ mode: 'html', contentLength: 8 });
    });

    it('present_slide rejects >256 KiB content and bad mode', async () => {
        const calls = installFetch(() => Response.json({}));
        const client = await connect();
        const big = 'é'.repeat(140 * 1024); // 280 KiB UTF-8, 140 Ki chars
        expect((await client.callTool({ name: 'present_slide', arguments: { op: 'save', mode: 'markdown', content: big } })).isError).toBe(true);
        expect((await client.callTool({ name: 'present_slide', arguments: { op: 'save', mode: 'pptx', content: 'x' } })).isError).toBe(true);
        expect(calls).toHaveLength(0);
    });

    it('unknown and prototype tool names are rejected', async () => {
        const client = await connect();
        for (const name of ['nope', 'constructor', '__proto__', 'toString']) {
            const r = await client.callTool({ name, arguments: {} });
            expect(r.isError, name).toBe(true);
        }
    });
});

describe('responsiveness guards', () => {
    it('requestJson aborts a hung request', async () => {
        const hung = ((_u: string, init?: RequestInit) => new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })) as unknown as typeof fetch;
        const t = Date.now();
        await expect(requestJson(hung, 'https://x', {}, 60, 'probe')).rejects.toMatchObject({ status: 504, message: /probe_timeout/ });
        expect(Date.now() - t).toBeLessThan(1000);
    });

    it('present_status on a hung upstream returns an error within ~5 s', async () => {
        vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) => new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })));
        const t = Date.now();
        const r = await (await connect()).callTool({ name: 'present_status', arguments: {} });
        expect(r.isError).toBe(true);
        expect(parse(r).error).toMatch(/status_timeout/);
        expect(Date.now() - t).toBeLessThan(6500);
    }, 10_000);

    it('catalog serves stale copy when refresh fails, dedupes concurrent fetches', async () => {
        let marketHits = 0;
        let fail = false;
        vi.stubGlobal('fetch', vi.fn(async (u: string) => {
            if (u.includes('market-data')) {
                marketHits += 1;
                if (fail) return new Response('{}', { status: 500 });
                return Response.json(CATALOG_MARKET);
            }
            return Response.json(CATALOG_MACRO);
        }));
        const [a, b] = await Promise.all([fetchCommandCatalog(ORIGIN, 'en'), fetchCommandCatalog(ORIGIN, 'en')]);
        expect(a).toBe(b);
        expect(marketHits).toBe(1);
        fail = true;
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.now() + 6 * 60_000); // past 5 min TTL, inside 1 h stale window
        const stale = await fetchCommandCatalog(ORIGIN, 'en');
        expect(stale).toBe(a);
        expect(marketHits).toBe(2);
        vi.setSystemTime(Date.now() + 2 * 60 * 60_000); // beyond stale window
        await expect(fetchCommandCatalog(ORIGIN, 'en')).rejects.toMatchObject({ status: 500 });
    });

    it('stale catalog is kept per origin|lang (another lang refresh does not evict it)', async () => {
        let fail = false;
        vi.stubGlobal('fetch', vi.fn(async (u: string) => {
            if (u.includes('market-data') && fail) return new Response('{}', { status: 500 });
            return Response.json(u.includes('market-data') ? CATALOG_MARKET : CATALOG_MACRO);
        }));
        const en = await fetchCommandCatalog(ORIGIN, 'en');
        await fetchCommandCatalog(ORIGIN, 'zh-TW');
        fail = true;
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.now() + 6 * 60_000);
        await expect(fetchCommandCatalog(ORIGIN, 'en')).resolves.toBe(en);
    });
});
