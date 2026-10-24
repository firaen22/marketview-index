export const PRESENT_INDEX_DENSITIES = ['auto', 'comfortable', 'compact'] as const;
export type PresentIndexDensity = typeof PRESENT_INDEX_DENSITIES[number];

/** Remote API: enter/exit only. Local F button may still toggle. */
export const PRESENT_FULLSCREEN_MODES = ['enter', 'exit'] as const;
export type PresentFullscreenMode = typeof PRESENT_FULLSCREEN_MODES[number];

export type ResolvedIndexDensity = 'comfortable' | 'compact';

export function isPresentIndexDensity(value: unknown): value is PresentIndexDensity {
    return typeof value === 'string' && (PRESENT_INDEX_DENSITIES as readonly string[]).includes(value);
}

export function isPresentFullscreenMode(value: unknown): value is PresentFullscreenMode {
    return typeof value === 'string' && (PRESENT_FULLSCREEN_MODES as readonly string[]).includes(value);
}

/** Match preflight embed column guidance (`fw < 960` → denser grid). */
export function resolvePresentIndexDensity(
    density: PresentIndexDensity,
    embedWidth?: number,
): ResolvedIndexDensity {
    if (density === 'comfortable') return 'comfortable';
    if (density === 'compact') return 'compact';
    if (embedWidth !== undefined && embedWidth < 960) return 'compact';
    return 'comfortable';
}
