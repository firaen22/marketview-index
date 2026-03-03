import https from 'https';

https.get('https://markets.ft.com/data/funds/tearsheet/performance?s=IE0034235303:USD', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        // Extract name
        const nameMatch = data.match(/<h1 class="mod-tearsheet-overview__header__name[^>]*>([^<]+)<\/h1>/);
        if (nameMatch) console.log("FT Name:", nameMatch[1].trim());
    });
}).on('error', (err) => console.error(err));
