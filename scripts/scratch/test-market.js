import 'dotenv/config';
import { default as handler } from '../api/market-news.js';

async function run() {
    process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
    process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    const req = { url: 'http://localhost/api/market-news?refresh=true', headers: { host: 'localhost' }};
    const res = {
        setHeader: () => {},
        status: (code) => ({
            json: (data) => console.log(`Status: ${code}, Data:`, JSON.stringify(data, null, 2))
        })
    };
    
    await handler(req, res);
}
run();
