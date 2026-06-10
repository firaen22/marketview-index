import { describe, expect, it } from 'vitest';
import { injectMarketTokens } from './tokenInject';

describe('injectMarketTokens', () => {
    it('replaces a known market token so presentation slides show the current value', () => {
        const result = injectMarketTokens('S&P 500: {{SPX.price}}', [
            { symbol: '^SPX', price: 6123.456 },
        ]);

        expect(result).toBe(`S&P 500: ${formatTwoDecimals(6123.456)}`);
    });

    it.each([null, undefined])(
        'leaves tokens untouched when live data is %s so missing data is not presented as a value',
        value => {
            expect(injectMarketTokens('S&P 500: {{SPX.price}}', [
                { symbol: 'SPX', price: value },
            ])).toBe('S&P 500: {{SPX.price}}');
        },
    );

    it.each([NaN, Infinity, -Infinity])(
        'leaves tokens untouched when live data is %s so slides never render invalid numeric labels',
        value => {
            expect(injectMarketTokens('S&P 500: {{SPX.price}}', [
                { symbol: 'SPX', price: value },
            ])).toBe('S&P 500: {{SPX.price}}');
        },
    );
});

function formatTwoDecimals(value: number): string {
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}
