// Client IP for per-IP rate-limit buckets. On Vercel the LEFTMOST x-forwarded-for
// entry is caller-supplied, so an attacker can rotate a spoofed X-Forwarded-For to
// mint a fresh bucket per request and defeat the limiter. Trust only sources the
// platform stamps: x-real-ip (Vercel sets it to the true client IP), then the LAST
// x-forwarded-for entry (appended by the trusted edge proxy), then the socket.
// Never key a limiter on the first x-forwarded-for entry.
export function getClientIp(req: any): string {
    const realIp = req.headers?.['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();

    const forwardedFor = req.headers?.['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        const parts = forwardedFor.split(',');
        const last = parts[parts.length - 1].trim();
        if (last) return last;
    }

    return req.socket?.remoteAddress || 'unknown';
}
