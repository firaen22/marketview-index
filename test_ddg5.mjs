import fetch from 'node-fetch';

async function search() {
    const query = encodeURIComponent(`"LU0055631609" site:finance.yahoo.com/quote`);
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const text = await response.text();

    // extract URLs from DDG
    const urls = [...text.matchAll(/class="result__url"[^>]*>\s*([^\s<]+)/g)].map(m => m[1]);
    console.log("URLs found:\n", urls.join('\n'));
}
search();
