import { useMemo, useRef, useState } from 'react';
import { Send, XCircle } from 'lucide-react';
import type { CatalogItem, PresentCommand } from '../../lib/presentCommand';
import { clearPresentCommand, PresentCommandApiError, sendPresentCommand } from '../presentCommandApi';

type Status =
    | { type: 'idle' }
    | { type: 'sending' }
    | { type: 'success'; message: string }
    | { type: 'error'; message: string };

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
    const names = command.symbols.map(symbol => displayForSymbol(symbol, catalog));
    if (command.kind === 'compare') return `Compare: ${names.join(' vs ')}`;
    if (command.kind === 'quote') return `Quote: ${names[0] ?? command.symbols[0]}`;
    return `Chart: ${names[0] ?? command.symbols[0]}`;
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
    const canSend = catalog.length > 0;

    const hint = useMemo(() => {
        if (!canSend) return 'Loading market data…';
        if (status.type === 'sending') return 'Sending...';
        if (status.type === 'success' || status.type === 'error') return status.message;
        return 'Try: show HSI, HSI vs S&P, heatmap';
    }, [canSend, status]);

    const handleSend = async () => {
        if (!canSend) return;
        requestControllerRef.current?.abort();
        const controller = new AbortController();
        requestControllerRef.current = controller;
        setStatus({ type: 'sending' });
        try {
            const command = await sendPresentCommand(text, lang, catalog, controller.signal);
            if (requestControllerRef.current !== controller) return;
            setStatus({ type: 'success', message: commandMessage(command, catalog) });
            setText('');
        } catch (error) {
            if ((error as DOMException).name === 'AbortError') return;
            if (requestControllerRef.current !== controller) return;
            setStatus({ type: 'error', message: errorMessage(error) });
        } finally {
            if (requestControllerRef.current === controller) requestControllerRef.current = null;
        }
    };

    const handleClear = async () => {
        requestControllerRef.current?.abort();
        const controller = new AbortController();
        requestControllerRef.current = controller;
        try {
            const command = await clearPresentCommand(controller.signal);
            if (requestControllerRef.current !== controller) return;
            setStatus({ type: 'success', message: commandMessage(command, catalog) });
        } catch (error) {
            if ((error as DOMException).name === 'AbortError') return;
            if (requestControllerRef.current !== controller) return;
            setStatus({ type: 'error', message: errorMessage(error) });
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
                    disabled={!canSend}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                </button>
                <button
                    onClick={() => void handleClear()}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Clear</span>
                </button>
            </div>
            <div className={`mt-2 text-xs ${status.type === 'error' ? 'text-rose-400' : status.type === 'success' ? 'text-emerald-400' : 'text-zinc-500'}`}>
                {hint}
            </div>
        </section>
    );
}
