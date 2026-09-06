/** Step through a spotlight cycle list. Returns null when there is nowhere to go —
 *  a list shorter than two entries, or a current id that is not in the list — so
 *  callers can swallow the gesture instead of jumping to an unrelated card. */
export function nextSpotlightItem<T extends { id: string }>(
    list: readonly T[] | null | undefined,
    currentId: string,
    direction: 'forward' | 'back'
): T | null {
    if (!Array.isArray(list) || list.length < 2) {
        return null;
    }

    const currentIndex = list.findIndex(item => item.id === currentId);
    if (currentIndex === -1) {
        return null;
    }

    if (direction === 'back') {
        return list[(currentIndex - 1 + list.length) % list.length];
    }

    // Any other value (including 'forward') steps forward.
    return list[(currentIndex + 1) % list.length];
}
