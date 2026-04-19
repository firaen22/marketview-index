// Replaces {{SYMBOL.field}} with live values. Symbol can be bare (SPX) or with caret (^GSPC).
export function injectMarketTokens(
    text: string,
    data: Array<{ symbol: string; name?: string; [k: string]: any }>
): string {
    if (!text || !data?.length) return text;
    return text.replace(/\{\{\s*([\w^.-]+)\.(\w+)\s*\}\}/g, (match, sym, field) => {
        const needle = String(sym).toUpperCase();
        const item = data.find(d => {
            const s = (d.symbol || '').toUpperCase();
            return s === needle || s === `^${needle}` || s.replace('^', '') === needle;
        });
        if (!item) return match;
        const val = item[field];
        if (val == null) return match;
        if (typeof val === 'number') {
            return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return String(val);
    });
}
