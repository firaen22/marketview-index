import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function search() {
   // Try with some variations of "JPM Europe Dynamic A acc USD"
   const res1 = await yahooFinance.search('JPM Europe Dynamic A acc USD');
   console.log("Search 1:", res1.quotes.map(q => q.symbol));

   const res2 = await yahooFinance.search('LU0987226296');
   console.log("Search 2:", res2.quotes.map(q => q.symbol));
}
search();
