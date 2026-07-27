import type { DataMode } from '../hooks/useMarketData';
import type { TDict } from '../locales';

interface DataFreshnessProps {
    mode: DataMode;
    /** Epoch ms the data was generated, or null when the server did not say. */
    lastUpdatedAt: number | null;
    /** Epoch ms "now", passed in so the caller owns the ticking clock. */
    now: number;
    t: TDict;
}

/**
 * Warns that what is on screen is not live.
 *
 * Renders NOTHING for 'live' and 'cached' — the normal steady state must stay
 * uncluttered, or the warning stops meaning anything. Deliberately loud when it
 * does fire: this is viewed from across a room on a 720p projector, where a small
 * grey label is effectively invisible, and the failure it guards against is a
 * client reading frozen prices as current.
 *
 * The age is rendered as a language-neutral compact duration ("12m", "3h") rather
 * than via formatRelativeTime, which emits English-only strings.
 */
function formatAge(ageMs: number): string | null {
    if (!Number.isFinite(ageMs) || ageMs < 0) return null;
    const minutes = Math.floor(ageMs / 60_000);
    if (minutes < 1) return '<1m';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

export function DataFreshness({ mode, lastUpdatedAt, now, t }: DataFreshnessProps) {
    if (mode === 'live' || mode === 'cached') return null;

    const isStale = mode === 'stale';
    const label = isStale ? t.dataFreshness.stale : t.dataFreshness.unavailable;
    const age = lastUpdatedAt === null ? null : formatAge(now - lastUpdatedAt);

    return (
        <span
            role="status"
            aria-live="polite"
            className={[
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded',
                'px-[0.5em] py-[0.25em] font-mono font-bold uppercase tracking-wide',
                'text-[clamp(10px,1.4vmin,20px)] leading-none',
                isStale
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-400/40',
            ].join(' ')}
        >
            <span aria-hidden="true" className={isStale ? 'text-amber-400' : 'text-rose-400'}>⚠</span>
            <span>{label}</span>
            {/*
              * The age is aria-hidden: it re-rounds to a new whole minute for as
              * long as the feed stays degraded, and inside a polite live region
              * every one of those ticks is a fresh announcement of no new state.
              * `label` (stale vs unavailable) is what should announce, and it
              * changes only on a real mode transition.
              */}
            {age !== null && (
                <span aria-hidden="true" className="contents">
                    <span className="opacity-50">·</span>
                    <span className="font-normal">{age}</span>
                </span>
            )}
        </span>
    );
}
