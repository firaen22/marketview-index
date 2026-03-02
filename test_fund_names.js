import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function verify() {
    const symbols = ['0P00001EVH', '0P00000LV1'];
    for (const sym of symbols) {
        try {
            const q = await yahooFinance.quote(sym);
            console.log(`[${sym}] Found: ${q.shortname} / Price: ${q.regularMarketPrice}`);
        } catch (e) {
            console.log(`[${sym}] Error: ${e.message}`);
        }
    }
}
verify();
