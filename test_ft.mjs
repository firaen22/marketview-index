import https from 'https';

https.get('https://markets.ft.com/data/funds/tearsheet/performance?s=LU0987226296:USD', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log("Length of response:", data.length);
        const priceMatch = data.match(/<span class="mod-ui-data-list__value">([0-9\.]+)<\/span>/);
        if (priceMatch) console.log("Price:", priceMatch[1]);

        // Extract name
        const nameMatch = data.match(/<h1 class="mod-tearsheet-overview__header__name[^>]*>([^<]+)<\/h1>/);
        if (nameMatch) console.log("Name:", nameMatch[1].trim());

        // Extract price change
        const changeMatch = data.match(/<span class="mod-ui-data-list__value[^>]*>([-+0-9\.]+)<\/span><span class="mod-ui-data-list__additional">([^<]+)<\/span>/g);
        console.log("Change Matches:", changeMatch?.slice(0, 3));
    });
}).on('error', (err) => console.error(err));
