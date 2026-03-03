import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
    const quote = await yahooFinance.quote('0P00000B5V.T').catch(() => null);
    console.log("0P00000B5V.T quote:", quote ? quote.regularMarketPrice : "not found");

    const chart = await yahooFinance.chart('0P00000B5V.T', { period1: '2026-02-01', interval: '1d' }).catch(() => null);
    if (chart && chart.quotes) {
        const valid = chart.quotes.filter(q => q.close !== null);
        console.log("0P00000B5V.T chart last close:", valid.length > 0 ? valid[valid.length - 1].close : "no valid close");
    } else {
        console.log("chart failed");
    }
}
check();
