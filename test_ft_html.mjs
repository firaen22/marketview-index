import https from 'https';

https.get('https://markets.ft.com/data/funds/tearsheet/historical?s=LU0987226296:USD', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    // try to find table data
    const rows = data.match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
    if(rows) {
        // Find rows that look like historical data (date + price)
        const histRows = rows.filter(r => r.includes('<td><span class="mod-ui-table__cell-background"></span>') || r.includes('<td><span class="mod-ui-table__cell-background">'));
        console.log(`Found ${histRows.length} potential historical rows`);
        if(histRows.length > 0) {
            histRows.slice(0, 3).forEach(r => {
                const cells = r.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
                if(cells) {
                    const cleaned = cells.map(c => c.replace(/<[^>]+>/g, '').trim());
                    console.log("Row:", cleaned);
                }
            });
        }
    }
  });
}).on('error', (err) => console.error(err));
