import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
  const symbols = ['0P00000EBQ', '0P00001EVH', '0P00000LV1'];
  const period1 = '2024-01-01';
  const period2 = new Date().toISOString().split('T')[0];
  const rawHistories = await Promise.all(symbols.map(s =>
    yahooFinance.chart(s, { period1, period2, interval: '1d' }).catch((e) => {
        console.log("Chart error for", s, e.message);
        return { quotes: [] };
    })
  ));
  
  rawHistories.forEach((res, i) => {
      console.log(`${symbols[i]} has ${res.quotes.length} quotes`);
  });
}
check();
