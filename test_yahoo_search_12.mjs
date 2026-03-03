import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
    const symsToTry = ['0P00000Z2H', '0P00000A2Z', '0P0000BGFW', '0P00000AWX', '0P0000XRSU', '0P0000AWXX'];
    for (const sym of symsToTry) {
        const q = await yahooFinance.quote(sym).catch(() => null);
        if (q) console.log(sym, q.longName, q.currency);
    }

    const searchResults = await yahooFinance.search('BlackRock World Gold A2 USD');
    console.log("Search A2 USD:", searchResults.quotes);

    const searchResults2 = await yahooFinance.search('BGF World Gold A2 USD');
    console.log("Search BGF:", searchResults2.quotes);

    const searchResults3 = await yahooFinance.search('BlackRock Global Funds World Gold A2 USD');
    console.log("Search BGF World Gold:", searchResults3.quotes);
}
check();
