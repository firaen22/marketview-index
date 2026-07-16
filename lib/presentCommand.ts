export type PresentCommandKind = 'chart' | 'compare' | 'quote' | 'view' | 'clear' | 'page';
export type PresentView = 'slide' | 'index' | 'heatmap';
export type PageDirection = 'next' | 'prev';

export interface PresentCommand {
    v: 1;
    id: string;
    kind: PresentCommandKind;
    symbols: string[];
    view?: PresentView;
    direction?: PageDirection;
    issuedAt: number;
}

export interface CatalogItem {
    symbol: string;
    name: string;
    nameEn?: string;
    group: 'market' | 'macro';
}

export type PresentIntent =
    | { kind: 'chart'; symbols: string[] }
    | { kind: 'compare'; symbols: string[] }
    | { kind: 'quote'; symbols: string[] }
    | { kind: 'view'; symbols: []; view: PresentView }
    | { kind: 'clear'; symbols: [] };

const KINDS = ['chart', 'compare', 'quote', 'view', 'clear', 'page'] as const;
const VIEWS = ['slide', 'index', 'heatmap'] as const;
const CLEAR_WORDS = new Set(['clear', 'close', 'back', 'slides', 'slide', '返回', '清除', '關閉', '投影片']);
const HEATMAP_WORDS = new Set(['heatmap', '熱圖', '熱力圖']);
const INDEX_WORDS = new Set(['dashboard', 'index', '指數', '大盤']);
const COMPARE_SPLIT = /\s*(?:vs\.?|對比|比較|,|，)\s*/i;
const LEADING_VERB = /^(?:show|display|open|看|顯示|睇)\s*/i;
const MAX_COMPARE_SYMBOLS = 5;
const STALE_MS = 120_000;

type RawIntent = {
    kind?: unknown;
    symbols?: unknown;
    view?: unknown;
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

function normalizeText(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
}

function withoutLeadingCaret(value: string): string {
    return value.startsWith('^') ? value.slice(1) : value;
}

function stripLeadingVerb(value: string): string {
    return normalizeText(value).replace(LEADING_VERB, '').trim();
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

    const nameExact = catalog.find(item => item.name === raw || item.nameEn?.toLowerCase() === lower);
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

    if (!Array.isArray(raw.symbols) || !raw.symbols.every(symbol => typeof symbol === 'string')) {
        return { ok: false };
    }

    const canonicalSymbols = raw.symbols.map(symbol => catalog.find(item => item.symbol === symbol)?.symbol ?? null);
    if (canonicalSymbols.some(symbol => symbol === null)) return { ok: false };
    let symbols = dedupeSymbols(canonicalSymbols as string[]);

    if (raw.kind === 'compare') {
        symbols = symbols.slice(0, MAX_COMPARE_SYMBOLS);
        if (symbols.length < 1) return { ok: false };
        const items = symbols.map(symbol => catalog.find(item => item.symbol === symbol)!);
        if (items.some(item => item.group !== 'market')) return { ok: false };
        if (symbols.length === 1) return { ok: true, intent: { kind: 'chart', symbols } };
        return { ok: true, intent: { kind: 'compare', symbols } };
    }

    if (symbols.length !== 1) return { ok: false };
    const item = catalog.find(entry => entry.symbol === symbols[0]);
    if (!item) return { ok: false };
    if (raw.kind === 'chart') {
        return item.group === 'market'
            ? { ok: true, intent: { kind: 'chart', symbols } }
            : { ok: false };
    }
    return { ok: true, intent: { kind: 'quote', symbols } };
}

export function buildPresentCommand(intent: PresentIntent, id: string, issuedAt: number): PresentCommand {
    if (intent.kind === 'view') {
        return { v: 1, id, kind: 'view', symbols: [], view: intent.view, issuedAt };
    }
    return { v: 1, id, kind: intent.kind, symbols: intent.symbols, issuedAt };
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
            'Kinds: chart = show one market chart; compare = chart one market symbol against 1-4 market symbols; quote = show one market or macro quote; view = switch projector view; clear = return to slides and close overlays.',
            'View names: slide, index, heatmap. index = dashboard overview.',
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

    if (!hasOnlyKeys(command, ['v', 'id', 'kind', 'symbols', 'issuedAt'])) return false;
    if (command.kind === 'clear') return command.symbols.length === 0;
    if (command.kind === 'chart' || command.kind === 'quote') return command.symbols.length === 1;
    return command.symbols.length >= 2 && command.symbols.length <= MAX_COMPARE_SYMBOLS;
}

export function shouldExecute(command: unknown, lastExecutedId: string | null, now: number): command is PresentCommand {
    if (!isExecutablePresentCommand(command)) return false;
    if (command.id === lastExecutedId) return false;
    return command.issuedAt >= now - STALE_MS;
}
