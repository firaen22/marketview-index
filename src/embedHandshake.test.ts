import { describe, expect, it, vi } from 'vitest';
import {
    MV_CATEGORY,
    MV_PRESENT_PING,
    createIndexEmbedBridgeController,
    embedAnswerPresentPing,
    isPresentPingMessage,
    isPresentReadyMessage,
} from './embedHandshake';

function deliverPingRoundTrip(ctrl: ReturnType<typeof createIndexEmbedBridgeController>) {
    const ping = ctrl.createParentPingMessage();
    expect(ping).not.toBeNull();
    const reply = embedAnswerPresentPing(ping);
    expect(reply).toBe('mv-present-ready');
    ctrl.onParentWindowMessage({ type: reply! });
}

describe('embed present handshake', () => {
    it('missed mv-present-ready recovers on ping, bumps poll, then category posts', () => {
        const bumpPoll = vi.fn();
        const ctrl = createIndexEmbedBridgeController({ bumpPoll });

        expect(ctrl.refs.bridgeReady).toBe(false);
        ctrl.attachListener();
        ctrl.onIframeLoad();
        expect(ctrl.refs.bridgeReady).toBe(false);

        deliverPingRoundTrip(ctrl);

        expect(ctrl.refs.bridgeReady).toBe(true);
        expect(bumpPoll).toHaveBeenCalledTimes(1);

        const msg = ctrl.tryPostCategory('US');
        expect(msg).toEqual({ type: MV_CATEGORY, category: 'US' });
    });

    it('does not open bridge on iframe load alone (no synthetic ready)', () => {
        const bumpPoll = vi.fn();
        const ctrl = createIndexEmbedBridgeController({ bumpPoll });
        ctrl.attachListener();
        ctrl.onIframeLoad();
        expect(ctrl.refs.iframeLoaded).toBe(true);
        expect(ctrl.refs.bridgeReady).toBe(false);
        expect(bumpPoll).not.toHaveBeenCalled();
        expect(ctrl.tryPostCategory('US')).toBeNull();
    });

    it('pre-fix wiring without ping recovery never opens bridge', () => {
        const legacy = createIndexEmbedBridgeController({ bumpPoll: () => {}, pingRecovery: false });
        legacy.attachListener();
        legacy.onIframeLoad();
        expect(legacy.createParentPingMessage()).toBeNull();
        expect(legacy.tryPostCategory('US')).toBeNull();
    });

    it('embed answers mv-present-ping with mv-present-ready', () => {
        expect(isPresentPingMessage({ type: MV_PRESENT_PING })).toBe(true);
        expect(embedAnswerPresentPing({ type: MV_PRESENT_PING })).toBe('mv-present-ready');
        expect(isPresentReadyMessage({ type: 'mv-present-ready' })).toBe(true);
    });
});
