const yahooFinance = require('yahoo-finance2').default;

async function test() {
  const result = await yahooFinance.search('CPI', { newsCount: 0, quotesCount: 5 });
  console.log(result.quotes);
}
test().catch(console.error);
