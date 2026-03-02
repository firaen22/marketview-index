import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function search() {
  const result = await yahooFinance.search('Henderson Horizon');
  console.log("Search Results:", result.quotes.filter(q => q.symbol.includes('.HK')).map(q => ({ symbol: q.symbol, name: q.shortname })));
}

search();
