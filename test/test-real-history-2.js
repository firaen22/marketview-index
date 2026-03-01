import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

async function testFetch() {
    try {
        const d1 = new Date(); d1.setFullYear(d1.getFullYear(), 0, 1);
        const period1 = d1.toISOString().split('T')[0];
        const d2 = new Date();
        const period2 = d2.toISOString().split('T')[0];

        const c = await yahooFinance.chart('DX-Y.NYB', { period1, period2, interval: '1wk' });
        console.log('DX-Y.NYB', c.quotes.length);
    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}

testFetch();
