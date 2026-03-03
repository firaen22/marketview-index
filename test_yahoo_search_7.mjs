import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
    const res1 = await yahooFinance.search('abrdn Japan Sustainable Eqty A');
    console.log("Search A:");
    res1.quotes.forEach(q => console.log(q.symbol, q.longname, q.currency));

    const res2 = await yahooFinance.search('abrdn Japanese Sustainable Equity A Acc JPY');
    console.log("Search A Acc JPY:", res2.quotes);

    const res3 = await yahooFinance.search('0P00000Z');
    console.log("Guesses:", res3.quotes.length);
}
check();
