import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

async function checkQuote() {
  try {
    const q1 = await yahooFinance.quote('0P00000EBQ');
    console.log("quote result: ", {
      regularMarketPrice: q1.regularMarketPrice,
      regularMarketTime: q1.regularMarketTime,
      regularMarketPreviousClose: q1.regularMarketPreviousClose
    });
    
    const chart = await yahooFinance.chart('0P00000EBQ', {period1: '2025-01-01', interval: '1d'});
    if(chart.quotes && chart.quotes.length > 0) {
      const last = chart.quotes[chart.quotes.length - 1];
      console.log("chart last result:", {
         close: last.close,
         date: last.date
      });
      console.log("chart meta price:", chart.meta.regularMarketPrice);
    }
  } catch(e) { console.error(e) }
}
checkQuote();
