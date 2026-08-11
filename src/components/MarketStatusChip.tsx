import type { MarketStatus } from '../marketHours';

interface MarketStatusChipProps {
  status: MarketStatus;
  now: number;
  /** Localized phase names; falls back to the raw English phase key. */
  phaseLabels?: Partial<Record<MarketStatus['phase'], string>>;
}

/**
 * Colours are contrast-gated against the projector background — see
 * src/contrast.test.ts. `closed` was zinc-600/zinc-500 (2.58:1 dot, 4.12:1 label),
 * below WCAG's 3.0 floor for non-text indicators and 4.5 for text respectively;
 * on a dim projector the closed dot was effectively invisible rather than merely
 * subdued. Raised one step each, which still reads far quieter than `open`.
 *
 * NOTE: these style the market KEY ("HK"), not the phase word — the phase word
 * and countdown are neutral zinc-400 so the phase colour reads as one signal
 * rather than three. contrast.test.ts gates every text class this file renders.
 */
const PHASE_STYLES: Record<MarketStatus['phase'], { dot: string; label: string }> = {
  open: { dot: 'bg-emerald-400', label: 'text-emerald-400' },
  lunch: { dot: 'bg-amber-400', label: 'text-amber-400' },
  closed: { dot: 'bg-zinc-500', label: 'text-zinc-400' },
  holiday: { dot: 'bg-sky-400', label: 'text-sky-400' },
};

// Every bucket floors, so the countdown steps through one whole minute at a time.
// `Math.ceil` here made the "1m" bucket exactly one millisecond wide: the chip is
// re-rendered off a 10s clock, so 60_000ms was never sampled and the projector
// countdown jumped 2m -> <1m. Flooring also keeps the h/m and d/h branches below
// honest, since they already floor.
function formatRemaining(remainingMs: number): string {
  if (remainingMs < 60_000) return '<1m';
  const totalMin = Math.floor(remainingMs / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const totalHours = Math.floor(totalMin / 60);
  // Holiday closures span days; "72h 0m" is unreadable across a room.
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  return `${totalHours}h ${totalMin % 60}m`;
}

export function MarketStatusChip({ status, now, phaseLabels }: MarketStatusChipProps) {
  const styles = PHASE_STYLES[status.phase];
  const remainingMs = Math.max(0, status.nextChangeAt - now);
  const phaseLabel = phaseLabels?.[status.phase] ?? status.phase;
  const remaining = formatRemaining(remainingMs);

  return (
    // role="status" makes this a polite live region. Its announced content is
    // its own accessible text, so the ticking countdown is aria-hidden: it
    // re-rounds every minute and, across four always-mounted chips, would
    // interrupt a screen reader repeatedly to report no new state. What is left
    // in the tree ("HK closed") changes only on a real phase transition.
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[0.625rem] leading-none"
      role="status"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />
      <span className={styles.label}>{status.key}</span>
      <span className="text-zinc-600" aria-hidden="true">·</span>
      <span className="text-zinc-400">{phaseLabel}</span>
      <span className="text-zinc-600" aria-hidden="true">·</span>
      <span className="text-zinc-400" aria-hidden="true">{remaining}</span>
    </span>
  );
}
