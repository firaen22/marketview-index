import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
  const symbols = ['0P00000EBQ', '0P00001EVH', '0P00000LV1'];
  const period1 = '2025-01-01'; // YTD
  const period2 = new Date().toISOString().split('T')[0];
  
  for (const s of symbols) {
      try {
          const res = await yahooFinance.chart(s, { period1, period2, interval: '1d' });
          console.log(`\n--- ${s} ---`);
          if (res && res.meta) {
              console.log("Meta:", {
                  currency: res.meta.currency,
                  regularMarketPrice: res.meta.regularMarketPrice,
                  chartPreviousClose: res.meta.chartPreviousClose
              });
          }
          if (res && res.quotes && res.quotes.length > 0) {
              const q = res.quotes;
              console.log(`First quote (${q[0].date}): close=${q[0].close}`);
              console.log(`Last quote (${q[q.length-1].date}): close=${q[q.length-1].close}`);
              console.log(`Number of quotes: ${q.length}`);
              // print sample quotes
              for (let i=0; i<3; i++) console.log(`q[${i}]: close=${q[i].close}`);
          }
      } catch (e) {
          console.log("Error:", s, e.message);
      }
  }
}
check();
