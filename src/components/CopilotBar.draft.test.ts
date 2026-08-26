// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CatalogItem, PresentCommand } from '../../lib/presentCommand';
import { useCopilotCommand } from '../hooks/useCopilotCommand';
import { PresentCommandApiError } from '../presentCommandApi';

// Only the network boundary is faked: sendPresentCommand / fetchProjectorState.
// Everything else in CopilotBar (parsing, macros, settings) stays real.
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

const { CopilotBar } = await import('./CopilotBar');

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG: CatalogItem[] = [{ symbol: '^HSI', name: 'HSI', group: 'market' }];
const PAGE_COMMAND: PresentCommand = { v: 1, id: 'p1', kind: 'page', symbols: [], direction: 'next', issuedAt: 1 };

let root: Root;
let container: HTMLDivElement;

// The exact shape PresentationControl.tsx now has: ONE draft state, TWO
// CopilotBar slots (one of which CSS hides at any given breakpoint).
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

// React installs its own `value` property on the input node, so assigning
// `input.value` directly is invisible to React's onChange. Go through the
// native prototype setter, then fire a bubbling input event.
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

function resendButton(slot = 0): HTMLButtonElement | null {
    return Array.from(container.querySelectorAll('section')[slot].querySelectorAll('button'))
        .find(candidate => candidate.textContent?.trim() === 'Resend') as HTMLButtonElement | undefined ?? null;
}

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
}

