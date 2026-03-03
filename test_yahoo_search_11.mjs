import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function search() {
    const res1 = await yahooFinance.search('BlackRock World Gold A2');
    console.log("Search 1:", res1.quotes);

    const res2 = await yahooFinance.search('BlackRock Global Funds - World Gold Fund A2');
    console.log("Search 2:", res2.quotes);

    const query = '0P0000K1X8';
    const res3 = await yahooFinance.quote(query).catch(() => null);
    if (res3) console.log(query, res3.longName, res3.currency);
}
search();
