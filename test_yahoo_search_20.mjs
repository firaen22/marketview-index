import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function check() {
    const quote = await yahooFinance.quote('0P00000B0I').catch(() => null);
    console.log("0P00000B0I Price:", quote?.regularMarketPrice);
    console.log("0P00000B0I Name:", quote?.longName);
    console.log("0P00000B0I Currency:", quote?.currency);
}
check();
