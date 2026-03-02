import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function search() {
  const result = await yahooFinance.search('Henderson Horizon Fund Global Technology Leaders Fund');
  console.log("Search Results:", result.quotes.slice(0, 5).map(q => ({ symbol: q.symbol, name: q.shortname })));
}

search();
