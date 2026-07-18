import { describe, expect, it } from 'vitest';
import { buildJargonWarmBody, JARGON_MAX_TEXT_LEN } from './jargon';

describe('buildJargonWarmBody', () => {
    it('builds a valid text body with the projector slide id', () => {
        const text = 'Duration exposure rises when long-term yields fall across markets.';

        expect(buildJargonWarmBody(text, null, 'en', 12345, 2)).toEqual({
            text,
            lang: 'en',
            slideId: '12345#2',
        });
    });

    it('builds a valid image body for short text with image base64', () => {
        expect(buildJargonWarmBody('short', 'QUJDRA==', 'zh-TW', 9, 1)).toEqual({
            imageBase64: 'QUJDRA==',
            lang: 'zh-TW',
            slideId: '9#1',
        });
    });

    it('returns null for invalid slide versions', () => {
        for (const version of [NaN, 0, -1, Infinity, undefined]) {
            expect(buildJargonWarmBody('x'.repeat(40), null, 'en', version, 1)).toBeNull();
        }
    });

    it('returns null for invalid pages', () => {
        for (const page of [0, -1, 1.5]) {
            expect(buildJargonWarmBody('x'.repeat(40), null, 'en', 1, page)).toBeNull();
        }
    });

    it('returns null when short text has no image', () => {
        expect(buildJargonWarmBody('short', null, 'en', 1, 1)).toBeNull();
    });

    it('prioritizes eligible text over image base64', () => {
        const text = 'Basis-point moves compound across fixed income and equity factors.';

        expect(buildJargonWarmBody(text, 'QUJDRA==', 'en', 7, 3)).toEqual({
            text,
            lang: 'en',
            slideId: '7#3',
        });
    });

    it('applies jargon text preparation before returning text bodies', () => {
        const body = buildJargonWarmBody(`  ${'x '.repeat(JARGON_MAX_TEXT_LEN + 100)}\n\nextra  `, null, 'en', 1, 1);

        expect(body).toEqual({
            text: expect.any(String),
            lang: 'en',
            slideId: '1#1',
        });
        expect(body && 'text' in body ? body.text : '').toHaveLength(JARGON_MAX_TEXT_LEN);
        expect(body && 'text' in body ? body.text : '').not.toContain('\n');
        expect(body && 'text' in body ? body.text : '').not.toContain('  ');
    });
});
