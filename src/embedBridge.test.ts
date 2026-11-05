import { describe, expect, it } from 'vitest';
import { parseEmbedCategory } from './embedBridge';

describe('parseEmbedCategory', () => {
    it('accepts All and known categories', () => {
        expect(parseEmbedCategory('All')).toBe('All');
        expect(parseEmbedCategory('US')).toBe('US');
        expect(parseEmbedCategory('Asia')).toBe('Asia');
    });

    it('rejects unknown labels', () => {
        expect(parseEmbedCategory('')).toBeNull();
        expect(parseEmbedCategory('NASDAQ')).toBeNull();
        expect(parseEmbedCategory(null)).toBeNull();
    });
});
