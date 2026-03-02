import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
  const symbols = ['0P00000EBQ', '0P00001EVH', '0P00000LV1'];
  try {
    const quotes = await yahooFinance.quote(symbols);
    console.log("Quotes returned:", quotes.map(q => q.symbol));
  } catch(e) {
    console.error("Error:", e.message);
  }
}
check();
