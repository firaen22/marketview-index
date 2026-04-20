import { useEffect, useState } from 'react';

/**
 * Returns the current time as a locale-formatted string, updating once per second.
 * Uses `toLocaleTimeString()` with no args (respects system locale).
 */
export function useClock(intervalMs: number = 1000): string {
    const [clock, setClock] = useState<string>(() => new Date().toLocaleTimeString());
    useEffect(() => {
        const id = setInterval(() => setClock(new Date().toLocaleTimeString()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return clock;
}
