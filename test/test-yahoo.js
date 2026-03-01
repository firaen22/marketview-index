import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

async function testFetch() {
    try {
        const d = await yahooFinance.quote('AAPL');
        console.log(d.symbol, d.regularMarketPrice);
    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}

testFetch();
