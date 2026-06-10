import { describe, expect, it } from 'vitest';
import { displayName, formatPrice, formatWhole } from './utils';

describe('displayName', () => {
    const index = { name: '恆生指數', nameEn: 'Hang Seng Index' };

    it('uses the English label in English UI so index names match the selected language', () => {
        expect(displayName(index, 'en')).toBe('Hang Seng Index');
    });

    it('uses the Traditional Chinese label in zh-TW UI so localized names remain visible', () => {
        expect(displayName(index, 'zh-TW')).toBe('恆生指數');
    });

    it('falls back to the available name when an English label is missing so cards are never blank', () => {
        expect(displayName({ name: '恆生指數', nameEn: '' }, 'en')).toBe('恆生指數');
    });
});

describe('market number formatting', () => {
    it('formatPrice preserves the sign and exactly two decimals used for quoted prices', () => {
        expect(formatPrice(-12.345)).toBe('-12.35');
        expect(formatPrice(12)).toBe('12.00');
    });

    it('formatWhole preserves the sign and rounds away decimals used for whole-number metrics', () => {
        expect(formatWhole(-12.6)).toBe('-13');
        expect(formatWhole(12.4)).toBe('12');
    });
});
