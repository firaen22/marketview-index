import type { CatalogItem, PresentLang } from './types.js';

interface MarketRow {
    symbol?: string;
    name?: string;
    nameEn?: string;
}

interface MacroRow {
    symbol?: string;
    name?: string;
    nameEn?: string;
}

let catalogCache: { key: string; at: number; catalog: CatalogItem[] } | null = null;
const CATALOG_TTL_MS = 5 * 60_000;

export async function fetchCommandCatalog(
    origin: string,
    lang: PresentLang,
    fetchImpl: typeof fetch = fetch,
): Promise<CatalogItem[]> {
    const key = `${origin}|${lang}`;
    if (catalogCache && catalogCache.key === key && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
        return catalogCache.catalog;
    }
    const [marketRes, macroRes] = await Promise.all([
        fetchImpl(`${origin}/api/market-data?range=YTD`),
        fetchImpl(`${origin}/api/macro-data?lang=${encodeURIComponent(lang)}`),
    ]);
    const marketJson = await marketRes.json().catch(() => ({})) as { data?: MarketRow[] };
    const macroJson = await macroRes.json().catch(() => ({})) as { data?: MacroRow[] };
    const marketRows = Array.isArray(marketJson.data) ? marketJson.data : [];
    const macroRows = Array.isArray(macroJson.data) ? macroJson.data : [];

    const catalog: CatalogItem[] = [];
    for (const row of marketRows) {
        if (!row.symbol || !row.name) continue;
        catalog.push({
            symbol: row.symbol,
            name: row.name,
            ...(row.nameEn ? { nameEn: row.nameEn } : {}),
            group: 'market',
        });
    }
    for (const row of macroRows) {
        if (!row.symbol || !row.name) continue;
        catalog.push({
            symbol: row.symbol,
            name: row.name,
            ...(row.nameEn ? { nameEn: row.nameEn } : {}),
            group: 'macro',
        });
    }
    if (catalog.length < 1 || catalog.length > 120) {
        throw new Error(`catalog_unusable: ${catalog.length} items (need 1–120)`);
    }
    catalogCache = { key, at: Date.now(), catalog };
    return catalog;
}

/** Test hook */
export function clearCatalogCache(): void {
    catalogCache = null;
}
