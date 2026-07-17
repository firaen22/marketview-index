export type PresentCommandKind = 'chart' | 'compare' | 'quote' | 'view' | 'clear' | 'page' | 'goto' | 'jargon' | 'cycle' | 'range' | 'explain' | 'highlight';
export type PresentView = 'slide' | 'index' | 'heatmap';
export type PageDirection = 'next' | 'prev';
export type PresentRange = '1M' | '3M' | 'YTD' | '1Y';

export const PRESENT_RANGES = ['1M', '3M', 'YTD', '1Y'] as const;
export const CYCLE_DWELL_PRESETS = [15, 30, 45, 60, 120] as const;
export const MAX_GOTO_PAGE = 999;

export interface PresentCommand {
    v: 1;
    id: string;
    kind: PresentCommandKind;
    symbols: string[];
    view?: PresentView;
    direction?: PageDirection;
    page?: number | 'first' | 'last';
    on?: boolean;
    dwellSec?: number;
    range?: PresentRange;
    term?: string;
    issuedAt: number;
}

export interface CatalogItem {
    symbol: string;
    name: string;
    nameEn?: string;
    group: 'market' | 'macro';
}

export type PresentIntent =
    | { kind: 'chart'; symbols: string[]; range?: PresentRange }
    | { kind: 'compare'; symbols: string[]; range?: PresentRange }
    | { kind: 'quote'; symbols: string[] }
    | { kind: 'view'; symbols: []; view: PresentView }
    | { kind: 'clear'; symbols: [] }
    | { kind: 'goto'; symbols: []; page: number | 'first' | 'last' }
    | { kind: 'jargon'; symbols: []; on: boolean }
    | { kind: 'cycle'; symbols: []; on: boolean; dwellSec?: number }
    | { kind: 'range'; symbols: []; range: PresentRange }
    | { kind: 'explain'; symbols: []; term: string }
    | { kind: 'highlight'; symbols: string[] };

const KINDS = ['chart', 'compare', 'quote', 'view', 'clear', 'page', 'goto', 'jargon', 'cycle', 'range', 'explain', 'highlight'] as const;
const VIEWS = ['slide', 'index', 'heatmap'] as const;
const CLEAR_WORDS = new Set(['clear', 'close', 'back', 'slides', 'slide', '返回', '清除', '關閉', '投影片']);
const HEATMAP_WORDS = new Set(['heatmap', '熱圖', '熱力圖']);
const INDEX_WORDS = new Set(['dashboard', 'index', '指數', '大盤']);
const COMPARE_SPLIT = /\s*(?:vs\.?|對比|比較|,|，)\s*/i;
const LEADING_VERB = /^(?:show|display|open|看|顯示|睇)\s*/i;
const CYCLE_SUBJECT = String.raw`(?:auto[- ]?cycle|auto[- ]?play|auto|cycle|rotation|自動輪播|自動播|輪播|自動)`;
const MAX_COMPARE_SYMBOLS = 5;
const MAX_EXPLAIN_TERM_CODE_POINTS = 80;
const STALE_MS = 120_000;
// Page turns are relative: one arriving long after the tap flips the deck out
// of context, so drained page commands are only executed while still fresh.
export const PAGE_COMMAND_FRESH_MS = 15_000;

type RawIntent = {
    kind?: unknown;
    symbols?: unknown;
    view?: unknown;
    page?: unknown;
    on?: unknown;
    dwellSec?: unknown;
    range?: unknown;
    term?: unknown;
};

