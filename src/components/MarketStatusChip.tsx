import type { MarketStatus } from '../marketHours';

interface MarketStatusChipProps {
  status: MarketStatus;
  now: number;
  /** Localized phase names; falls back to the raw English phase key. */
  phaseLabels?: Partial<Record<MarketStatus['phase'], string>>;
}

const PHASE_STYLES: Record<MarketStatus['phase'], { dot: string; label: string }> = {
  open: { dot: 'bg-emerald-400', label: 'text-emerald-400' },
  lunch: { dot: 'bg-amber-400', label: 'text-amber-400' },
  closed: { dot: 'bg-zinc-600', label: 'text-zinc-500' },
};

function formatRemaining(remainingMs: number): string {
  if (remainingMs < 60_000) return '<1m';
  const totalMin = Math.ceil(remainingMs / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return `${hours}h ${minutes}m`;
}

export function MarketStatusChip({ status, now, phaseLabels }: MarketStatusChipProps) {
  const styles = PHASE_STYLES[status.phase];
  const remainingMs = Math.max(0, status.nextChangeAt - now);

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px] leading-none">
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden="true" />
      <span className={styles.label}>{status.key}</span>
      <span className="text-zinc-600">·</span>
      <span className="text-zinc-500">{phaseLabels?.[status.phase] ?? status.phase}</span>
      <span className="text-zinc-600">·</span>
      <span className="text-zinc-400">{formatRemaining(remainingMs)}</span>
    </span>
  );
}
