export type PresentCommandKind = 'chart' | 'compare' | 'quote' | 'view' | 'clear' | 'page' | 'goto' | 'jargon' | 'cycle' | 'range' | 'explain' | 'highlight';
export type PresentView = 'slide' | 'index' | 'heatmap';
export type PageDirection = 'next' | 'prev';
export type PresentRange = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y';

export const PRESENT_RANGES = ['1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y'] as const;
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
    | { kind: 'page'; symbols: []; direction: PageDirection }
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
const COMPARE_SPLIT = /\s*(?:vs\.?|versus|對比|比較|,|，)\s*|\s+(?:and|with)\s+|\s*(?:同埋|同|與|和)\s*/i;
const LEADING_VERB = /^(?:show me|show|display|open up|open|pull up|put up|compare|check|see|看|顯示|睇下|睇吓|睇返|睇|開返|開|拉|整)\s*/i;
// Politeness/particle shell around the actual command ("唔該幫我...", "... please").
// Stripped once up front so every later pattern sees the bare command.
const LEADING_COURTESY = /^(?:唔該|請|请|麻煩|麻烦|please)[\s,，]*(?:幫我|帮我|同我|比我|給我|给我)?\s*/i;
const LEADING_HELPER = /^(?:幫我|帮我|同我|比我|給我|给我)\s*/;
const TRAILING_COURTESY = /[\s,，]*(?:please|唔該|thanks|thank you|啦|先|呀|佢)$/i;
const TRAILING_PUNCTUATION = /[\s。．.!！?？]+$/;
// Generic chart nouns a presenter appends to a symbol ("標普500走勢", "gold
// price"): stripped as a RETRY only after the raw text fails to resolve.
const TRAILING_CHART_NOUN = /\s*(?:嘅)?(?:走勢圖|走勢|圖表|個圖|張圖|圖|價格|价格|chart|graph|price|timeline)$/i;
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
    direction?: unknown;
    on?: unknown;
    dwellSec?: unknown;
    range?: unknown;
    term?: unknown;
};

// Spoken/typed nicknames for the FIXED index/commodity set. The dynamic
// catalog (funds) never gets aliases. Matching is EXACT-only (after verb/noun
// stripping): substring alias matching was reviewed and rejected — short
// aliases like "gold"/"oil"/"btc" collide with fund-name substrings and a
// wrong chart on a live projector is worse than a 422.
const SYMBOL_ALIASES: Record<string, string[]> = {
    '^HSI': ['恒指', '恆指', '恒生指數', '恒生指数', '恆生指數', '大市', 'hang seng'],
    '^GSPC': ['標普', '标普', '標普500', '標普五百', '標準普爾', 'spx', 's&p', 's&p500', 'sp500'],
    '^IXIC': ['納指', '纳指', '納斯達克', '纳斯达克', 'nasdaq'],
    '^DJI': ['道指', '杜指', '道瓊斯', '道琼斯', '道瓊', 'dow'],
    '^N225': ['日經', '日经', '日經225', '日经225', 'nikkei'],
    '^VIX': ['恐慌指數', '恐慌指数'],
    '^FTSE': ['富時', '富时', '英股'],
    '^GDAXI': ['德股', 'dax'],
    'DX-Y.NYB': ['美元指數', '美元指数', 'dxy'],
    'JPY=X': ['日圓', '日元', '美元兌日圓', 'yen'],
    'EURUSD=X': ['歐元', '欧元', 'euro'],
    'HKD=X': ['港元', '港紙', '港幣'],
    'BTC-USD': ['比特幣', '比特币', 'btc', 'bitcoin'],
    'ETH-USD': ['以太幣', '乙太幣', '以太坊', 'eth'],
    'CL=F': ['油價', '油价', '原油', '石油', 'oil'],
    'GC=F': ['金價', '金价', '黃金', '黄金', 'gold'],
};

