import type { CatalogItem, PresentLang } from './types.js';
import { PresentApiError } from './types.js';
import { requestJson } from './presentClient.js';

interface MarketRow {
    symbol?: string;
    name?: string;
    nameEn?: string | null;
}

interface MacroRow {
    symbol?: string;
    name?: string;
    nameEn?: string | null;
}

/** Keyed by `origin|lang` so a refresh for one lang never evicts another's stale fallback. */
const catalogCache = new Map<string, { at: number; catalog: CatalogItem[] }>();
const inflight = new Map<string, Promise<CatalogItem[]>>();
const CATALOG_TTL_MS = 5 * 60_000;
/** Serve a stale catalog (instead of failing the command) for up to 1 h if refresh fails. */
const CATALOG_STALE_MAX_MS = 60 * 60_000;
export const CATALOG_TIMEOUT_MS = 8_000;

async function getRows(fetchImpl: typeof fetch, url: string, label: string): Promise<Array<MarketRow | MacroRow>> {
    const { response, payload } = await requestJson(fetchImpl, url, {}, CATALOG_TIMEOUT_MS, label);
    if (!response.ok) throw new PresentApiError(response.status, `${label}_http_${response.status}`);
    const data = (payload as { data?: Array<MarketRow | MacroRow> }).data;
    if (!Array.isArray(data)) throw new PresentApiError(502, `${label}_malformed`);
    return data;
}

async function buildCatalog(origin: string, lang: PresentLang, fetchImpl: typeof fetch): Promise<CatalogItem[]> {
    const [marketRows, macroRows] = await Promise.all([
        getRows(fetchImpl, `${origin}/api/market-data?range=YTD`, 'catalog_market'),
        getRows(fetchImpl, `${origin}/api/macro-data?lang=${encodeURIComponent(lang)}`, 'catalog_macro'),
    ]);

    const catalog: CatalogItem[] = [];
    for (const [rows, group] of [[marketRows, 'market'], [macroRows, 'macro']] as const) {
        for (const row of rows) {
            if (
                !row
                || typeof row !== 'object'
                || Array.isArray(row)
                || typeof row.symbol !== 'string'
                || row.symbol.length < 1
                || row.symbol.length > 24
                || typeof row.name !== 'string'
                || row.name.length < 1
                || row.name.length > 80
                || ('nameEn' in row && row.nameEn !== null && row.nameEn !== undefined && typeof row.nameEn !== 'string')
                || (typeof row.nameEn === 'string' && row.nameEn.length > 80)
            ) continue;
            catalog.push({
                symbol: row.symbol,
                name: row.name,
                ...(row.nameEn ? { nameEn: row.nameEn } : {}),
                group,
            });
        }
    }
    if (catalog.length < 1 || catalog.length > 120) {
        throw new Error(`catalog_unusable: ${catalog.length} items (need 1–120)`);
    }
    return catalog;
}

export async function fetchCommandCatalog(
    origin: string,
    lang: PresentLang,
    fetchImpl: typeof fetch = fetch,
): Promise<CatalogItem[]> {
    const key = `${origin}|${lang}`;
    const cached = catalogCache.get(key);
    if (cached && Date.now() - cached.at < CATALOG_TTL_MS) {
        return cached.catalog;
    }
    let pending = inflight.get(key);
    if (!pending) {
        pending = buildCatalog(origin, lang, fetchImpl)
            .then(catalog => {
                catalogCache.set(key, { at: Date.now(), catalog });
                return catalog;
            })
            .finally(() => inflight.delete(key));
        inflight.set(key, pending);
    }
    try {
        return await pending;
    } catch (error) {
        if (cached && Date.now() - cached.at < CATALOG_STALE_MAX_MS) return cached.catalog;
        throw error;
    }
}

/** Test hook */
export function clearCatalogCache(): void {
    catalogCache.clear();
    inflight.clear();
}
