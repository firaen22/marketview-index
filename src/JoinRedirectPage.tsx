import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio } from 'lucide-react';
import { getLocale } from './locales';

// The permanent-QR waiting room. Scanning /j with no live session lands here;
// we poll /api/join?format=json and hop to /session/:code the moment the
// presenter starts one. This page must never navigate to /api/join itself —
// that would bounce straight back here in a redirect loop.
const POLL_MS = 5000;
const SLOW_POLL_MS = 15000;
// After this many consecutive misses (~25s of no session), back off to the
// slow interval so a poster scanned overnight doesn't hammer the endpoint.
const SLOW_AFTER_MISSES = 5;
const JOIN_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{8}$/;

export default function JoinRedirectPage() {
    const navigate = useNavigate();
    const [redirecting, setRedirecting] = useState(false);
    const missesRef = useRef(0);
    // Both languages at once: the scanner's language preference is unknown at
    // this point, matching the bilingual copy convention on the projector.
    const zh = getLocale('zh-TW').glossary.joinWait;
    const en = getLocale('en').glossary.joinWait;

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const poll = async () => {
            let code: string | null = null;
            try {
                const res = await fetch('/api/join?format=json', { cache: 'no-store' });
                if (res.ok) {
                    const body = await res.json();
                    if (typeof body?.code === 'string' && JOIN_CODE_PATTERN.test(body.code)) {
                        code = body.code;
                    }
                }
            } catch {
                // Network error counts as a miss; keep polling.
            }
            if (cancelled) return;
            if (code) {
                setRedirecting(true);
                navigate(`/session/${code}`, { replace: true });
                return;
            }
            missesRef.current += 1;
            // Jitter so a room full of phones doesn't sync into one burst.
            const base = missesRef.current >= SLOW_AFTER_MISSES ? SLOW_POLL_MS : POLL_MS;
            timer = setTimeout(poll, base + Math.random() * 1000);
        };

        void poll();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [navigate]);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center">
            <Radio className="mb-6 h-10 w-10 animate-pulse text-emerald-400" aria-hidden="true" />
            {redirecting ? (
                <p className="text-lg text-zinc-200">{zh.redirecting}<br />{en.redirecting}</p>
            ) : (
                <>
                    <h1 className="mb-3 text-xl font-semibold text-zinc-100">{zh.title}</h1>
                    <p className="mb-6 max-w-md text-sm leading-relaxed text-zinc-400">{zh.body}</p>
                    <h2 className="mb-3 text-lg font-medium text-zinc-300">{en.title}</h2>
                    <p className="max-w-md text-sm leading-relaxed text-zinc-500">{en.body}</p>
                </>
            )}
        </div>
    );
}
