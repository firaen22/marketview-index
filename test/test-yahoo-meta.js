import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function testFetch() {
    try {
        const d = await yahooFinance.chart('^GSPC', { period1: '2026-02-20', interval: '1mo' });
        console.log(d.meta);
    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}

testFetch();
