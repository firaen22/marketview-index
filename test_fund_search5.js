import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function search() {
  const result = await yahooFinance.search('Henderson Horizon Fund Global Technology Leaders');
  console.log("Search Results:\n", result.quotes.map(q => `${q.symbol} - ${q.shortname} (${q.exchange})`).join('\n'));
}

search();
