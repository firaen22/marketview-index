import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCatalogCache, fetchCommandCatalog } from './catalog.js';
import { loadConfig, loadConfigForStatus } from './config.js';
import {
    fetchPresentSlide,
    fetchPresentStatus,
    isCommandAcked,
    postPresentCommand,
    savePresentSlide,
} from './presentClient.js';

const ORIGIN = 'https://example.test';
const commandBody = { action: 'view' };
const statusBody = { success: true, command: null, serverTime: 1, projector: null, projectorLast: null, applied: null };
const validSlide = { mode: 'html' as const, content: '<p>ok</p>', updatedAt: 1 };

function fetchJson(body: unknown, status = 200): typeof fetch {
    return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

afterEach(() => {
    clearCatalogCache();
    vi.useRealTimers();
});

describe('HTTP and catalog boundary hardening', () => {
    it('rejects command acknowledgements without a non-empty string id', async () => {
        for (const command of [{}, [], { id: '' }, { id: 7 }]) {
            await expect(postPresentCommand(ORIGIN, 'k', commandBody, fetchJson({ command })))
                .rejects.toMatchObject({ status: 502, message: 'malformed_command' });
        }
        expect(isCommandAcked({ ...statusBody, applied: { id: '' } } as never, '')).toBe(false);
        expect(isCommandAcked(statusBody as never, '')).toBe(false);
    });

    it('rejects malformed projector status while accepting projector null', async () => {
        for (const body of [{}, [], { projector: 'yes' }, { projector: [] }]) {
            await expect(fetchPresentStatus(ORIGIN, fetchJson(body)))
                .rejects.toMatchObject({ status: 502, message: 'status_malformed_json' });
        }
        await expect(fetchPresentStatus(ORIGIN, fetchJson({ ...statusBody, projector: null }))).resolves.toMatchObject({
            projector: null,
        });
    });

    it('rejects a malformed catalog envelope and serves a stale cached catalog', async () => {
        const malformed = vi.fn(async (url: string) => new Response(
            JSON.stringify(url.includes('market-data') ? {} : { data: [{ symbol: 'US10Y', name: 'US 10Y' }] }),
        )) as unknown as typeof fetch;
        await expect(fetchCommandCatalog(ORIGIN, 'en', malformed)).rejects.toMatchObject({
            status: 502,
            message: 'catalog_market_malformed',
        });

        const valid = vi.fn(async (url: string) => new Response(JSON.stringify(
            url.includes('market-data')
                ? { data: [{ symbol: 'HSI', name: 'Hang Seng' }] }
                : { data: [{ symbol: 'US10Y', name: 'US 10Y' }] },
        ))) as unknown as typeof fetch;
        const cached = await fetchCommandCatalog(ORIGIN, 'en', valid);
        vi.setSystemTime(Date.now() + 5 * 60_000 + 1);
        const staleFetch = vi.fn(async (url: string) => new Response(JSON.stringify(
            url.includes('market-data') ? {} : { data: [{ symbol: 'US10Y', name: 'US 10Y' }] },
        ))) as unknown as typeof fetch;
        await expect(fetchCommandCatalog(ORIGIN, 'en', staleFetch)).resolves.toBe(cached);

        clearCatalogCache();
        const emptyMarket = vi.fn(async (url: string) => new Response(JSON.stringify(
            url.includes('market-data') ? { data: [] } : { data: [{ symbol: 'US10Y', name: 'US 10Y' }] },
        ))) as unknown as typeof fetch;
        await expect(fetchCommandCatalog(ORIGIN, 'en', emptyMarket)).resolves.toHaveLength(1);
    });

    it('filters catalog rows using server length and type bounds', async () => {
        const rows = [
            null, [], 'x',
            { symbol: '', name: 'empty symbol' },
            { symbol: 'A'.repeat(25), name: 'too long symbol' },
            { symbol: 'B'.repeat(24), name: 'kept' },
            { symbol: 'C', name: 'N'.repeat(81) },
            { symbol: 'D', name: 'bad nameEn', nameEn: 1 },
            { symbol: 'E', name: 'long nameEn', nameEn: 'N'.repeat(81) },
            { symbol: 'F', name: 'empty nameEn', nameEn: '' },
            { symbol: 'I', name: 'null nameEn', nameEn: null },
            { symbol: 'G', name: '😀'.repeat(40) },
            { symbol: 'H', name: '😀'.repeat(41) },
        ];
        const fetchImpl = vi.fn(async (url: string) => new Response(JSON.stringify({
            data: url.includes('market-data') ? rows : [{ symbol: 'M', name: 'Macro' }],
        }))) as unknown as typeof fetch;
        const catalog = await fetchCommandCatalog(ORIGIN, 'en', fetchImpl);
        expect(catalog.map(item => item.symbol)).toEqual(['BBBBBBBBBBBBBBBBBBBBBBBB', 'F', 'I', 'G', 'M']);
        expect(catalog.find(item => item.symbol === 'F')).not.toHaveProperty('nameEn');
        expect(catalog.find(item => item.symbol === 'I')).not.toHaveProperty('nameEn');
    });

    it('validates slide shape on get and save', async () => {
        await expect(fetchPresentSlide(ORIGIN, fetchJson({ slide: null }))).resolves.toBeNull();
        for (const slide of [
            { mode: 'markdown', updatedAt: 1 },
            { mode: 'markdown', content: 1, updatedAt: 1 },
            [],
        ]) {
            await expect(fetchPresentSlide(ORIGIN, fetchJson({ slide })))
                .rejects.toMatchObject({ status: 502, message: 'malformed_slide' });
        }
        await expect(savePresentSlide(ORIGIN, 'k', validSlide, fetchJson({ slide: { mode: 'html', updatedAt: 1 } })))
            .rejects.toMatchObject({ status: 502, message: 'malformed_slide' });
        await expect(savePresentSlide(ORIGIN, 'k', validSlide, fetchJson({ slide: [] })))
            .rejects.toMatchObject({ status: 502, message: 'malformed_slide' });
    });

    it('validates mode and updatedAt independently when slide content is valid', async () => {
        const malformedSlides = [
            { content: 'ok', updatedAt: 1 },
            { content: 'ok', mode: 7, updatedAt: 1 },
            { content: 'ok', mode: 'html' },
            { content: 'ok', mode: 'html', updatedAt: null },
            { content: 'ok', mode: 'html', updatedAt: '1' },
        ];

        for (const slide of malformedSlides) {
            await expect(fetchPresentSlide(ORIGIN, fetchJson({ slide })))
                .rejects.toMatchObject({ status: 502, message: 'malformed_slide' });
            await expect(savePresentSlide(ORIGIN, 'k', validSlide, fetchJson({ slide })))
                .rejects.toMatchObject({ status: 502, message: 'malformed_slide' });
        }

        const control = { content: 'ok', mode: 'html', updatedAt: 1 };
        await expect(fetchPresentSlide(ORIGIN, fetchJson({ slide: control }))).resolves.toEqual(control);
        await expect(savePresentSlide(ORIGIN, 'k', validSlide, fetchJson({ slide: control }))).resolves.toEqual(control);
    });

    it('rejects a slide GET body without a slide key', async () => {
        await expect(fetchPresentSlide(ORIGIN, fetchJson({})))
            .rejects.toMatchObject({ status: 502, message: 'malformed_slide' });
    });

    it('rejects a non-object slide GET body', async () => {
        await expect(fetchPresentSlide(ORIGIN, fetchJson([])))
            .rejects.toMatchObject({ status: 502, message: 'malformed_slide' });
    });

    it('normalizes blank origins and API keys', () => {
        const defaultOrigin = loadConfigForStatus({}).origin;
        for (const value of ['', '   ', '/']) {
            expect(loadConfigForStatus({ MARKETVIEW_ORIGIN: value }).origin).toBe(defaultOrigin);
        }
        expect(loadConfigForStatus({ MARKETVIEW_ORIGIN: ' https://a.test/ ' }).origin).toBe('https://a.test');
        expect(loadConfigForStatus({}).origin).toBe(defaultOrigin);
        for (const key of ['', '   ']) {
            expect(() => loadConfig({ PRESENT_API_KEY: key })).toThrow('PRESENT_API_KEY is required');
        }
        expect(loadConfig({ PRESENT_API_KEY: ' k ' }).apiKey).toBe('k');
    });
});
