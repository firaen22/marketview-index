import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function search() {
    try {
        const result = await yahooFinance.search('Janus Henderson Horizon Global Technology HK');
        console.log("Search Results:", result.quotes.map(q => ({ symbol: q.symbol, name: q.shortname, exchange: q.exchDisp })));
        const res2 = await yahooFinance.search('0P00000EBQ');
        console.log("Search 0P00000EBQ Results:", res2.quotes.map(q => ({ symbol: q.symbol, name: q.shortname })));

        // Test the specific UK ISIN or something? 
        // What if the ticker is different?
        const res3 = await yahooFinance.search('Janus Henderson Horizon Global Technology');
        console.log("Res 3:", res3.quotes.map(q => ({ symbol: q.symbol, name: q.shortname })));
    } catch (e) {
        console.log("Error:", e);
    }
}
search();
