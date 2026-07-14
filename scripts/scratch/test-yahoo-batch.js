import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function testFetch() {
    const start = Date.now();
    try {
        const symbols = ['^GSPC', '^IXIC', '^DJI', '^VIX', 'DX-Y.NYB', '^HSI', '^N225', '^FTSE', 'BTC-USD', 'ETH-USD', 'CL=F', 'GC=F'];

        // Fetch quotes all at once
        const quotes = await yahooFinance.quote(symbols);

        // Fetch historical data in parallel
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        const period1 = d.toISOString().split('T')[0];

        const histories = await Promise.all(symbols.map(s =>
            yahooFinance.historical(s, { period1, interval: '1d' }).catch(() => [])
        ));

        console.log(`Fetched 12 quotes and 12 histories in ${Date.now() - start}ms`);
    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}

testFetch();
