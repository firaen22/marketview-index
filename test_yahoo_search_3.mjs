import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function search() {
   const res = await yahooFinance.search('abrdn SICAV I - Japanese Sustainable Equity Fund A Acc JPY');
   console.log("Search 1:", res.quotes);
   const res2 = await yahooFinance.search('abrdn SICAV Japanese Sustainable Equity JPY');
   console.log("Search 2:", res2.quotes);
   const res3 = await yahooFinance.search('AEF3.F');
   console.log("Search 3 AEFF3:", res3.quotes);
}
search();
