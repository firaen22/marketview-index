import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
    const searchResults = await yahooFinance.search('BlackRock Global Funds World Gold A2');
    console.log("Search 1:");
    searchResults.quotes.forEach(q => console.log(q.symbol, q.longname, q.currency));

    const searchResults2 = await yahooFinance.search('BlackRock Global Funds - World Gold A2');
    console.log("Search 2:", searchResults2.quotes.length);

    const searchResults3 = await yahooFinance.search('BlackRock World Gold A2');
    console.log("Search 3:", searchResults3.quotes.length);

    const searchResults4 = await yahooFinance.search('BGF World Gold A2');
    console.log("Search BGF World Gold A2:");
    searchResults4.quotes.forEach(q => console.log(q.symbol, q.longname, q.currency));

    const searchResults5 = await yahooFinance.search('lu0055631609');
    console.log("Search ISIN:", searchResults5.quotes.length);
}
check();
