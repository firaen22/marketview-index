import fetch from 'node-fetch';

async function testNews() {
  console.log('Testing /api/market-news endpoint...');
  try {
    const res = await fetch('http://localhost:8080/api/market-news?refresh=true');
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

testNews();
