// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../presentCommandApi', () => ({
    authHeaders: () => ({}),
}));

const { usePresentCommand } = await import('./usePresentCommand');

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

function Harness({ onCommand }: { onCommand: () => boolean }) {
    usePresentCommand({ enabled: true, onCommand });
    return null;
}

async function flush() {
    for (let i = 0; i < 8; i += 1) {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
    }
}

describe('usePresentCommand polling', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('recovers when a poll request hangs instead of stalling page delivery forever', async () => {
        // A stalled socket: fetch never settles and never rejects.
        const aborted: boolean[] = [];
        const fetchMock = vi.fn((_url: string, init?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
                aborted.push(true);
                reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
        }));
        vi.stubGlobal('fetch', fetchMock);

        await act(async () => {
            root.render(createElement(Harness, { onCommand: () => true }));
        });
        await flush();

        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Well past a normal poll: without a request timeout nothing happens,
        // because the next poll is only armed after the previous one resolves.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(9000);
        });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Cross the 10s poll timeout: the hung request is aborted...
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        await flush();
        expect(aborted.length).toBeGreaterThan(0);

        // ...and the backoff re-arms the loop, so delivery resumes.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(6000);
        });
        await flush();
        expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    });
});
