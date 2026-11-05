import { describe, expect, it } from 'vitest';
import { PRESENT_INDEX_CATEGORIES } from '../lib/presentIndexCategory.js';
import { PRESENT_INDEX_CATEGORY_VALUES } from '../mcp/src/categoryLabels.js';

describe('present index category labels', () => {
    it('MCP category enum matches lib/presentIndexCategory', () => {
        expect([...PRESENT_INDEX_CATEGORY_VALUES]).toEqual([...PRESENT_INDEX_CATEGORIES]);
    });
});
