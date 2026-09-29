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
            { id: 1, title: '聯儲局維持利率', summary: 's1', sentiment: 'NEUTRAL' },
            { id: 2, title: '油價急挫', summary: 's2', sentiment: 'BEARISH' },
            { id: 3, title: '恒指反彈', summary: 's3', sentiment: 'BULLISH' },
        ]);
        expect(result.articles.map(a => a.sentiment)).toEqual(['Neutral', 'Bearish', 'Bullish']);
        expect(result.articles[1].summary).toBe('s2');
        expect(result.matched).toBe(3);
    });

    it('joins reversed entries by id rather than position', () => {
        const result = applyAiArticleData(articles, [
            { id: 3, title: '恒指反彈', summary: 's3', sentiment: 'BULLISH' },
            { id: 2, title: '油價急挫', summary: 's2', sentiment: 'BEARISH' },
            { id: 1, title: '聯儲局維持利率', summary: 's1', sentiment: 'NEUTRAL' },
        ]);
        expect(result.articles.map(a => a.summary)).toEqual(['s1', 's2', 's3']);
    });

    it('keeps the originals when the model returned extras or a non-array', () => {
        expect(applyAiArticleData(articles, [...Array(4)].map((_, i) => ({ id: i + 1, summary: 'x', sentiment: 'BULLISH' }))).matched).toBe(3);
        expect(applyAiArticleData(articles, undefined)).toMatchObject({ articles, matched: 0 });
    });

    it('ignores non-string title/summary fields per entry', () => {
        const result = applyAiArticleData(articles, [
            { id: 1, title: 42, summary: null, sentiment: 'BULLISH' },
            { id: 2 },
            { id: 3 },
        ]);
        expect(result.articles[0].title).toBe('Fed holds rates');
        expect(result.articles[0].sentiment).toBe('Bullish');
        expect(result.articles[1]).toEqual(articles[1]);
        expect(result.articles[2]).toEqual(articles[2]);
    });

    it('keeps a non-neutral original sentiment when the AI entry omits sentiment', () => {
        const seeded: Article[] = [{ title: 'Oil crashes', summary: 'Oil crashes', sentiment: 'Bearish' }];
        const result = applyAiArticleData(seeded, [{ id: 1, summary: 'better summary' }]);
        expect(result.articles[0].sentiment).toBe('Bearish');
        expect(result.articles[0].summary).toBe('better summary');
    });

    it('ignores duplicate and missing ids', () => {
        const result = applyAiArticleData(articles, [
            { id: '1', summary: 'ambiguous' },
            { id: 1, summary: 'also ambiguous' },
            { summary: 'missing id' },
        ]);
        expect(result.articles).toEqual(articles);
        expect(result.matched).toBe(0);
    });
});
