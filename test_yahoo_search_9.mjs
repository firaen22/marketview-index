import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function search() {
    const res1 = await yahooFinance.search('IE0034235303');
    console.log("Search 1:", res1.quotes);

    const res2 = await yahooFinance.search('PineBridge US Research Enhanced Core Equity');
    console.log("Search 2:", res2.quotes);
}
search();
