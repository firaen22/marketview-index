import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

async function check() {
  try {
     const quote1 = await yahooFinance.quote('0P00010NVQ');
     console.log("0P00010NVQ quote:", quote1.shortName, quote1.regularMarketPrice);
     
     const chart1 = await yahooFinance.chart('0P00010NVQ', {period1: '2026-02-01', interval: '1d'});
     const valid1 = chart1.quotes.filter(q => q.close !== null);
     console.log("0P00010NVQ last valid close:", valid1[valid1.length-1].close);
  } catch(e) { console.error(e.message) }

  try {
     const quote2 = await yahooFinance.quote('0P0000ZSCT');
     console.log("0P0000ZSCT quote:", quote2.shortName, quote2.regularMarketPrice);

     const chart2 = await yahooFinance.chart('0P0000ZSCT', {period1: '2026-02-01', interval: '1d'});
     const valid2 = chart2.quotes.filter(q => q.close !== null);
     console.log("0P0000ZSCT last valid close:", valid2[valid2.length-1].close);
  } catch(e) { console.error(e.message) }
}
check();
