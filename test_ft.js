const fetch = require('node-fetch');

async function checkFT() {
  try {
    const res = await fetch('https://markets.ft.com/data/funds/tearsheet/performance?s=LU0987226296:USD');
    const text = await res.text();
    console.log("Length of response:", text.length);
    if(text.includes('JPMorgan Funds - Japan Equity Fund JPM Japan Equity C (acc) - USD (hedged)')) {
        console.log("Found title");
    }
    // simple regex to find price
    const match = text.match(/<span class="mod-ui-data-list__value">([0-9\.]+)<\/span>/);
    if(match) {
        console.log("Price:", match[1]);
    }
  } catch(e) { console.error(e); }
}
checkFT();
