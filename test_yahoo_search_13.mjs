import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
    const searchResults = await yahooFinance.search('BlackRock World Gold');
    console.log("Search BlackRock World Gold:");
    searchResults.quotes.forEach(q => console.log(q.symbol, q.longname, q.currency));
}
check();
