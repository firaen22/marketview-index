import { describe, expect, it } from 'vitest';
import { getClientIp } from './clientIp';

function req(headers: Record<string, any>, remoteAddress?: string) {
    return { headers, socket: remoteAddress ? { remoteAddress } : undefined };
}

describe('getClientIp', () => {
    it('prefers x-real-ip (Vercel-stamped, unspoofable)', () => {
        expect(getClientIp(req({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }))).toBe('203.0.113.7');
    });

    it('ignores a spoofed leftmost x-forwarded-for, using the LAST entry', () => {
        // Attacker sends X-Forwarded-For: <spoof>; Vercel appends the real IP last.
        expect(getClientIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }))).toBe('203.0.113.7');
    });

    it('does not let a spoofed header mint fresh buckets per request', () => {
        const a = getClientIp(req({ 'x-forwarded-for': 'aaa.aaa, 203.0.113.7' }));
        const b = getClientIp(req({ 'x-forwarded-for': 'bbb.bbb, 203.0.113.7' }));
        expect(a).toBe(b);
    });

    it('falls back to the socket address when no trusted header is present', () => {
        expect(getClientIp(req({}, '198.51.100.9'))).toBe('198.51.100.9');
    });

    it('returns "unknown" when nothing is available', () => {
        expect(getClientIp(req({}))).toBe('unknown');
    });

    it('trims whitespace around header values', () => {
        expect(getClientIp(req({ 'x-real-ip': '  203.0.113.7  ' }))).toBe('203.0.113.7');
    });
});