describe('CopilotBar shared draft across both responsive slots', () => {
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
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        container.remove();
        vi.useRealTimers();
    });

    it('keeps the typed command visible in the other layout slot after a rotation', async () => {
        await act(async () => {
            root.render(createElement(TwoSlotHarness));
        });
        await flush();

        const inputs = drafts();
        // Hiding is not unmounting: PresentationControl keeps both bars mounted
        // and lets CSS (sm:hidden / hidden sm:block) pick which one is visible.
        expect(inputs.length).toBe(2);

        await typeInto(inputs[0], 'compare HSI vs S&P 1Y');
        await flush();

        // Before the fix each bar owned its own useState(''), so rotating the
        // phone revealed the other bar's still-empty input.
        expect(inputs[1].value).toBe('compare HSI vs S&P 1Y');
        expect(inputs[0].value).toBe('compare HSI vs S&P 1Y');
    });

    it('clears the shared draft after a normal send', async () => {
        const command: PresentCommand = { v: 1, id: 'c1', kind: 'chart', symbols: ['^HSI'], issuedAt: 1 };
        api.sendPresentCommand.mockResolvedValue(command);

        await act(async () => {
            root.render(createElement(TwoSlotHarness));
        });
        await flush();

        const inputs = drafts();
        await typeInto(inputs[0], 'show HSI');
        await flush();
        expect(inputs[1].value).toBe('show HSI');

        await click(sendButton(0));
        await flush();

        expect(api.sendPresentCommand).toHaveBeenCalledWith('show HSI', 'en', CATALOG, expect.anything());
        expect(inputs[0].value).toBe('');
        expect(inputs[1].value).toBe('');
    });

    it('does not wipe a newer draft typed while the previous send was still in flight', async () => {
        let resolveSend: ((command: PresentCommand) => void) | null = null;
        api.sendPresentCommand.mockImplementation(() => new Promise<PresentCommand>(resolve => {
            resolveSend = resolve;
        }));

        await act(async () => {
            root.render(createElement(TwoSlotHarness));
        });
        await flush();

        const inputs = drafts();
        await typeInto(inputs[0], 'show HSI');
        await flush();

        await click(sendButton(0));
        await flush();
        expect(resolveSend).not.toBeNull();

        // Presenter rotates the phone and starts the next command in the other
        // slot while the first request is still open.
        await typeInto(inputs[1], 'heatmap');
        await flush();
        expect(inputs[0].value).toBe('heatmap');

        await act(async () => {
            resolveSend!({ v: 1, id: 'c1', kind: 'chart', symbols: ['^HSI'], issuedAt: 1 });
        });
        await flush();

        // Guard against a false pass: prove handleSend really ran its
        // post-await tail (pollAck fires one line above the clear) rather than
        // bailing out at the stale-controller check and never clearing at all.
        expect(api.fetchProjectorState).toHaveBeenCalled();

        // The clear is conditional on the draft still being the text we sent;
        // an unconditional setText('') here would blank the new command.
        expect(inputs[0].value).toBe('heatmap');
        expect(inputs[1].value).toBe('heatmap');
    });

    it('marks an ack timeout unconfirmed, keeps it for 6000ms, and offers resend', async () => {
        const command: PresentCommand = { v: 1, id: 'c-timeout', kind: 'chart', symbols: ['^HSI'], issuedAt: 1 };
        api.sendPresentCommand.mockResolvedValue(command);

        await act(async () => {
            root.render(createElement(TwoSlotHarness));
        });
        await flush();
        await typeInto(drafts()[0], 'show HSI');
        await click(sendButton(0));
        await flush();

        for (let attempt = 0; attempt < 7; attempt += 1) {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1500);
            });
        }

        expect(api.fetchProjectorState).toHaveBeenCalledTimes(8);
        expect(container.querySelectorAll('section')[0].textContent).toContain('Chart: HSI · not confirmed');
        expect(resendButton()).not.toBeNull();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5999);
        });
        expect(resendButton()).not.toBeNull();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(resendButton()).toBeNull();
    });

    it.each([
        ['422', new PresentCommandApiError(422, 'nlu miss'), false],
        ['409', new PresentCommandApiError(409, 'superseded'), false],
        ['network', new Error('network blip'), true],
    ])('sets resend metadata for %s errors only when retriable', async (_label, error, hasResend) => {
        api.sendPresentCommand.mockRejectedValue(error);

        await act(async () => {
            root.render(createElement(SingleSlotHarness));
        });
        await flush();
        await typeInto(drafts()[0], 'show HSI');
        await click(sendButton(0));
        await flush();

        expect(resendButton() !== null).toBe(hasResend);
    });

    it('resends using the stored command text and does not poll page commands', async () => {
        api.sendPresentCommand.mockResolvedValue(PAGE_COMMAND);

        await act(async () => {
            root.render(createElement(SingleSlotHarness));
        });
        await flush();
        await typeInto(drafts()[0], 'next page');
        await click(sendButton(0));
        await flush();

        expect(api.sendPresentCommand).toHaveBeenCalledWith('next page', 'en', CATALOG, expect.anything());
        expect(api.fetchProjectorState).not.toHaveBeenCalled();
        expect(resendButton()).toBeNull();

        api.sendPresentCommand.mockRejectedValueOnce(new Error('network blip'));
        await typeInto(drafts()[0], 'show HSI');
        await click(sendButton(0));
        await flush();
        const resend = resendButton();
        expect(resend).not.toBeNull();
        await click(resend!);
        expect(api.sendPresentCommand).toHaveBeenLastCalledWith('show HSI', 'en', CATALOG, expect.anything());

        api.sendPresentCommand.mockRejectedValueOnce(new Error('page network blip'));
        await typeInto(drafts()[0], 'next page');
        await click(sendButton(0));
        await flush();
        expect(resendButton()).toBeNull();
    });

    it('never renders a resend button for an empty resend text', async () => {
        const command: PresentCommand = { v: 1, id: 'c-empty', kind: 'chart', symbols: ['^HSI'], issuedAt: 1 };
        api.sendPresentCommand.mockResolvedValue(command);

        await act(async () => {
            root.render(createElement(SingleSlotHarness));
        });
        await flush();
        await click(sendButton(0));
        await flush();
        for (let attempt = 0; attempt < 7; attempt += 1) {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1500);
            });
        }

        expect(resendButton()).toBeNull();
    });
});
