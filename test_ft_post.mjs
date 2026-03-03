import fetch from 'node-fetch';

async function fetchFT() {
    const res = await fetch('https://markets.ft.com/data/chartapi/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            days: 365,
            dataPeriod: 'Day',
            returnDateType: 'ISO8601',
            elements: [{ Type: "price", Symbol: "LU0987226296:USD" }]
        })
    });
    const data = await res.json();
    console.log(JSON.stringify(data).slice(0, 1000));
}
fetchFT();
