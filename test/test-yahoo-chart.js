import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function testFetch() {
    try {
        const d = await yahooFinance.chart('^GSPC', { period1: '2026-02-15', interval: '1d' });
        console.log(d.meta.symbol);
        console.log(d.quotes.slice(-5));
    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}

testFetch();
