/** postMessage types between `/present` and `/?embed=1`. Keep in sync with Dashboard + PresentationPage. */

export const MV_PRESENT_PING = 'mv-present-ping';
export const MV_PRESENT_READY = 'mv-present-ready';
export const MV_CATEGORY = 'mv-category';

export function isPresentReadyMessage(data: unknown): data is { type: typeof MV_PRESENT_READY } {
    return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === MV_PRESENT_READY;
}

export function isPresentPingMessage(data: unknown): data is { type: typeof MV_PRESENT_PING } {
    return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === MV_PRESENT_PING;
}

export type IndexEmbedBridgeRefs = {
    iframeLoaded: boolean;
    bridgeReady: boolean;
};

export function canPostToIndexEmbed(refs: IndexEmbedBridgeRefs, hasContentWindow: boolean): boolean {
    return hasContentWindow && refs.iframeLoaded && refs.bridgeReady;
}

/** Dashboard embed: answer parent ping with ready (see Dashboard.tsx embed listener). */
export function embedAnswerPresentPing(data: unknown): typeof MV_PRESENT_READY | null {
    return isPresentPingMessage(data) ? MV_PRESENT_READY : null;
}

/** Parent `/present`: mark bridge ready when embed signals (see PresentationPage message listener). */
export function parentHandleEmbedMessage(data: unknown, onReady: () => void): boolean {
    if (!isPresentReadyMessage(data)) return false;
    onReady();
    return true;
}

export type IndexEmbedBridgeControllerOptions = {
    bumpPoll: () => void;
    /** When false, models pre-fix `/present` (no ping recovery). */
    pingRecovery?: boolean;
};

/**
 * Index iframe bridge state — used by PresentationPage and handshake tests.
 * Ready opens only on a received `mv-present-ready` (never synthesized locally).
 */
export function createIndexEmbedBridgeController(options: IndexEmbedBridgeControllerOptions) {
    const refs: IndexEmbedBridgeRefs = { iframeLoaded: false, bridgeReady: false };
    let listenerAttached = false;
    const pingRecovery = options.pingRecovery !== false;

    const markReady = () => {
        refs.bridgeReady = true;
        options.bumpPoll();
    };

    return {
        refs,
        attachListener() {
            listenerAttached = true;
        },
        onParentWindowMessage(data: unknown) {
            if (!listenerAttached) return;
            parentHandleEmbedMessage(data, markReady);
        },
        onIframeLoad() {
            refs.iframeLoaded = true;
        },
        /** Parent posts this into the iframe; embed must answer with `mv-present-ready`. */
        createParentPingMessage(): { type: typeof MV_PRESENT_PING } | null {
            return pingRecovery ? { type: MV_PRESENT_PING } : null;
        },
        tryPostCategory(category: string): { type: typeof MV_CATEGORY; category: string } | null {
            if (!canPostToIndexEmbed(refs, true)) return null;
            return { type: MV_CATEGORY, category };
        },
    };
}
