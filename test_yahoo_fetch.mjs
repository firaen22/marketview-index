import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
    try {
        const quote = await yahooFinance.quote('0P00010NVQ');
        console.log("quote:", quote.regularMarketPrice, quote.regularMarketTime);
        const chart = await yahooFinance.chart('0P00010NVQ', { period1: '2025-01-01', interval: '1d' });
        console.log("chart quotes length:", chart.quotes.length);
        if (chart.quotes.length > 0) {
            console.log("last quote:", chart.quotes[chart.quotes.length - 1]);
        }
    } catch (e) { console.error(e.message) }
}
check();
