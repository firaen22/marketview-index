import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function test() {
  const symbol = '0P00000EBQ.HK';
  try {
    const quote = await yahooFinance.quote(symbol);
    console.log("Quote exists:", !!quote);
    console.log("Quote price:", quote.regularMarketPrice || quote.price);
    console.log("Quote change:", quote.regularMarketChange);
  } catch (err) {
    console.error("Quote Error:", err.message);
  }

  try {
    const chart = await yahooFinance.chart(symbol, { interval: '1d', period1: '2024-01-01', period2: new Date().toISOString().split('T')[0] });
    console.log("Chart length:", chart.quotes.length);
  } catch (err) {
    console.error("Chart Error:", err.message);
  }
}

test();
