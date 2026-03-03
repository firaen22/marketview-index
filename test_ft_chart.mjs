import https from 'https';

https.get('https://markets.ft.com/data/chartapi/series', (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => console.log(data.slice(0, 500)));
});
