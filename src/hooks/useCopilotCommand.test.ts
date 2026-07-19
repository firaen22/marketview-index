// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CatalogItem, PresentCommand } from '../../lib/presentCommand';
import { useCopilotCommand } from './useCopilotCommand';

const api = vi.hoisted(() => ({
    sendPresentCommand: vi.fn(),
    clearPresentCommand: vi.fn(),
    fetchProjectorState: vi.fn(),
}));

vi.mock('../presentCommandApi', async () => {
    const actual = await vi.importActual<typeof import('../presentCommandApi')>('../presentCommandApi');
    return {
        ...actual,
        sendPresentCommand: api.sendPresentCommand,
        clearPresentCommand: api.clearPresentCommand,
        fetchProjectorState: api.fetchProjectorState,
    };
});

const { CopilotBar } = await import('../components/CopilotBar');

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG: CatalogItem[] = [{ symbol: '^HSI', name: 'HSI', group: 'market' }];
const CHART_COMMAND: PresentCommand = { v: 1, id: 'c1', kind: 'chart', symbols: ['^HSI'], issuedAt: 1 };
const CLEAR_COMMAND: PresentCommand = { v: 1, id: 'clear1', kind: 'clear', symbols: [], issuedAt: 1 };

let root: Root;
let container: HTMLDivElement;
let mounted: boolean;

function TwoSlotHarness() {
    const [text, setText] = useState('');
    const command = useCopilotCommand();
    return createElement(
        'div',
        null,
        createElement(CopilotBar, { catalog: CATALOG, lang: 'en', text, onTextChange: setText, command }),
        createElement(CopilotBar, { catalog: CATALOG, lang: 'en', text, onTextChange: setText, command }),
    );
}

function SingleSlotHarness() {
    const [text, setText] = useState('');
    const command = useCopilotCommand();
    return createElement(CopilotBar, { catalog: CATALOG, lang: 'en', text, onTextChange: setText, command });
}

async function flush() {
    for (let i = 0; i < 8; i += 1) {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
    }
}

function drafts(): HTMLInputElement[] {
    return Array.from(container.querySelectorAll<HTMLInputElement>('input[placeholder="Ask projector..."]'));
}

const nativeValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

