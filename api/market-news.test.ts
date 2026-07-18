import { describe, expect, it } from 'vitest';
import { applyAiArticleData } from './market-news';

type Article = { title: string; summary: string; sentiment: 'Bullish' | 'Bearish' | 'Neutral' };

const articles: Article[] = [
    { title: 'Fed holds rates', summary: 'Fed holds rates', sentiment: 'Neutral' },
    { title: 'Oil crashes', summary: 'Oil crashes', sentiment: 'Neutral' },
    { title: 'HSI rallies', summary: 'HSI rallies', sentiment: 'Neutral' },
];

describe('applyAiArticleData (sweep 10)', () => {
    it('overlays summaries and sentiment when counts line up', () => {
        const result = applyAiArticleData(articles, [
            { title: '聯儲局維持利率', summary: 's1', sentiment: 'NEUTRAL' },
            { title: '油價急挫', summary: 's2', sentiment: 'BEARISH' },
            { title: '恒指反彈', summary: 's3', sentiment: 'BULLISH' },
        ]);
        expect(result.map(a => a.sentiment)).toEqual(['Neutral', 'Bearish', 'Bullish']);
        expect(result[1].summary).toBe('s2');
    });

    it('keeps the originals when the model dropped an article (misalignment guard)', () => {
        const result = applyAiArticleData(articles, [
            { title: '油價急挫', summary: 'wrong-headline summary', sentiment: 'BEARISH' },
            { title: '恒指反彈', summary: 's3', sentiment: 'BULLISH' },
        ]);
        expect(result).toEqual(articles);
    });

    it('keeps the originals when the model returned extras or a non-array', () => {
        expect(applyAiArticleData(articles, [...Array(4)].map(() => ({ summary: 'x', sentiment: 'BULLISH' })))).toEqual(articles);
        expect(applyAiArticleData(articles, undefined)).toEqual(articles);
    });

    it('ignores non-string title/summary fields per entry', () => {
        const result = applyAiArticleData(articles, [
            { title: 42, summary: null, sentiment: 'BULLISH' },
            {},
            null,
        ]);
        expect(result[0].title).toBe('Fed holds rates');
        expect(result[0].sentiment).toBe('Bullish');
        expect(result[1]).toEqual(articles[1]);
        expect(result[2]).toEqual(articles[2]);
    });
});