function isKind(value: unknown): value is PresentCommandKind {
    return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

function isView(value: unknown): value is PresentView {
    return typeof value === 'string' && (VIEWS as readonly string[]).includes(value);
}

function isPageDirection(value: unknown): value is PageDirection {
    return value === 'next' || value === 'prev';
}

function isPresentRange(value: unknown): value is PresentRange {
    return typeof value === 'string' && (PRESENT_RANGES as readonly string[]).includes(value);
}

function normalizeRange(value: unknown): PresentRange | null {
    if (typeof value !== 'string') return null;
    const upper = value.toUpperCase();
    return isPresentRange(upper) ? upper : null;
}

function normalizeText(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
}

function codePointLength(value: string): number {
    return [...value].length;
}

function withoutLeadingCaret(value: string): string {
    return value.startsWith('^') ? value.slice(1) : value;
}

function stripLeadingVerb(value: string): string {
    return normalizeText(value).replace(LEADING_VERB, '').trim();
}

function parsePageNumber(value: string): number | null {
    const page = Number.parseInt(value, 10);
    return Number.isInteger(page) && page >= 1 && page <= MAX_GOTO_PAGE ? page : null;
}

function chinesePageNumber(value: string): number | null {
    const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (/^[一二三四五六七八九]$/.test(value)) return digits[value];
    if (value === '十') return 10;
    const teen = /^十([一二三四五六七八九])$/.exec(value);
    if (teen) return 10 + digits[teen[1]];
    const tens = /^([二三四五六七八九])十$/.exec(value);
    if (tens) return digits[tens[1]] * 10;
    const compound = /^([二三四五六七八九])十([一二三四五六七八九])$/.exec(value);
    if (compound) return digits[compound[1]] * 10 + digits[compound[2]];
    return null;
}

function nearestDwellPreset(value: number): number {
    return CYCLE_DWELL_PRESETS.reduce((best, preset) => {
        const bestDistance = Math.abs(best - value);
        const nextDistance = Math.abs(preset - value);
        return nextDistance < bestDistance || (nextDistance === bestDistance && preset < best) ? preset : best;
    }, CYCLE_DWELL_PRESETS[0]);
}

function parsePolarity(value: string): boolean | null {
    if (/^(?:on|開|开|著|open)$/.test(value)) return true;
    if (/^(?:off|關|关|閂|熄|close)$/.test(value)) return false;
    return null;
}

const EXPLAIN_PREFIX_EN = /^(?:explain|define|what\s+is|what's|whats)\s+(.+)$/i;
const EXPLAIN_PREFIX_ZH = /^(?:解釋|解释|咩係|乜係|什麼是|甚麼是|点解是)\s*(.+)$/;
const EXPLAIN_SUFFIX_ZH = /^(.+?)\s*(?:係咩|係乜|是什麼|是甚麼)$/;
const HIGHLIGHT_PREFIX = /^(?:highlight|focus|spotlight|聚焦|標示|重點)\s+(.+)$/i;

function stripExplainPunctuation(value: string): string {
    let term = value.trim();
    for (let i = 0; i < 10 && /[?？。.]$/.test(term); i += 1) {
        term = term.slice(0, -1).trim();
    }
    return term;
}

function validExplainTerm(value: string): string | null {
    const term = stripExplainPunctuation(value);
    return term && codePointLength(term) <= MAX_EXPLAIN_TERM_CODE_POINTS ? term : null;
}

function parseExplainIntent(normalized: string): PresentIntent | null {
    const en = EXPLAIN_PREFIX_EN.exec(normalized);
    if (en) {
        const term = validExplainTerm(en[1]);
        return term ? { kind: 'explain', symbols: [], term } : null;
    }

    let zh = EXPLAIN_PREFIX_ZH.exec(normalized);
    if (zh) {
        let rest = zh[1].trim();
        const nested = EXPLAIN_PREFIX_ZH.exec(rest);
        if (nested) rest = nested[1].trim();
        const term = validExplainTerm(rest);
        return term ? { kind: 'explain', symbols: [], term } : null;
    }

    zh = EXPLAIN_SUFFIX_ZH.exec(normalized);
    if (zh) {
        const term = validExplainTerm(zh[1]);
        return term ? { kind: 'explain', symbols: [], term } : null;
    }
    return null;
}

const RANGE_TOKEN_ENTRIES: Array<[PresentRange, string[]]> = [
    ['1M', ['1m', '1 m', '1 month', '1個月', '一個月', '1个月']],
    ['3M', ['3m', '3 m', '3 months', '3個月', '三個月', '3个月']],
    ['YTD', ['ytd', '年初至今', '今年以來', '今年']],
    ['1Y', ['1y', '1 yr', '1 year', '1年', '一年']],
];

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function standaloneRange(lower: string): PresentRange | null {
    for (const [range, tokens] of RANGE_TOKEN_ENTRIES) {
        if (tokens.includes(lower)) return range;
    }
    return null;
}

function parseClosedFormIntent(normalized: string, lower: string, catalog: CatalogItem[]): PresentIntent | null {
    const highlight = HIGHLIGHT_PREFIX.exec(normalized);
    if (highlight) {
        const item = resolveCatalogItem(highlight[1], catalog);
        return item?.group === 'market' ? { kind: 'highlight', symbols: [item.symbol] } : null;
    }

    const explain = parseExplainIntent(normalized);
    if (explain) return explain;

    const bareInteger = /^\d{1,3}$/.exec(lower);
    if (bareInteger) {
        // 1-2 digit numbers are page jumps (decks are short). 3-digit numbers
        // are index shorthand first ("225" → Nikkei 225, "500" → S&P 500):
        // a unique catalog match wins; only unclaimed ones page-jump.
        if (bareInteger[0].length === 3 && resolveCatalogItem(normalized, catalog)) return null;
        const page = parsePageNumber(bareInteger[0]);
        return page ? { kind: 'goto', symbols: [], page } : null;
    }

    const gotoNumber = /^(?:go\s*to|turn\s*to|jump\s*to|去|跳到|翻到|轉到)?\s*(?:page|pg?|第)\s*(\d{1,3})\s*(?:頁|页)?$/.exec(lower);
    if (gotoNumber) {
        const page = parsePageNumber(gotoNumber[1]);
        return page ? { kind: 'goto', symbols: [], page } : null;
    }

    const gotoZh = /^(?:去|跳到|翻到|轉到)?\s*第\s*([一二三四五六七八九十]{1,3})\s*[頁页]?$/.exec(normalized);
    if (gotoZh) {
        const page = chinesePageNumber(gotoZh[1]);
        return page ? { kind: 'goto', symbols: [], page } : null;
    }

    if (new Set(['first page', 'first', '第一頁', '首頁']).has(lower)) return { kind: 'goto', symbols: [], page: 'first' };
    if (new Set(['last page', 'last', '最後一頁', '最尾', '尾頁']).has(lower)) return { kind: 'goto', symbols: [], page: 'last' };

    const jargon = /^(?:jargon|術語卡?|术语卡?)\s*(on|off|開|關|开|关)$/.exec(lower);
    if (jargon) return { kind: 'jargon', symbols: [], on: parsePolarity(jargon[1])! };
    if (/^(?:開|著|开|打開|開啟)\s*(?:術語|术语)卡?$/.test(lower)) return { kind: 'jargon', symbols: [], on: true };
    if (/^(?:關|閂|熄|关|關閉|收起)\s*(?:術語|术语)卡?$/.test(lower)) return { kind: 'jargon', symbols: [], on: false };
    if (/^(?:open|show|enable|turn on)\s+jargon$/.test(lower)) return { kind: 'jargon', symbols: [], on: true };
    if (/^(?:close|hide|disable|turn off)\s+jargon$/.test(lower)) return { kind: 'jargon', symbols: [], on: false };

    const cyclePolarity = new RegExp(`^${CYCLE_SUBJECT}\\s*(on|off|開|關|开|关)$`).exec(lower);
    if (cyclePolarity) return { kind: 'cycle', symbols: [], on: parsePolarity(cyclePolarity[1])! };
    if (new RegExp(`^(?:開|開始|著)\\s*${CYCLE_SUBJECT}$`).test(lower)) return { kind: 'cycle', symbols: [], on: true };
    if (new RegExp(`^(?:關|停|熄|閂|停止|暫停)\\s*${CYCLE_SUBJECT}$`).test(lower) || lower === '停播') return { kind: 'cycle', symbols: [], on: false };
    const cycleDwell = new RegExp(`^${CYCLE_SUBJECT}\\s*(\\d{1,3})\\s*(?:s|sec|secs|seconds|秒)?$`).exec(lower);
    if (cycleDwell) {
        const dwell = Number.parseInt(cycleDwell[1], 10);
        return dwell >= 1 ? { kind: 'cycle', symbols: [], on: true, dwellSec: nearestDwellPreset(dwell) } : null;
    }

    const range = standaloneRange(lower);
    if (range) return { kind: 'range', symbols: [], range };

    return null;
}

function rangeTokenPattern(token: string): string {
    return `${escapeRegExp(token)}(?:\\s*chart|圖|走勢)?`;
}

function parseChartRange(normalized: string, catalog: CatalogItem[]): PresentIntent | null {
    const candidates: Array<{ range: PresentRange; remainder: string }> = [];
    for (const [range, tokens] of RANGE_TOKEN_ENTRIES) {
        for (const token of tokens) {
            const pattern = rangeTokenPattern(token);
            const leading = new RegExp(`^${pattern}\\s+(.+)$`, 'i').exec(normalized);
            if (leading) candidates.push({ range, remainder: leading[1] });
            const trailing = new RegExp(`^(.+)\\s+${pattern}$`, 'i').exec(normalized);
            if (trailing) candidates.push({ range, remainder: trailing[1] });
        }
    }

    for (const candidate of candidates) {
        const item = resolveCatalogItem(candidate.remainder, catalog);
        if (item?.group === 'market') {
            return { kind: 'chart', symbols: [item.symbol], range: candidate.range };
        }
    }
    return null;
}

function resolveCatalogItem(part: string, catalog: CatalogItem[]): CatalogItem | null {
    const raw = stripLeadingVerb(part);
    if (!raw) return null;
    const lower = raw.toLowerCase();
    const lowerNoCaret = withoutLeadingCaret(lower);

    const symbolExact = catalog.find(item => {
        const symbol = item.symbol.toLowerCase();
        return symbol === lower || withoutLeadingCaret(symbol) === lowerNoCaret;
    });
    if (symbolExact) return symbolExact;

    const nameExact = catalog.find(item => item.name.toLowerCase() === lower || item.nameEn?.toLowerCase() === lower);
    if (nameExact) return nameExact;

    const matches = catalog.filter(item => {
        const symbol = item.symbol.toLowerCase();
        const name = item.name.toLowerCase();
        const nameEn = item.nameEn?.toLowerCase() ?? '';
        return symbol.includes(lower)
            || withoutLeadingCaret(symbol).includes(lowerNoCaret)
            || name.includes(lower)
            || (!!nameEn && nameEn.includes(lower));
    });
    return matches.length === 1 ? matches[0] : null;
}

function dedupeSymbols(symbols: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const symbol of symbols) {
        if (seen.has(symbol)) continue;
        seen.add(symbol);
        result.push(symbol);
    }
    return result;
}

export function parseCommandDeterministic(text: string, catalog: CatalogItem[]): PresentIntent | null {
    const normalized = normalizeText(text);
    if (!normalized) return null;
    const lower = normalized.toLowerCase();

    if (CLEAR_WORDS.has(lower)) {
        return { kind: 'clear', symbols: [] };
    }
    if (HEATMAP_WORDS.has(lower)) {
        return { kind: 'view', symbols: [], view: 'heatmap' };
    }
    if (INDEX_WORDS.has(lower)) {
        return { kind: 'view', symbols: [], view: 'index' };
    }

    const closed = parseClosedFormIntent(normalized, lower, catalog);
    if (closed) return closed;

    // Full-text resolve BEFORE the compare split: a catalog name that itself
    // contains a separator substring ("Growth vs Value") must resolve as one
    // item, not be split into an unintended compare.
    const whole = resolveCatalogItem(normalized, catalog);
    if (whole) {
        return {
            kind: whole.group === 'market' ? 'chart' : 'quote',
            symbols: [whole.symbol],
        };
    }

    const chartRange = parseChartRange(normalized, catalog);
    if (chartRange) return chartRange;

    const compareParts = normalized.split(COMPARE_SPLIT).filter(Boolean);
    if (compareParts.length >= 2) {
        const resolved = compareParts.map(part => resolveCatalogItem(part, catalog));
        if (resolved.some(item => item === null)) return null;
        return {
            kind: 'compare',
            symbols: (resolved as CatalogItem[]).map(item => item.symbol),
        };
    }

    return null;
}

export function validatePresentIntent(
    value: unknown,
    catalog: CatalogItem[],
): { ok: true; intent: PresentIntent } | { ok: false } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false };
    const raw = value as RawIntent;
    if (!isKind(raw.kind)) return { ok: false };

    if (raw.kind === 'clear') {
        return Array.isArray(raw.symbols) && raw.symbols.length === 0
            ? { ok: true, intent: { kind: 'clear', symbols: [] } }
            : { ok: false };
    }

    if (raw.kind === 'view') {
        return Array.isArray(raw.symbols) && raw.symbols.length === 0 && isView(raw.view)
            ? { ok: true, intent: { kind: 'view', symbols: [], view: raw.view } }
            : { ok: false };
    }

    if (raw.kind === 'goto') {
        const page = raw.page;
        const validPage = page === 'first'
            || page === 'last'
            || (typeof page === 'number' && Number.isInteger(page) && page >= 1 && page <= MAX_GOTO_PAGE);
        return Array.isArray(raw.symbols) && raw.symbols.length === 0 && validPage
            ? { ok: true, intent: { kind: 'goto', symbols: [], page } }
            : { ok: false };
    }

    if (raw.kind === 'jargon') {
        return Array.isArray(raw.symbols) && raw.symbols.length === 0 && typeof raw.on === 'boolean'
            ? { ok: true, intent: { kind: 'jargon', symbols: [], on: raw.on } }
            : { ok: false };
    }

    if (raw.kind === 'cycle') {
        const dwellSec = typeof raw.dwellSec === 'number' ? raw.dwellSec : undefined;
        const dwellValid = raw.dwellSec === undefined
            || (dwellSec !== undefined && Number.isInteger(dwellSec) && (CYCLE_DWELL_PRESETS as readonly number[]).includes(dwellSec));
        return Array.isArray(raw.symbols) && raw.symbols.length === 0 && typeof raw.on === 'boolean' && dwellValid
            ? {
                ok: true,
                intent: {
                    kind: 'cycle',
                    symbols: [],
                    on: raw.on,
                    ...(dwellSec !== undefined ? { dwellSec } : {}),
                },
            }
            : { ok: false };
    }

    if (raw.kind === 'range') {
        const range = normalizeRange(raw.range);
        return Array.isArray(raw.symbols) && raw.symbols.length === 0 && range
            ? { ok: true, intent: { kind: 'range', symbols: [], range } }
            : { ok: false };
    }

    if (raw.kind === 'explain') {
        const term = typeof raw.term === 'string' ? raw.term.trim() : '';
        return Array.isArray(raw.symbols) && raw.symbols.length === 0 && codePointLength(term) >= 1 && codePointLength(term) <= MAX_EXPLAIN_TERM_CODE_POINTS
            ? { ok: true, intent: { kind: 'explain', symbols: [], term } }
            : { ok: false };
    }

    if (raw.kind === 'page') return { ok: false };

    if (!Array.isArray(raw.symbols) || !raw.symbols.every(symbol => typeof symbol === 'string')) {
        return { ok: false };
    }

    const range = normalizeRange(raw.range);
    if (raw.range !== undefined && !range) return { ok: false };
    if (raw.kind === 'quote' && raw.range !== undefined) return { ok: false };

    const canonicalSymbols = raw.symbols.map(symbol => catalog.find(item => item.symbol === symbol)?.symbol ?? null);
    if (canonicalSymbols.some(symbol => symbol === null)) return { ok: false };
    let symbols = dedupeSymbols(canonicalSymbols as string[]);

    if (raw.kind === 'compare') {
        symbols = symbols.slice(0, MAX_COMPARE_SYMBOLS);
        if (symbols.length < 1) return { ok: false };
        const items = symbols.map(symbol => catalog.find(item => item.symbol === symbol)!);
        if (items.some(item => item.group !== 'market')) return { ok: false };
        if (symbols.length === 1) return { ok: true, intent: { kind: 'chart', symbols, ...(range ? { range } : {}) } };
        return { ok: true, intent: { kind: 'compare', symbols, ...(range ? { range } : {}) } };
    }

    if (raw.kind === 'highlight') {
        if (symbols.length !== 1 || symbols[0].length > 32) return { ok: false };
        const highlightItem = catalog.find(entry => entry.symbol === symbols[0]);
        return highlightItem?.group === 'market'
            ? { ok: true, intent: { kind: 'highlight', symbols } }
            : { ok: false };
    }

    if (symbols.length !== 1) return { ok: false };
    const item = catalog.find(entry => entry.symbol === symbols[0]);
    if (!item) return { ok: false };
    if (raw.kind === 'chart') {
        return item.group === 'market'
            ? { ok: true, intent: { kind: 'chart', symbols, ...(range ? { range } : {}) } }
            : { ok: false };
    }
    return raw.kind === 'quote' ? { ok: true, intent: { kind: 'quote', symbols } } : { ok: false };
}

