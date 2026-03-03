import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
    const quote = await yahooFinance.quote('0P0000XRSU.T').catch(() => null);
    console.log("0P0000XRSU.T:", quote ? quote.longName : "not found");

    const symsToTry = ['0P0000XRSU', '0P00000AE2', '0P0000A1A2'];
    for (const sym of symsToTry) {
        const q = await yahooFinance.quote(sym).catch(() => null);
        if (q) console.log(sym, q.longName, q.currency);
    }
}
check();
