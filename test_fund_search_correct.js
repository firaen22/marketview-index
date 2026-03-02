import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
  const symbol = '0P00000EBQ.HK';
  try {
    const q1 = await yahooFinance.quote(symbol);
    console.log("quote:", q1.symbol);
  } catch (e) {
    console.error("quote error:", e.message);
  }
}
check();
