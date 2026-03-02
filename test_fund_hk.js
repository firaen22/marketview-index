import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function test() {
    try {
        const quotes = await yahooFinance.quote(['0P00000EBQ.HK']);
        console.log("Quotes result:", JSON.stringify(quotes, null, 2));
    } catch (e) {
        console.log("Quote array error:", e.message);
    }

    try {
        const quotesSingle = await yahooFinance.quote('0P00000EBQ.HK');
        console.log("Quote single result:", !!quotesSingle, quotesSingle?.symbol);
    } catch (e) {
        console.log("Quote single error:", e.message);
    }
}
test();
