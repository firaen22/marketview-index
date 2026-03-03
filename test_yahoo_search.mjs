import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function search() {
    const res = await yahooFinance.search('LU0987226296');
    console.log("Search result:", JSON.stringify(res.quotes, null, 2));
}
search();
