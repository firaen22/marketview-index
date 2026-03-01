import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function testFetch() {
    const q = await yahooFinance.quote(['^GSPC', 'AAPL']);
    console.log(q[0].ytdReturn, q[0].fiftyTwoWeekHigh, q[0].fiftyTwoWeekLow);
}
testFetch();
