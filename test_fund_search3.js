import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function search() {
  const result = await yahooFinance.search('Henderson Global Technology');
  console.log("Search Results:", result.quotes.map(q => ({ symbol: q.symbol, name: q.shortname })));
}

search();
