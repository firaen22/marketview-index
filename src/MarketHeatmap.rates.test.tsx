import { describe, expect, it } from 'vitest';
import { heatmapTileLabel } from './MarketHeatmap';

describe('heatmapTileLabel', () => {
    it('keeps the tenor so the two US yield tiles differ', () => {
        expect(heatmapTileLabel('US 10Y Treasury Yield')).toBe('US 10Y');
        expect(heatmapTileLabel('US 30Y Treasury Yield')).toBe('US 30Y');
    });

    it('leaves long first words as they were', () => {
        expect(heatmapTileLabel('Nikkei 225')).toBe('Nikkei');
        expect(heatmapTileLabel('Crude Oil')).toBe('Crude');
        expect(heatmapTileLabel('Japan 10Y JGB Yield')).toBe('Japan');
        expect(heatmapTileLabel('Bitcoin')).toBe('Bitcoin');
    });

    it('keeps a numeric second word after a short prefix', () => {
        expect(heatmapTileLabel('S&P 500')).toBe('S&P 500');
    });

    it('does not append a non-numeric second word', () => {
        expect(heatmapTileLabel('BSE SENSEX')).toBe('BSE');
        expect(heatmapTileLabel('')).toBe('');
    });
});
