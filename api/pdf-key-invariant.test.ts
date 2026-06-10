import { describe, expect, it } from 'vitest';
import { PDF_KEY_PATTERN } from './pdf-proxy';
import { sanitizeFilename } from './present-pdf';

const TIMESTAMP = '1760000000000';
const RANDOM_HEX = 'abcdef012345';

describe('PDF upload and proxy key contract', () => {
    it.each([
        '../../etc/passwd',
        'report..final.pdf',
        'CJK中文名.pdf',
        `${'a'.repeat(300)}.pdf`,
        '',
        'normal-file_v2.pdf',
    ])(
        'every sanitized upload filename must produce a key accepted by the read proxy: %j',
        filename => {
            const key = `${TIMESTAMP}-${RANDOM_HEX}-${sanitizeFilename(filename)}`;

            expect(PDF_KEY_PATTERN.test(key)).toBe(true);
        },
    );

    it('the PDF proxy must reject slide-state keys so non-PDF storage cannot be read through it', () => {
        expect(PDF_KEY_PATTERN.test('slide-state/marketflow_present_slide_v1.json')).toBe(false);
    });

    it.each([
        '..1760000000000-abcdef012345-normal.pdf',
        '1760000000000-..abcdef0123-normal.pdf',
        '1760000000000-abcdef012345-../normal.pdf',
    ])('the PDF proxy must reject traversal markers anywhere in a key: %s', key => {
        expect(PDF_KEY_PATTERN.test(key)).toBe(false);
    });
});
