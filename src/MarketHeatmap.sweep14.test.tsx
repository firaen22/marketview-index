// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { transformToTreemap, CustomTooltip } from './MarketHeatmap';
import type { IndexData } from './types';

const fund: IndexData = {
    symbol: '0P00000EBQ',
    name: '駿利亨德森遠見基金 - 環球科技領先基金',
    nameEn: 'Janus Henderson Horizon Fund - Global Technology Leaders Fund',
    category: 'Fund',
    subCategory: 'Technology',
    price: 100,
    change: 1,
    changePercent: 0.5,
    ytdChange: 2,
    ytdChangePercent: 1,
    history: [],
} as unknown as IndexData;

describe('MarketHeatmap sweep-14 regressions', () => {
    it('transformToTreemap uses nameEn for language=en (funds carry Chinese name)', () => {
        const nodes = transformToTreemap([fund], 'subCategory', 'en');
        expect(nodes[0].children[0].name).toBe(fund.nameEn);
    });

    it('transformToTreemap keeps Chinese name for zh-TW / default', () => {
        expect(transformToTreemap([fund], 'subCategory', 'zh-TW')[0].children[0].name).toBe(fund.name);
        expect(transformToTreemap([fund], 'subCategory')[0].children[0].name).toBe(fund.name);
    });

    it('CustomTooltip renders nothing for nodes without a numeric change (category parents)', () => {
        const rendered = CustomTooltip({
            active: true,
            payload: [{ payload: { name: 'Fund', children: [] } as never }],
        });
        expect(rendered).toBeNull();
    });
});
