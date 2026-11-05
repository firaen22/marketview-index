import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOL_DEFINITIONS, TOOL_HANDLERS } from './tools.js';
import { STATUS_TIMEOUT_MS } from './presentClient.js';

/** Response whose headers arrive (200) but whose body never finishes until aborted. */
function stalledBody(signal?: AbortSignal | null): Response {
    const stream = new ReadableStream({
        start(controller) {
            signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
        },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => { process.env.MARKETVIEW_ORIGIN = 'https://mv.test'; process.env.PRESENT_API_KEY = 'k'; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.MARKETVIEW_ORIGIN; delete process.env.PRESENT_API_KEY; });

describe('gate r1 F1 — body stall after headers', () => {
    it('present_status reports a timeout error, not a fake live projector', async () => {
        vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => stalledBody(init?.signal)));
        const r = await TOOL_HANDLERS.present_status({});
        expect(r.isError, r.content[0].text).toBe(true);
        expect(JSON.parse(r.content[0].text).error).toMatch(/status_timeout/);
    }, STATUS_TIMEOUT_MS + 3000);

    it('present_slide get reports a timeout error, not slide:null', async () => {
        vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => stalledBody(init?.signal)));
        const r = await TOOL_HANDLERS.present_slide({ op: 'get' });
        expect(r.isError, r.content[0].text).toBe(true);
        expect(JSON.parse(r.content[0].text).error).toMatch(/slide_get_timeout/);
    }, 20_000);
});

describe('malformed 2xx body', () => {
    it('present_status on 200 HTML is an error, not projectorLive:true', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Vercel</html>', { status: 200 })));
        const r = await TOOL_HANDLERS.present_status({});
        expect(r.isError).toBe(true);
        expect(JSON.parse(r.content[0].text).error).toBe('status_malformed_json');
    });
    it('non-2xx with non-JSON body still surfaces the HTTP status', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad Gateway', { status: 502 })));
        const r = await TOOL_HANDLERS.present_status({});
        expect(JSON.parse(r.content[0].text).status).toBe(502);
    });
});

describe('gate r1 F2 — assist length uses production normalization', () => {
    it('rejects text that only reaches 40 chars via internal whitespace (no fetch)', async () => {
        const fetchFn = vi.fn(async () => Response.json({ success: true, assist: { points: ['p'], questions: [] } }));
        vi.stubGlobal('fetch', fetchFn);
        const r = await TOOL_HANDLERS.present_assist({ text: 'a' + ' '.repeat(40) + 'b' });
        expect(r.isError).toBe(true);
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it('accepts >6000 raw chars that normalize to ≤6000', async () => {
        const fetchFn = vi.fn(async () => Response.json({ success: true, assist: { points: ['p'], questions: [] } }));
        vi.stubGlobal('fetch', fetchFn);
        const text = ('word' + ' '.repeat(5)).repeat(700); // 6300 raw, ~3500 normalized
        const r = await TOOL_HANDLERS.present_assist({ text });
        expect(r.isError, r.content[0].text).not.toBe(true);
        expect(fetchFn).toHaveBeenCalledTimes(1);
    });
});

describe('gate r1 F3 — advertised JSON Schema matches handler limits', () => {
    const def = (n: string) => TOOL_DEFINITIONS.find(d => d.name === n)!.inputSchema as any;
    it('vision imageBase64 advertises the base64 pattern', () => {
        const img = def('present_assist').oneOf[1].properties.imageBase64;
        expect(new RegExp(img.pattern).test('!'.repeat(100))).toBe(false);
        expect(new RegExp(img.pattern).test('QUJD')).toBe(true);
    });
    it('slide content advertises a max length bound', () => {
        expect(def('present_slide').oneOf[1].properties.content.maxLength).toBe(256 * 1024);
    });
    it('assist text does not advertise a raw maxLength the server would accept beyond', () => {
        expect(def('present_assist').oneOf[0].properties.text.maxLength).toBeUndefined();
    });
    it('r2 F1: image pattern enforces multiple-of-4 like zod (100 ok, 101 rejected)', () => {
        const re = new RegExp(def('present_assist').oneOf[1].properties.imageBase64.pattern);
        for (const [v, ok] of [['A'.repeat(100), true], ['A'.repeat(101), false], ['AAAAAA==', true], ['AAAAAAA=', true], ['AAAAA===', false], ['AA=A', false]] as const) {
            expect(re.test(v), v).toBe(ok);
        }
    });
    it('r2 F2: assist text advertises no code-point minLength; 20 emoji (UTF-16 length 40) reach the server', async () => {
        expect(def('present_assist').oneOf[0].properties.text.minLength).toBeUndefined();
        const fetchFn = vi.fn(async () => Response.json({ success: true, assist: { points: ['p'], questions: [] } }));
        vi.stubGlobal('fetch', fetchFn);
        const r = await TOOL_HANDLERS.present_assist({ text: '😀'.repeat(20) });
        expect(r.isError, r.content[0].text).not.toBe(true);
    });
});