async function typeInto(input: HTMLInputElement, value: string) {
    await act(async () => {
        nativeValueSetter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

function sendButton(slot: number): HTMLButtonElement {
    const sections = container.querySelectorAll('section');
    const button = Array.from(sections[slot].querySelectorAll('button'))
        .find(candidate => candidate.textContent?.trim() === 'Send');
    if (!button) throw new Error('Send button not found in slot ' + slot);
    return button as HTMLButtonElement;
}

function clearButton(slot: number): HTMLButtonElement {
    const sections = container.querySelectorAll('section');
    const button = sections[slot].querySelector<HTMLButtonElement>('button[aria-label="Clear projector"]');
    if (!button) throw new Error('Clear button not found in slot ' + slot);
    return button;
}

function statusTexts(): string[] {
    return Array.from(container.querySelectorAll('section'))
        .map(section => section.lastElementChild?.textContent ?? '');
}

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

async function unmountRoot() {
    if (!mounted) return;
    await act(async () => {
        root.unmount();
    });
    mounted = false;
}

describe('useCopilotCommand shared command lifecycle', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        api.sendPresentCommand.mockReset();
        api.clearPresentCommand.mockReset();
        api.fetchProjectorState.mockReset();
        api.fetchProjectorState.mockResolvedValue({ projector: null, serverTime: 0 });
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        mounted = true;
    });

    afterEach(async () => {
        await unmountRoot();
        container.remove();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('shares sending status across both layout slots', async () => {
        api.sendPresentCommand.mockImplementation(() => new Promise<PresentCommand>(() => {}));

        await act(async () => {
            root.render(createElement(TwoSlotHarness));
        });
        await flush();

        await typeInto(drafts()[0], 'show HSI');
        await click(sendButton(0));
        await flush();

        expect(statusTexts()).toEqual(['Sending...', 'Sending...']);
    });

    it('lets Clear in one slot abort a send started by the other slot', async () => {
        let sendSignal: AbortSignal | null = null;
        const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
        api.sendPresentCommand.mockImplementation((_text, _lang, _catalog, signal: AbortSignal) => {
            sendSignal = signal;
            return new Promise<PresentCommand>((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
            });
        });
        api.clearPresentCommand.mockResolvedValue(CLEAR_COMMAND);

        await act(async () => {
            root.render(createElement(TwoSlotHarness));
        });
        await flush();

        await typeInto(drafts()[0], 'show HSI');
        await click(sendButton(0));
        await flush();
        expect(statusTexts()).toEqual(['Sending...', 'Sending...']);

        await click(clearButton(1));
        await flush();

        expect(abortSpy).toHaveBeenCalled();
        expect(sendSignal?.aborted).toBe(true);
        expect(statusTexts()).toEqual(['Clear', 'Clear']);

        abortSpy.mockRestore();
    });

    // Pins the operation-identity guards. A send that has been superseded (here by a
    // Clear in the OTHER slot) must not write the shared status when it later settles.
    // Its underlying request can fail with a NON-abort error, so the AbortError early
    // return does not cover this. Stripping the `requestControllerRef.current !==
    // controller` guards must make this test fail.
    it('does not let a superseded send clobber the status set by Clear in the other slot', async () => {
        let rejectSend: (e: unknown) => void = () => {};
        api.sendPresentCommand.mockImplementation(() => new Promise<PresentCommand>((_res, reject) => {
            rejectSend = reject;
        }));
        api.clearPresentCommand.mockResolvedValue(CLEAR_COMMAND);

        await act(async () => {
            root.render(createElement(TwoSlotHarness));
        });
        await flush();

        await typeInto(drafts()[0], 'show HSI');
        await click(sendButton(0));
        await flush();
        expect(statusTexts()).toEqual(['Sending...', 'Sending...']);

        // Clear from the OTHER slot supersedes the in-flight send.
        await click(clearButton(1));
        await flush();
        const afterClear = statusTexts().join(' ');
        expect(afterClear).not.toContain('Sending...');

        // The superseded send now fails for an unrelated (non-abort) reason.
        await act(async () => {
            rejectSend(new Error('network blip'));
            await vi.advanceTimersByTimeAsync(0);
        });
        await flush();

        // Status must still be whatever Clear set — the stale send must not overwrite it.
        expect(statusTexts().join(' ')).toBe(afterClear);
    });

    it('preserves the single-slot send behavior', async () => {
        api.sendPresentCommand.mockResolvedValue(CHART_COMMAND);

        await act(async () => {
            root.render(createElement(SingleSlotHarness));
        });
        await flush();

        const [input] = drafts();
        await typeInto(input, 'show HSI');
        await click(sendButton(0));
        await flush();

        expect(api.sendPresentCommand).toHaveBeenCalledWith('show HSI', 'en', CATALOG, expect.anything());
        expect(input.value).toBe('');
        expect(statusTexts()).toEqual(['Chart: HSI']);
    });

    it('cleans up the shared request controller only when the parent unmounts', async () => {
        const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
        api.sendPresentCommand.mockImplementation(() => new Promise<PresentCommand>(() => {}));

        await act(async () => {
            root.render(createElement(TwoSlotHarness));
        });
        await flush();

        expect(abortSpy).not.toHaveBeenCalled();

        await typeInto(drafts()[0], 'show HSI');
        await click(sendButton(0));
        await flush();
        expect(abortSpy).not.toHaveBeenCalled();

        await unmountRoot();

        expect(abortSpy).toHaveBeenCalledTimes(1);

        abortSpy.mockRestore();
    });
});