export function buildPresentCommand(intent: PresentIntent, id: string, issuedAt: number): PresentCommand {
    if (intent.kind === 'view') {
        return { v: 1, id, kind: 'view', symbols: [], view: intent.view, issuedAt };
    }
    return {
        v: 1,
        id,
        kind: intent.kind,
        symbols: intent.symbols,
        ...(intent.kind === 'goto' ? { page: intent.page } : {}),
        ...(intent.kind === 'jargon' ? { on: intent.on } : {}),
        ...(intent.kind === 'cycle' ? { on: intent.on, ...(intent.dwellSec !== undefined ? { dwellSec: intent.dwellSec } : {}) } : {}),
        ...(intent.kind === 'range' ? { range: intent.range } : {}),
        ...(intent.kind === 'explain' ? { term: intent.term } : {}),
        ...((intent.kind === 'chart' || intent.kind === 'compare') && intent.range ? { range: intent.range } : {}),
        issuedAt,
    };
}

export function buildParsePrompt(text: string, catalog: CatalogItem[], lang: 'en' | 'zh-TW') {
    const catalogLines = catalog
        .map(item => `${item.symbol}\t${item.name}\t${item.nameEn ?? ''}\t${item.group}`)
        .join('\n');
    return [{
        role: 'user' as const,
        content: [
            'Parse a presenter command into a structured intent.',
            `Language hint: ${lang}. User text can be zh-TW or English.`,
            'Catalog lines are SYMBOL\tname\tnameEn\tgroup:',
            catalogLines,
            'Kinds: chart = show one market chart; compare = chart one market symbol against 1-4 market symbols; quote = show one market or macro quote; view = switch projector view; clear = return to slides and close overlays; goto = jump to a slide page; jargon = turn jargon spotlight on/off; cycle = turn auto-cycle on/off; range = switch market-data time range; explain = show a jargon explanation card for one financial term; highlight = visually emphasize one market card on the index dashboard.',
            'View names: slide, index, heatmap. index = dashboard overview.',
            'page is an integer 1-999 or "first"/"last". on is boolean. dwellSec must be one of 15,30,45,60,120. range must be one of 1M,3M,YTD,1Y. term is the term to explain, 1-80 chars; highlight takes exactly 1 market symbol.',
            'symbols MUST be [] for goto/jargon/cycle/range/view/clear/explain. range may accompany chart/compare ONLY, never quote. Only emit the fields documented per kind; extra fields are ignored. If toggle polarity is unclear, respond {"kind":"none"}.',
            'Examples: {"kind":"goto","symbols":[],"page":5}; {"kind":"jargon","symbols":[],"on":true}; {"kind":"cycle","symbols":[],"on":true,"dwellSec":30}; {"kind":"range","symbols":[],"range":"1Y"}; {"kind":"chart","symbols":["^HSI"],"range":"1Y"}; {"kind":"explain","symbols":[],"term":"duration"}; {"kind":"explain","symbols":[],"term":"久期"}; {"kind":"highlight","symbols":["^HSI"]}.',
            'Respond with ONLY a JSON object {"kind":...,"symbols":[...],"view":...}. symbols MUST be copied exactly from the catalog. If the request does not match anything, respond {"kind":"none"}.',
            `User text: ${text}`,
        ].join('\n'),
    }];
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
    return Object.keys(value).every(key => keys.includes(key));
}

