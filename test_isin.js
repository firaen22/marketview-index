import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
  try {
    const res = await yahooFinance.search('LU0070992663');
    console.log("Search by ISIN (LU0070992663):", res.quotes.map(q => q.symbol + " - " + q.shortname + " (" + q.exchange + ")"));
    
    // Also fetch quote for 0P0000GOQJ to see if there's any ISIN info
    const quote = await yahooFinance.quote('0P0000GOQJ');
    // console.log("Quote keys:", Object.keys(quote));
  } catch(e) {
    console.log(e);
  }
}
check();
