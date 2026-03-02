import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
  const symbol = '0P00000EBQ'; // Using the base ticker you found
  try {
    const q1 = await yahooFinance.quote(symbol);
    console.log("quote exists:", !!q1, q1.regularMarketPrice);
    
    // Attempt chart
    const chart = await yahooFinance.chart(symbol, { interval: '1d', period1: '2024-01-01', period2: new Date().toISOString().split('T')[0] });
    console.log("Chart length:", chart.quotes.length);
  } catch(e) {
    console.error("quote/chart error:", e.message);
  }
}
check();