function symbolsAreExecutable(symbols: unknown): symbols is string[] {
    return Array.isArray(symbols)
        && symbols.every(symbol => typeof symbol === 'string' && symbol.length > 0 && symbol.length <= 24);
}

export function isExecutablePresentCommand(value: unknown): value is PresentCommand {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const command = value as Record<string, unknown>;
    if (command.v !== 1) return false;
    if (typeof command.id !== 'string' || command.id.length < 1 || command.id.length > 64) return false;
    if (!isKind(command.kind)) return false;
    if (!symbolsAreExecutable(command.symbols)) return false;
    if (typeof command.issuedAt !== 'number' || !Number.isFinite(command.issuedAt) || command.issuedAt <= 0) return false;

    if (command.kind === 'view') {
        return hasOnlyKeys(command, ['v', 'id', 'kind', 'symbols', 'view', 'issuedAt'])
            && command.symbols.length === 0
            && isView(command.view);
    }
    if ('view' in command) return false;

    if (command.kind === 'page') {
        return hasOnlyKeys(command, ['v', 'id', 'kind', 'symbols', 'direction', 'issuedAt'])
            && command.symbols.length === 0
            && isPageDirection(command.direction);
    }
    if ('direction' in command) return false;

    if (command.kind === 'goto') {
        return hasOnlyKeys(command, ['v', 'id', 'kind', 'symbols', 'page', 'issuedAt'])
            && command.symbols.length === 0
            && (command.page === 'first' || command.page === 'last' || (typeof command.page === 'number' && Number.isInteger(command.page) && command.page >= 1 && command.page <= MAX_GOTO_PAGE));
    }
    if ('page' in command) return false;

    if (command.kind === 'jargon') {
        return hasOnlyKeys(command, ['v', 'id', 'kind', 'symbols', 'on', 'issuedAt'])
            && command.symbols.length === 0
            && typeof command.on === 'boolean';
    }

    if (command.kind === 'cycle') {
        return hasOnlyKeys(command, ['v', 'id', 'kind', 'symbols', 'on', 'dwellSec', 'issuedAt'])
            && command.symbols.length === 0
            && typeof command.on === 'boolean'
            && (command.dwellSec === undefined || (typeof command.dwellSec === 'number' && Number.isInteger(command.dwellSec) && (CYCLE_DWELL_PRESETS as readonly number[]).includes(command.dwellSec)));
    }
    if ('on' in command || 'dwellSec' in command) return false;

    if (command.kind === 'range') {
        return hasOnlyKeys(command, ['v', 'id', 'kind', 'symbols', 'range', 'issuedAt'])
            && command.symbols.length === 0
            && isPresentRange(command.range);
    }

    if (command.kind === 'explain') {
        const term = typeof command.term === 'string' ? command.term.trim() : '';
        return hasOnlyKeys(command, ['v', 'id', 'kind', 'symbols', 'term', 'issuedAt'])
            && command.symbols.length === 0
            && codePointLength(term) >= 1
            && codePointLength(term) <= MAX_EXPLAIN_TERM_CODE_POINTS;
    }
    if ('term' in command) return false;

    if (command.kind === 'highlight') {
        return hasOnlyKeys(command, ['v', 'id', 'kind', 'symbols', 'issuedAt'])
            && command.symbols.length === 1
            && typeof command.symbols[0] === 'string'
            && command.symbols[0].length <= 32;
    }

    if (command.kind === 'chart') {
        return hasOnlyKeys(command, ['v', 'id', 'kind', 'symbols', 'range', 'issuedAt'])
            && command.symbols.length === 1
            && (command.range === undefined || isPresentRange(command.range));
    }

    if (command.kind === 'compare') {
        return hasOnlyKeys(command, ['v', 'id', 'kind', 'symbols', 'range', 'issuedAt'])
            && command.symbols.length >= 2
            && command.symbols.length <= MAX_COMPARE_SYMBOLS
            && (command.range === undefined || isPresentRange(command.range));
    }

    if ('range' in command) return false;

    if (!hasOnlyKeys(command, ['v', 'id', 'kind', 'symbols', 'issuedAt'])) return false;
    if (command.kind === 'clear') return command.symbols.length === 0;
    return command.kind === 'quote' && command.symbols.length === 1;
}

export function shouldExecute(command: unknown, lastExecutedId: string | null, now: number): command is PresentCommand {
    if (!isExecutablePresentCommand(command)) return false;
    if (command.id === lastExecutedId) return false;
    return command.issuedAt >= now - STALE_MS;
}
