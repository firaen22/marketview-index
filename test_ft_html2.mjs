import https from 'https';

https.get('https://markets.ft.com/data/funds/tearsheet/historical?s=LU0987226296:USD', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    // Try a simpler match for table rows in the historical data table
    const tbodyMatch = data.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g);
    if(tbodyMatch) {
       tbodyMatch.forEach((tb, i) => {
           console.log(`Tbody ${i} length: ${tb.length}`);
           const rows = tb.match(/<tr[^>]*>([\s\S]*?)<\/tr>/g);
           if(rows && rows.length > 5) { // Likely historical table
               console.log(`Found table with ${rows.length} rows`);
               const topRows = rows.slice(0, 3).map(r => {
                   const cells = r.match(/<td[^>]*>([\s\S]*?)<\/td>/g);
                   return cells ? cells.map(c => c.replace(/<[^>]+>/g, '').trim()) : [];
               });
               console.log(topRows);
           }
       });
    }
  });
}).on('error', (err) => console.error(err));
