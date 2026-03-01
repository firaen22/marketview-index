import { Redis } from '@upstash/redis';

try {
    const r = new Redis({
        url: 'UPSTASH_REDIS_REST_URL',
        token: 'some_token'
    });
    console.log('Success');
} catch (e) {
    console.error('Error:', e);
}
