import { describe, expect, it } from 'vitest';
import {
    appendProjectorDisplayParams,
    parseProjectorDisplayFromQuery,
    validateProjectorDisplay,
} from './presentDisplay';

describe('presentDisplay', () => {
    it('validates a minimal display object', () => {
        expect(validateProjectorDisplay({ schema: 1, iw: 1280, ih: 720, dpr: 1 })).toEqual({
            schema: 1,
            iw: 1280,
            ih: 720,
            dpr: 1,
        });
    });

    it('rejects out-of-range dimensions and dpr', () => {
        expect(validateProjectorDisplay({ schema: 1, iw: 0, ih: 720, dpr: 1 })).toBeNull();
        expect(validateProjectorDisplay({ schema: 1, iw: 1280, ih: 720, dpr: 5 })).toBeNull();
    });

    it('round-trips through query params', () => {
        const params = new URLSearchParams();
        appendProjectorDisplayParams(params, {
            schema: 1,
            iw: 1024,
            ih: 576,
            dpr: 1.25,
            fw: 631,
            fh: 400,
            lang: 'zh-TW',
        });
        const parsed = parseProjectorDisplayFromQuery(Object.fromEntries(params.entries()));
        expect(parsed).toEqual({
            schema: 1,
            iw: 1024,
            ih: 576,
            dpr: 1.25,
            fw: 631,
            fh: 400,
            lang: 'zh-TW',
        });
    });

    it('drops invalid display query without throwing', () => {
        expect(parseProjectorDisplayFromQuery({ iw: '1280', ih: 'not-a-number', dpr: '100' })).toBeNull();
    });
});
