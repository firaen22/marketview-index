import { useEffect, useState } from 'react';
import {
    audienceGlossaryPollDelayMs,
    type AudienceGlossarySnapshot,
    toAudienceGlossarySnapshot,
} from '../audienceGlossaryPoll';
import { fetchCurrentGlossaryPointer, fetchPublicGlossarySession } from '../glossaryApi';

export function useAudienceGlossaryPoll(enabled = true) {
    const [snapshot, setSnapshot] = useState<AudienceGlossarySnapshot>({ kind: 'none' });
    const [stale, setStale] = useState(false);

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;
        let misses = 0;
        let errors = 0;
        let timer: number | null = null;

        const schedule = (delayMs: number) => {
            if (cancelled) return;
            timer = window.setTimeout(() => void tick(), delayMs);
        };

        const tick = async () => {
            try {
                const code = await fetchCurrentGlossaryPointer();
                if (cancelled) return;
                if (!code) {
                    misses += 1;
                    errors = 0;
                    setStale(false);
                    setSnapshot({ kind: 'none' });
                    schedule(audienceGlossaryPollDelayMs(misses));
                    return;
                }
                const session = await fetchPublicGlossarySession(code);
                if (cancelled) return;
                if (!session) {
                    misses += 1;
                    errors = 0;
                    setStale(false);
                    setSnapshot({ kind: 'none' });
                    schedule(audienceGlossaryPollDelayMs(misses));
                    return;
                }
                misses = 0;
                errors = 0;
                setStale(false);
                setSnapshot(toAudienceGlossarySnapshot(code, session));
                schedule(audienceGlossaryPollDelayMs(0));
            } catch {
                if (!cancelled) {
                    misses += 1;
                    errors += 1;
                    if (errors >= 3) {
                        setSnapshot({ kind: 'none' });
                        setStale(true);
                    }
                    schedule(audienceGlossaryPollDelayMs(misses));
                }
            }
        };

        void tick();

        return () => {
            cancelled = true;
            if (timer !== null) window.clearTimeout(timer);
        };
    }, [enabled]);

    return { snapshot, stale };
}
