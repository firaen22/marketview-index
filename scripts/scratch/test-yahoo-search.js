import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function testFetch() {
    try {
        const q1 = await yahooFinance.search('SPY', { newsCount: 1 });
        console.log(q1.news[0]);
    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}

testFetch();
