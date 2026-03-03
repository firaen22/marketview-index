import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
    const quote = await yahooFinance.quote('0P0001BVMU').catch(() => null);
    console.log("0P0001BVMU:", quote ? quote.longName : 'Not found', quote?.currency);
}
check();
