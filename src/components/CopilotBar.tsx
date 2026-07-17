import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, XCircle } from 'lucide-react';
import type { CatalogItem, PresentCommand } from '../../lib/presentCommand';
import { clearPresentCommand, PresentCommandApiError, sendPresentCommand } from '../presentCommandApi';

type Status =
    | { type: 'idle' }
    | { type: 'sending' }
    | { type: 'success'; message: string }
    | { type: 'error'; message: string };

const QUICK_COMMANDS = [
    { label: 'HSI', cmd: 'show HSI' },
    { label: 'HSI vs S&P', cmd: 'HSI vs S&P' },
    { label: 'Heatmap', cmd: 'heatmap' },
    { label: 'Dashboard', cmd: 'dashboard' },
];

interface Props {
    catalog: CatalogItem[];
    lang: 'en' | 'zh-TW';
}

function displayForSymbol(symbol: string, catalog: CatalogItem[]): string {
    const item = catalog.find(entry => entry.symbol === symbol);
    return item?.name || item?.nameEn || symbol;
}

function commandMessage(command: PresentCommand, catalog: CatalogItem[]): string {
    if (command.kind === 'clear') return 'Clear';
    if (command.kind === 'view') return `View: ${command.view}`;
    if (command.kind === 'goto') return `Page: ${command.page}`;
    if (command.kind === 'jargon') return `Jargon: ${command.on ? 'on' : 'off'}`;
    if (command.kind === 'cycle') return `Auto-cycle: ${command.on ? 'on' : 'off'}${command.dwellSec !== undefined ? ` · ${command.dwellSec}s` : ''}`;
    if (command.kind === 'range') return `Range: ${command.range}`;
    const names = command.symbols.map(symbol => displayForSymbol(symbol, catalog));
    const rangeSuffix = command.range ? ` · ${command.range}` : '';
    if (command.kind === 'compare') return `Compare: ${names.join(' vs ')}${rangeSuffix}`;
    if (command.kind === 'quote') return `Quote: ${names[0] ?? command.symbols[0]}`;
    return `Chart: ${names[0] ?? command.symbols[0]}${rangeSuffix}`;
}

function errorMessage(error: unknown): string {
    if (error instanceof PresentCommandApiError && error.status === 422) {
        return "Couldn't understand — try e.g. 'HSI vs S&P'";
    }
    if (error instanceof PresentCommandApiError) {
        return 'Command failed — try again';
    }
    return 'Timed out — try again';
}

export function CopilotBar({ catalog, lang }: Props) {
    const [text, setText] = useState('');
    const [status, setStatus] = useState<Status>({ type: 'idle' });
    // One controller for BOTH send and clear: they write the same server-side
    // command slot (last-writer-wins), so a quick Clear must abort a slower
    // in-flight Send or the stale Send can land after it and re-open the
    // overlay the presenter just cleared.
    const requestControllerRef = useRef<AbortController | null>(null);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const canSend = catalog.length > 0;

    const clearDismissTimer = () => {
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }
    };

    const setDismissibleStatus = (nextStatus: Extract<Status, { type: 'success' | 'error' }>) => {
        const delay = nextStatus.type === 'success' ? 3000 : 6000;
        setStatus(nextStatus);
        dismissTimerRef.current = setTimeout(() => {
            setStatus(current => current === nextStatus ? { type: 'idle' } : current);
            dismissTimerRef.current = null;
        }, delay);
    };

    useEffect(() => () => {
        clearDismissTimer();
    }, []);

    const hint = useMemo(() => {
        if (!canSend) return 'Loading market data…';
        if (status.type === 'sending') return 'Sending...';
        if (status.type === 'success' || status.type === 'error') return status.message;
        return 'Try: show HSI, page 5, HSI 1Y, jargon on';
    }, [canSend, status]);

    const handleSend = async (overrideText?: string) => {
        if (!canSend) return;
        clearDismissTimer();
        requestControllerRef.current?.abort();
        const controller = new AbortController();
        requestControllerRef.current = controller;
        const commandText = overrideText ?? text;
        setStatus({ type: 'sending' });
        try {
            const command = await sendPresentCommand(commandText, lang, catalog, controller.signal);
            if (requestControllerRef.current !== controller) return;
            setDismissibleStatus({ type: 'success', message: commandMessage(command, catalog) });
            navigator.vibrate?.(30);
            if (overrideText === undefined) setText('');
        } catch (error) {
            if ((error as DOMException).name === 'AbortError') return;
            if (requestControllerRef.current !== controller) return;
            setDismissibleStatus({ type: 'error', message: errorMessage(error) });
        } finally {
            if (requestControllerRef.current === controller) requestControllerRef.current = null;
        }
    };

    const handleClear = async () => {
        clearDismissTimer();
        requestControllerRef.current?.abort();
        const controller = new AbortController();
        requestControllerRef.current = controller;
        try {
            const command = await clearPresentCommand(controller.signal);
            if (requestControllerRef.current !== controller) return;
            setDismissibleStatus({ type: 'success', message: commandMessage(command, catalog) });
            navigator.vibrate?.(30);
        } catch (error) {
            if ((error as DOMException).name === 'AbortError') return;
            if (requestControllerRef.current !== controller) return;
            setDismissibleStatus({ type: 'error', message: errorMessage(error) });
        } finally {
            if (requestControllerRef.current === controller) requestControllerRef.current = null;
        }
    };

    return (
        <section className="px-4 sm:px-6 py-3 border-b border-zinc-900 bg-zinc-950 shrink-0">
            <div className="flex items-stretch gap-2">
                <input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleSend();
                        }
                    }}
                    placeholder="Ask projector..."
                    className="min-w-0 flex-1 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
                    style={{ fontSize: '16px' }}
                />
                <button
                    onClick={() => void handleSend()}
                    disabled={!canSend || status.type === 'sending'}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                </button>
                <button
                    onClick={() => void handleClear()}
                    title="Clear projector"
                    aria-label="Clear projector"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-w-[44px] min-h-[44px] rounded-lg text-xs font-semibold bg-zinc-900 border border-rose-900/60 text-rose-300 hover:bg-rose-950/50"
                >
                    <XCircle className="w-3.5 h-3.5" />
                </button>
            </div>
            <div className="flex gap-2 overflow-x-auto mt-2">
                {QUICK_COMMANDS.map(chip => (
                    <button
                        key={chip.cmd}
                        type="button"
                        onClick={() => void handleSend(chip.cmd)}
                        disabled={!canSend}
                        className="whitespace-nowrap shrink-0 px-3 py-1.5 rounded-full text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 active:bg-zinc-700 min-h-[36px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {chip.label}
                    </button>
                ))}
            </div>
            <div className={`mt-2 text-xs ${status.type === 'error' ? 'text-rose-400' : status.type === 'success' ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {hint}
            </div>
        </section>
    );
}
