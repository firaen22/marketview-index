import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function test() {
  const result = await yahooFinance.search('0P0000GOQJ'); // Known working from earlier search
  console.log("Search 0P0000GOQJ Results:", result.quotes.map(q => ({ symbol: q.symbol, name: q.shortname })));

  try {
    const q1 = await yahooFinance.quote('0P0000GOQJ');
    console.log("Quote exists:", !!q1, q1.regularMarketPrice);
  } catch(e) {
    console.error("Quote Error:", e.message);
  }
}
test();
