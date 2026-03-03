import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function search() {
    const res2 = await yahooFinance.search('LU0011963674');
    console.log("Search 2:", res2.quotes);
}
search();
