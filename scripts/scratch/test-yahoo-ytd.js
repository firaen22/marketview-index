import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function testFetch() {
    try {
        const d = await yahooFinance.chart('^GSPC', { range: 'ytd', interval: '1d' });
        console.log(`Length: ${d.quotes.length}`);
        const firstPrice = d.quotes.find(q => q.close !== null)?.close;
        const currentPrice = d.meta.regularMarketPrice;

        console.log(`First Price (Jan 1ish): ${firstPrice}`);
        console.log(`Current Price: ${currentPrice}`);
        console.log(`YTD %: ${((currentPrice - firstPrice) / firstPrice * 100).toFixed(2)}%`);

        const last20 = d.quotes.slice(-20).map(q => q.close || d.meta.regularMarketPrice);
        console.log('Last 20 points:', last20.slice(-5));
    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}

testFetch();
