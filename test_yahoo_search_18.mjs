import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function search() {
    const res1 = await yahooFinance.search('BlackRock World Gold A2', { newsCount: 0 });
    console.log("Search 1:", res1.quotes);

    // query is just standard BGF world gold. Let's try 0P00000AWQ
    try {
        const quote = await yahooFinance.quote('0P00000AWQ');
        console.log("0P00000AWQ:", quote.longName, quote.regularMarketPrice);
    } catch (e) { }
    try {
        const quote = await yahooFinance.quote('0P00000AWH');
        console.log("0P00000AWH:", quote.longName, quote.regularMarketPrice);
    } catch (e) { }
    try {
        const quote = await yahooFinance.quote('0P00000AWX');
        console.log("0P00000AWX:", quote.longName, quote.regularMarketPrice);
    } catch (e) { }
}
search();