export function aliasesForSymbol(symbol: string): string[] {
    return SYMBOL_ALIASES[symbol] ?? [];
}

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
    // zh IMEs emit full-width digits ("第５頁"); every numeric pattern below
    // expects ASCII, so a stray full-width digit would dead-end to the NLU.
    return text
        .replace(/[０-９]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
        .trim()
        .replace(/\s+/g, ' ');
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

function stripCourtesy(value: string): string {
    let text = normalizeText(value);
    text = text.replace(TRAILING_PUNCTUATION, '');
    text = text.replace(LEADING_COURTESY, '');
    text = text.replace(LEADING_HELPER, '');
    // Particles stack ("睇恒指啦 thanks") — strip until stable, not once.
    for (let prev = ''; prev !== text;) {
        prev = text;
        text = text.replace(TRAILING_COURTESY, '');
    }
    return text.trim();
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
// The 下 particle after 解釋 ("解釋下 Duration") is only stripped when a space
// or Latin text follows — terms genuinely starting with 下 (下行風險) survive.
const EXPLAIN_PREFIX_ZH = /^(?:(?:同我|幫我|帮我)?\s*(?:解釋|解释)(?:一下|吓|下(?=[\sA-Za-z]))?|咩係|乜係|咩叫|什麼是|甚麼是|点解是)\s*(.+)$/;
const EXPLAIN_SUFFIX_ZH = /^(.+?)\s*(?:係咩|係乜|是什麼|是甚麼)$/;
// "...係咩意思" trailing a prefix-form capture ("解釋下 Duration 係咩意思").
const EXPLAIN_TERM_TRAILER = /\s*(?:係咩意思|係乜意思|是什麼意思|是甚麼意思|的意思|嘅意思|係咩|係乜|是什麼|是甚麼)$/;
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

// "what is X" phrasing where X is really a market question, not a concept
// ("what's the S&P doing", "what is VIX today"): must NOT become a jargon
// card with a junk term. Falls through to the NLU instead (return null).
const MARKET_QUESTION_CUE = /\b(?:doing|at|today|now|price|prices|quote|chart|level|up|down|going)\b|%|點樣|依家|而家|今日/i;

function explainOrCatalogIntent(term: string, catalog: CatalogItem[], requireCleanTerm: boolean): PresentIntent | null {
    // A term that IS a catalog item ("what's the hang seng", "咩係恒指") is a
    // market lookup, not jargon: chart it (market) or quote it (macro).
    const item = resolveCatalogItem(term.replace(/^(?:the|a|an)\s+/i, ''), catalog);
    if (item) {
        return item.group === 'market'
            ? { kind: 'chart', symbols: [item.symbol] }
            : { kind: 'quote', symbols: [item.symbol] };
    }
    if (requireCleanTerm && MARKET_QUESTION_CUE.test(term)) return null;
    return { kind: 'explain', symbols: [], term };
}

function parseExplainIntent(normalized: string, catalog: CatalogItem[]): PresentIntent | null {
    const en = EXPLAIN_PREFIX_EN.exec(normalized);
    if (en) {
        const term = validExplainTerm(en[1]);
        return term ? explainOrCatalogIntent(term, catalog, true) : null;
    }

    let zh = EXPLAIN_PREFIX_ZH.exec(normalized);
    if (zh) {
        let rest = zh[1].trim();
        const nested = EXPLAIN_PREFIX_ZH.exec(rest);
        if (nested) rest = nested[1].trim();
        rest = rest.replace(EXPLAIN_TERM_TRAILER, '').trim();
        // A "why" question (點解...) isn't a term — the NLU condenses it into
        // one ("殖利率曲線點解會倒掛" → 殖利率曲線倒掛) better than a regex can.
        if (/點解|点解|為什麼|为什么/.test(rest)) return null;
        const term = validExplainTerm(rest);
        return term ? explainOrCatalogIntent(term, catalog, false) : null;
    }

    zh = EXPLAIN_SUFFIX_ZH.exec(normalized);
    if (zh) {
        const term = validExplainTerm(zh[1]);
        return term ? explainOrCatalogIntent(term, catalog, false) : null;
    }
    return null;
}

const RANGE_TOKEN_ENTRIES: Array<[PresentRange, string[]]> = [
    ['1W', ['1w', '1 w', '1 week', '1-week', 'one week', '1週', '一週', '1周', '一周', '一星期']],
    ['1M', ['1m', '1 m', '1 month', '1-month', 'one month', '1個月', '一個月', '1个月']],
    ['3M', ['3m', '3 m', '3 months', '3-month', 'three months', '3個月', '三個月', '3个月']],
    ['6M', ['6m', '6 m', '6 months', '6-month', 'six months', '6個月', '六個月', '6个月', '半年']],
    ['YTD', ['ytd', 'year to date', '年初至今', '今年以來', '今年']],
    ['1Y', ['1y', '1 yr', '1 year', '1-year', 'one year', '1年', '一年']],
    ['5Y', ['5y', '5 yr', '5 years', '5-year', 'five years', '5年', '五年']],
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

    const explain = parseExplainIntent(normalized, catalog);
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

    // Relative page turns typed as text (the buttons already exist; presenters
    // also SAY it): "next page", "下一頁". Bare "back" stays a clear word.
    if (/^(?:go\s+)?(?:to\s+)?(?:the\s+)?(?:next|forward)(?:\s+(?:one\s+)?(?:page|slide))?$/.test(lower)
        || /^(?:下一頁|下頁|下一页|下一張|下一张|下一版|落一頁|翻下一頁|去下一頁|轉下一頁|跳下一頁)$/.test(normalized)) {
        return { kind: 'page', symbols: [], direction: 'next' };
    }
    if (/^(?:go\s+)?(?:to\s+)?(?:the\s+)?(?:previous|prev)(?:\s+(?:one\s+)?(?:page|slide))?$/.test(lower)
        || /^(?:go\s+|page\s+|slide\s+)?back\s+(?:one\s+|a\s+)?(?:page|slide)$/.test(lower)
        || /^(?:上一頁|上頁|上一页|上一張|上一张|前一頁|退一頁|返上一頁|返上頁|翻返上一頁|翻去上一頁|回上一頁)$/.test(normalized)) {
        return { kind: 'page', symbols: [], direction: 'prev' };
    }

    const gotoNumber = /^(?:go\s*to|turn\s*to|jump\s*to|skip\s*to|去|跳到|跳去|去到|翻到|翻去|轉到|轉去|返去)?\s*(?:page|pg?|第)\s*(\d{1,3})\s*(?:頁|页)?$/.exec(lower);
    if (gotoNumber) {
        const page = parsePageNumber(gotoNumber[1]);
        return page ? { kind: 'goto', symbols: [], page } : null;
    }

    const gotoZh = /^(?:去|跳到|跳去|去到|翻到|翻去|轉到|轉去|返去)?\s*第\s*([一二三四五六七八九十]{1,3})\s*[頁页]?$/.exec(normalized);
    if (gotoZh) {
        const page = chinesePageNumber(gotoZh[1]);
        return page ? { kind: 'goto', symbols: [], page } : null;
    }

    if (new Set(['first page', 'first', '第一頁', '第一張', '首頁', '返去第一頁']).has(lower)) return { kind: 'goto', symbols: [], page: 'first' };
    if (new Set(['last page', 'last', '最後一頁', '最後一張', '最後嗰張', '最尾', '尾頁']).has(lower)) return { kind: 'goto', symbols: [], page: 'last' };

    const jargon = /^(?:jargon|術語卡?|术语卡?)\s*(on|off|開|關|开|关)$/.exec(lower);
    if (jargon) return { kind: 'jargon', symbols: [], on: parsePolarity(jargon[1])! };
    if (/^(?:開|著|开|打開|開啟)(?:返|埋)?\s*(?:個|个)?\s*(?:術語|术语)卡?$/.test(lower)) return { kind: 'jargon', symbols: [], on: true };
    if (/^(?:關|閂|熄|关|關閉|收起)(?:咗|埋|返)?\s*(?:個|个)?\s*(?:術語|术语)卡?$/.test(lower)) return { kind: 'jargon', symbols: [], on: false };
    if (/^(?:open|show|enable|turn on)\s+jargon$/.test(lower)) return { kind: 'jargon', symbols: [], on: true };
    if (/^(?:close|hide|disable|turn off)\s+jargon$/.test(lower)) return { kind: 'jargon', symbols: [], on: false };

    const cyclePolarity = new RegExp(`^${CYCLE_SUBJECT}\\s*(on|off|開|關|开|关)$`).exec(lower);
    if (cyclePolarity) return { kind: 'cycle', symbols: [], on: parsePolarity(cyclePolarity[1])! };
    if (new RegExp(`^(?:開|開始|著)(?:返|埋)?\\s*(?:個|个)?\\s*${CYCLE_SUBJECT}$`).test(lower)) return { kind: 'cycle', symbols: [], on: true };
    if (new RegExp(`^(?:關|停|熄|閂|停止|暫停)(?:咗|埋|返)?\\s*(?:個|个)?\\s*${CYCLE_SUBJECT}$`).test(lower) || lower === '停播') return { kind: 'cycle', symbols: [], on: false };
    const cycleDwell = new RegExp(`^${CYCLE_SUBJECT}\\s*(\\d{1,3})\\s*(?:s|sec|secs|seconds|秒)?$`).exec(lower);
    if (cycleDwell) {
        const dwell = Number.parseInt(cycleDwell[1], 10);
        return dwell >= 1 ? { kind: 'cycle', symbols: [], on: true, dwellSec: nearestDwellPreset(dwell) } : null;
    }

    const range = standaloneRange(lower);
    if (range) return { kind: 'range', symbols: [], range };

    // Whole-utterance range switch with verb/chart-noun shell: "睇返一年圖",
    // "switch to 3 months", "1y chart". Exact-token only after stripping, so a
    // range word next to a symbol still goes through parseChartRange instead.
    const rangeShell = stripLeadingVerb(normalized)
        .replace(/^(?:switch to|change to|轉去|轉返|切換到|切換)\s*/i, '')
        .replace(TRAILING_CHART_NOUN, '')
        .replace(/\s*(?:嘅)?(?:時間範圍|时间范围|timeframe|period|range|view)$/i, '')
        .trim()
        .toLowerCase();
    if (rangeShell !== lower) {
        const shellRange = standaloneRange(rangeShell);
        if (shellRange) return { kind: 'range', symbols: [], range: shellRange };
    }

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
            // CJK range tokens ("一年") sit flush against the symbol part
            // ("恒指一年圖") — no whitespace boundary exists to require.
            const boundary = /[一-鿿]/.test(token) ? '\\s*' : '\\s+';
            const leading = new RegExp(`^${pattern}${boundary}(.+)$`, 'i').exec(normalized);
            if (leading) candidates.push({ range, remainder: leading[1] });
            const trailing = new RegExp(`^(.+?)${boundary}${pattern}$`, 'i').exec(normalized);
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
    const direct = resolveCatalogItemOnce(part, catalog);
    if (direct) return direct;
    // Retry once with a trailing generic chart noun removed ("標普500走勢",
    // "gold price") — only as a fallback so exact names keep priority.
    const stripped = stripLeadingVerb(part).replace(TRAILING_CHART_NOUN, '').trim();
    return stripped && stripped !== stripLeadingVerb(part) ? resolveCatalogItemOnce(stripped, catalog) : null;
}

function resolveCatalogItemOnce(part: string, catalog: CatalogItem[]): CatalogItem | null {
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

    const aliasExact = catalog.find(item =>
        (SYMBOL_ALIASES[item.symbol] ?? []).some(alias => alias.toLowerCase() === lower));
    if (aliasExact) return aliasExact;

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
    const normalized = normalizeText(stripCourtesy(text));
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
        // Compare is market-only; a macro member (e.g. "CPI 同 GDP") must fall
        // through to the NLU instead of a guaranteed-422 deterministic intent.
        if (resolved.some(item => item!.group !== 'market')) return null;
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

    if (raw.kind === 'page') {
        return Array.isArray(raw.symbols) && raw.symbols.length === 0 && isPageDirection(raw.direction)
            ? { ok: true, intent: { kind: 'page', symbols: [], direction: raw.direction } }
            : { ok: false };
    }

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
        // "chart" of a macro series is what a quote shows here — coerce
        // instead of 422ing a correct symbol pick ("Show US GDP chart").
        return item.group === 'market'
            ? { ok: true, intent: { kind: 'chart', symbols, ...(range ? { range } : {}) } }
            : { ok: true, intent: { kind: 'quote', symbols } };
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
        ...(intent.kind === 'page' ? { direction: intent.direction } : {}),
        ...(intent.kind === 'goto' ? { page: intent.page } : {}),
        ...(intent.kind === 'jargon' ? { on: intent.on } : {}),
        ...(intent.kind === 'cycle' ? { on: intent.on, ...(intent.dwellSec !== undefined ? { dwellSec: intent.dwellSec } : {}) } : {}),
        ...(intent.kind === 'range' ? { range: intent.range } : {}),
        ...(intent.kind === 'explain' ? { term: intent.term } : {}),
        ...((intent.kind === 'chart' || intent.kind === 'compare') && intent.range ? { range: intent.range } : {}),
        issuedAt,
    };
}

function promptField(value: string): string {
    // Names are client-supplied; tabs/newlines would corrupt the line format.
    return value.replace(/[\t\r\n]+/g, ' ');
}

export function buildParsePrompt(text: string, catalog: CatalogItem[], lang: 'en' | 'zh-TW') {
    const catalogLines = catalog
        .map(item => {
            const aliases = (SYMBOL_ALIASES[item.symbol] ?? []).join(' / ');
            return `${promptField(item.symbol)}\t${promptField(item.name)}\t${promptField(item.nameEn ?? '')}\t${item.group}\t${aliases}`;
        })
        .join('\n');
    return [{
        role: 'user' as const,
        content: [
            'Parse a presenter command into a structured intent.',
            `Language hint: ${lang}. User text can be zh-TW, Cantonese colloquial, or English.`,
            'Catalog lines are SYMBOL\tname\tnameEn\tgroup\taliases. Aliases are alternative spoken names for MATCHING ONLY — output must always use the exact SYMBOL.',
            catalogLines,
            'Kinds: chart = show one market chart; compare = chart one market symbol against 1-4 market symbols; quote = show one market or macro quote; view = switch projector view; clear = return to slides and close overlays; page = turn one slide forward/back relative to current; goto = jump to a slide page; jargon = turn jargon spotlight on/off; cycle = turn auto-cycle on/off; range = switch market-data time range; explain = show a jargon explanation card for one financial term; highlight = visually emphasize one market card on the index dashboard.',
            'View names: slide, index, heatmap. index = dashboard overview.',
            'direction is "next" or "prev" for page. page is an integer 1-999 or "first"/"last" for goto. on is boolean. dwellSec must be one of 15,30,45,60,120. range must be one of 1W,1M,3M,6M,YTD,1Y,5Y. term is the term to explain, 1-80 chars; highlight takes exactly 1 market symbol.',
            'symbols MUST be [] for page/goto/jargon/cycle/range/view/clear/explain. chart/quote need exactly 1 catalog symbol and highlight exactly 1 market symbol — never emit an empty symbols array for them. view REQUIRES the view field. range may accompany chart/compare ONLY, never quote. Asking how a catalog item is doing = chart (market) or quote (macro), NOT explain. Only emit the fields documented per kind; extra fields are ignored. If toggle polarity is unclear, respond {"kind":"none"}.',
            'Examples: {"kind":"goto","symbols":[],"page":5}; {"kind":"jargon","symbols":[],"on":true}; {"kind":"cycle","symbols":[],"on":true,"dwellSec":30}; {"kind":"range","symbols":[],"range":"1Y"}; {"kind":"chart","symbols":["^HSI"],"range":"1Y"}; {"kind":"explain","symbols":[],"term":"duration"}; {"kind":"explain","symbols":[],"term":"久期"}; {"kind":"highlight","symbols":["^HSI"]}.',
            'zh-TW examples: "下一頁" -> {"kind":"page","symbols":[],"direction":"next"}; "翻返上一頁" -> {"kind":"page","symbols":[],"direction":"prev"}; "睇下恒指" -> {"kind":"chart","symbols":["^HSI"]}; "返回投影片" -> {"kind":"clear","symbols":[]}; "睇返一年圖" -> {"kind":"range","symbols":[],"range":"1Y"}; "恒指同日經比較" -> {"kind":"compare","symbols":["^HSI","^N225"]}.',
            'Respond with ONLY a JSON object {"kind":...,"symbols":[...],...}. symbols MUST be copied exactly from the catalog. If the request does not match anything, respond {"kind":"none"}.',
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
