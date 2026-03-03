import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
    const searchResults = await yahooFinance.search('BGF World Gold', { newsCount: 0 });
    console.log("Quotes for BGF World Gold:");
    searchResults.quotes.forEach(q => console.log(q.symbol, q.longname, q.currency));

    const searchResults2 = await yahooFinance.search('BlackRock Global Funds World Gold', { newsCount: 0 });
    console.log("Quotes for BlackRock Global Funds World Gold:");
    searchResults2.quotes.forEach(q => console.log(q.symbol, q.longname, q.currency));

    const searchResults3 = await yahooFinance.search('World Gold Fund', { newsCount: 0 });
    console.log("Quotes for World Gold Fund:");
    searchResults3.quotes.forEach(q => console.log(q.symbol, q.longname, q.currency));
}
check();
