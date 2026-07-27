/**
 * Partitions news clusters into "new since your last visit" vs already seen.
 *
 * SEMANTIC DECISION (explicit, revisit deliberately): an item counts as new only
 * when its EARLIEST known timestamp postdates the previous visit. Using a
 * "last updated" time instead would keep a long-running, merely-refreshed story
 * flagged NEW forever, which trains a viewer to stop trusting the badge.
 *
 * DATA CAVEAT this module cannot fix on its own: `NewsItem.time` (api/market-news.ts)
 * falls back to the SERVER'S FETCH TIME when the source article had no parseable
 * publish date. That fallback is indistinguishable from a genuine timestamp once it
 * reaches this function — an undated article would look like it was published
 * exactly when your server happened to fetch it, and would flag NEW on every visit
 * shortly after a refresh. Since this cannot be told apart from real data here, the
 * caller MUST pass only actually-parseable timestamps; unparseable/missing input is
 * treated as "seen" (fail quiet) rather than guessed as new.
 */

export interface NewSinceVisitItem {
  id: string;
  /** ISO timestamp string, or epoch ms. */
  time: string | number;
}

export interface NewSinceVisitResult {
  newIds: Set<string>;
  seenIds: Set<string>;
}

export function computeNewSinceVisit(
  items: readonly NewSinceVisitItem[],
  prevVisitAt: number,
): NewSinceVisitResult {
  const newIds = new Set<string>();
  const seenIds = new Set<string>();

  for (const item of items) {
    const ms = typeof item.time === 'number' ? item.time : Date.parse(item.time);
    const isNew = prevVisitAt > 0 && Number.isFinite(ms) && ms > prevVisitAt;
    (isNew ? newIds : seenIds).add(item.id);
  }

  return { newIds, seenIds };
}

const STORAGE_KEY = 'marketview-news-last-visit';

/** Epoch ms of the previous visit, or 0 ("no known previous visit") if unset/unreadable. */
export function getLastVisitAt(): number {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const ms = raw === null ? 0 : Number(raw);
        return Number.isFinite(ms) && ms > 0 ? ms : 0;
    } catch {
        // Safari private browsing throws on localStorage access.
        return 0;
    }
}

/** Records now as the visit time for next time. Call once per mount, not per render. */
export function recordVisitNow(nowMs: number): void {
    try {
        localStorage.setItem(STORAGE_KEY, String(nowMs));
    } catch {
        // No persistence available; next load falls back to "no known previous visit".
    }
}
