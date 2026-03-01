import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

async function testFetch() {
    const start = Date.now();
    try {
        const symbols = ['^GSPC', '^IXIC', '^DJI', '^VIX'];

        const d1 = new Date();
        d1.setFullYear(d1.getFullYear(), 0, 1);
        const period1 = d1.toISOString().split('T')[0];

        const d2 = new Date();
        const period2 = d2.toISOString().split('T')[0];

        const results = await Promise.all(symbols.map(s =>
            yahooFinance.chart(s, { period1, period2, interval: '1wk' }).catch(err => {
                console.error(`Error fetching ${s}:`, err.message);
                return { quotes: [] };
            })
        ));

        console.log(`Fetched histories in ${Date.now() - start}ms`);
        console.log(results[0].quotes.length);
        console.log(results[0].quotes);
    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}

testFetch();
