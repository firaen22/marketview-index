import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function search() {
    const res4 = await yahooFinance.search('abrdn SICAV I - Japanese Sustainable Equity');
    console.log("Search 4:", res4.quotes);

    const res5 = await yahooFinance.search('abrdn SICAV I');
    console.log("Search 5:", res5.quotes.slice(0, 5));

    const res6 = await yahooFinance.search('Aberdeen Standard SICAV I - Japanese Equity');
    console.log("Search 6:", res6.quotes.slice(0, 5));
}
search();
