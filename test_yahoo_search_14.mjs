import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
    const quote = await yahooFinance.quote('BGWG.SW').catch(() => null);
    console.log("BGWG.SW:", quote ? quote.longName : 'Not found', quote?.currency);

    const symsToTry = ['0P00000BGF', '0P00000WGF', '0P00000WGD', '0P0000A2US', '0P00000ALX'];
    for (const sym of symsToTry) {
        const q = await yahooFinance.quote(sym).catch(() => null);
        if (q) console.log(sym, q.longName, q.currency);
    }
}
check();
