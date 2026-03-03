import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
    const res = await yahooFinance.search('abrdn Japanese Acc');
    console.log("Search 1:", res.quotes);

    const res2 = await yahooFinance.search('abrdn SICAV Japanese sustainable JPY');
    console.log("Search 2:", res2.quotes);

    const res3 = await yahooFinance.search('AEFY.MU');
    console.log("Search 3 MU:", res3.quotes);

    const res4 = await yahooFinance.search('abrdn Japanese Sustainable Equity');
    console.log("Search 4:", res4.quotes);
}
check();
