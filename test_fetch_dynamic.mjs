import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
  try {
     console.log("Checking 0P00010NVQ...");
     const chart = await yahooFinance.chart('0P00010NVQ', {period1: '2025-01-01', interval: '1d'});
     if(chart.quotes.length > 0) {
        const last = chart.quotes[chart.quotes.length-1];
        console.log("last quote length & info:", chart.quotes.length, last);
     }
  } catch(e) { console.error(e.message) }

  try {
     console.log("\nChecking 0P0000ZSCT...");
     const chart = await yahooFinance.chart('0P0000ZSCT', {period1: '2025-01-01', interval: '1d'});
     if(chart.quotes.length > 0) {
        const last = chart.quotes[chart.quotes.length-1];
        console.log("last quote length & info:", chart.quotes.length, last);
     }
  } catch(e) { console.error(e.message) }
}
check();
