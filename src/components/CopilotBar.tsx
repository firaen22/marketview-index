import { useMemo, useState } from 'react';
import { Edit2, Send, Trash2, XCircle } from 'lucide-react';
import type { CatalogItem, PresentCommand } from '../../lib/presentCommand';
import { clearPresentCommand, fetchProjectorState, PresentCommandApiError, sendPresentCommand } from '../presentCommandApi';
import { findMacro, resolveMacros, runMacro, validateMacroDraft, type Macro } from '../copilotMacros';
import { getSetting, setSetting } from '../settings';
import type { CopilotCommandLifecycle, Status } from '../hooks/useCopilotCommand';

export const QUICK_COMMANDS = [
    { label: 'HSI', cmd: 'show HSI' },
    { label: 'HSI vs S&P', cmd: 'HSI vs S&P' },
    { label: 'Heatmap', cmd: 'heatmap' },
    { label: 'Dashboard', cmd: 'dashboard' },
];

interface Props {
    catalog: CatalogItem[];
    lang: 'en' | 'zh-TW';
    // Owned by PresentationControl, not here: the bar renders in two layout slots
    // and CSS hides one, so a per-instance draft desyncs across the responsive
    // breakpoint — rotating a phone mid-sentence blanked the typed command.
    // Required (not optional) so tsc forces any future slot to opt in.
    text: string;
    onTextChange: React.Dispatch<React.SetStateAction<string>>;
    // Owned by PresentationControl, not here: both layout slots stay mounted
    // while CSS hides one, so per-instance status/controllers desync across the
    // breakpoint and Clear cannot abort the hidden slot's in-flight command.
    // Required (not optional) so tsc forces any future slot to opt in.
    command: CopilotCommandLifecycle;
}

function displayForSymbol(symbol: string, catalog: CatalogItem[]): string {
    const item = catalog.find(entry => entry.symbol === symbol);
    return item?.name || item?.nameEn || symbol;
}

function commandMessage(command: PresentCommand, catalog: CatalogItem[]): string {
    if (command.kind === 'clear') return 'Clear';
    if (command.kind === 'page') return command.direction === 'next' ? 'Page: next' : 'Page: prev';
    if (command.kind === 'view') return `View: ${command.view}`;
    if (command.kind === 'goto') return `Page: ${command.page}`;
    if (command.kind === 'jargon') return `Jargon: ${command.on ? 'on' : 'off'}`;
    if (command.kind === 'cycle') return `Auto-cycle: ${command.on ? 'on' : 'off'}${command.dwellSec !== undefined ? ` · ${command.dwellSec}s` : ''}`;
    if (command.kind === 'range') return `Range: ${command.range}`;
    if (command.kind === 'explain') return `Explain: ${command.term}`;
    if (command.kind === 'highlight') return `Highlight: ${displayForSymbol(command.symbols[0], catalog)}`;
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
    if (error instanceof PresentCommandApiError && error.status === 409) {
        return 'Skipped — a newer command already took over';
    }
    if (error instanceof PresentCommandApiError) {
        return 'Command failed — try again';
    }
    return 'Timed out — try again';
}

export function CopilotBar({ catalog, lang, text, onTextChange: setText, command }: Props) {
    const {
        status,
        setStatus,
        requestControllerRef,
        ackControllerRef,
        macroControllerRef,
        dismissTimerRef,
        clearDismissTimer,
        abortAck,
        abortMacro,
    } = command;
    const [customMacros, setCustomMacros] = useState<Macro[]>(() => getSetting('copilotMacros'));
    const [editing, setEditing] = useState(false);
    const [editingName, setEditingName] = useState('');
    const [macroName, setMacroName] = useState('');
    const [macroSteps, setMacroSteps] = useState('');
    const canSend = catalog.length > 0;
    const macros = useMemo(() => resolveMacros(customMacros), [customMacros]);

    const setDismissibleStatus = (nextStatus: Extract<Status, { type: 'success' | 'error' }>) => {
        const delay = nextStatus.type === 'success' ? 3000 : 6000;
        setStatus(nextStatus);
        dismissTimerRef.current = setTimeout(() => {
            setStatus(current => current === nextStatus ? { type: 'idle' } : current);
            dismissTimerRef.current = null;
        }, delay);
    };

    const pollAck = (command: PresentCommand, message: string) => {
        abortAck();
        const controller = new AbortController();
        ackControllerRef.current = controller;
        let attempts = 0;
        const tick = async () => {
            attempts += 1;
            try {
                const result = await fetchProjectorState(controller.signal);
                if (controller.signal.aborted) return;
                if (result.projector?.lid === command.id) {
                    if (ackControllerRef.current !== controller) return;
                    ackControllerRef.current = null;
                    setDismissibleStatus({ type: 'success', message, confirmed: true });
                    return;
                }
            } catch (error) {
                if ((error as DOMException).name === 'AbortError') return;
            }
            if (attempts >= 8) {
                if (ackControllerRef.current !== controller) return;
                ackControllerRef.current = null;
                setDismissibleStatus({ type: 'success', message });
                return;
            }
            setTimeout(tick, 1500);
        };
        void tick();
    };

    const hint = useMemo(() => {
        if (!canSend) return 'Loading market data…';
        if (status.type === 'sending') return 'Sending...';
        if (status.type === 'macro') return `Macro ${status.name}: ${status.step}/${status.total}`;
        if (status.type === 'success' || status.type === 'error') return status.message;
        return 'Try: show HSI, page 5, HSI 1Y, jargon on';
    }, [canSend, status]);

    const handleRunMacro = async (macro: Macro) => {
        if (!canSend) return;
        clearDismissTimer();
        abortAck();
        abortMacro();
        requestControllerRef.current?.abort();
        const controller = new AbortController();
        requestControllerRef.current = controller;
        macroControllerRef.current = controller;
        setStatus({ type: 'macro', name: macro.name, step: 0, total: macro.steps.length });
        const result = await runMacro(
            macro,
            step => sendPresentCommand(step, lang, catalog, controller.signal),
            (step, total) => {
                if (requestControllerRef.current === controller) setStatus({ type: 'macro', name: macro.name, step, total });
            },
            controller.signal,
        );
        if (requestControllerRef.current !== controller) return;
        setDismissibleStatus({ type: 'success', message: `Macro ${macro.name}: ${result.completed}/${macro.steps.length}`, failed: result.failed > 0 });
        requestControllerRef.current = null;
        macroControllerRef.current = null;
    };

    const handleSend = async (overrideText?: string) => {
        if (!canSend) return;
        clearDismissTimer();
        abortAck();
        abortMacro();
        requestControllerRef.current?.abort();
        const commandText = overrideText ?? text;
        const macro = overrideText === undefined ? findMacro(commandText, macros) : null;
        if (macro) {
            await handleRunMacro(macro);
            // Clear only if the draft is still the one we sent. The draft is now
            // shared across both layout slots, so an unconditional clear after an
            // await lets the hidden slot wipe a command the presenter typed into
            // the visible one after crossing the breakpoint.
            setText(current => current === commandText ? '' : current);
            return;
        }
        const controller = new AbortController();
        requestControllerRef.current = controller;
        setStatus({ type: 'sending' });
        try {
            const command = await sendPresentCommand(commandText, lang, catalog, controller.signal);
            if (requestControllerRef.current !== controller) return;
            const message = commandMessage(command, catalog);
            setStatus({ type: 'success', message });
            // `page` commands ride the drained queue, which never writes the
            // projector's `lid` — so their ack can never arrive, and polling for
            // it just burns 8 projector-state requests against the poll rate
            // limit on the single most frequent command in a presentation.
            if (command.kind !== 'page') pollAck(command, message);
            navigator.vibrate?.(30);
            // Conditional for the same reason as the macro branch above.
            if (overrideText === undefined) setText(current => current === commandText ? '' : current);
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
        abortAck();
        abortMacro();
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

    const saveMacro = () => {
        const draft = validateMacroDraft(macroName, macroSteps.split('\n'), {
            catalog,
            quickLabels: QUICK_COMMANDS.map(command => command.label),
            existingMacros: customMacros,
            editingName,
        });
        if (!('macro' in draft)) {
            const message = draft.message;
            setStatus({ type: 'error', message });
            return;
        }
        const kept = customMacros.filter(macro => {
            const lower = macro.name.toLowerCase();
            return lower !== draft.macro.name.toLowerCase() && lower !== editingName.toLowerCase();
        });
        // The old `[...kept, draft.macro].slice(0, 12)` trimmed from the END, so
        // at the cap it silently threw away the macro just written and still
        // reported "Macro saved". Refuse instead of lying.
        if (kept.length >= 12) {
            setStatus({ type: 'error', message: 'Macro limit reached (12) — delete one first' });
            return;
        }
        const next = [...kept, draft.macro];
        setCustomMacros(next);
        setSetting('copilotMacros', next);
        setEditing(false);
        setEditingName('');
        setMacroName('');
        setMacroSteps('');
        setDismissibleStatus({ type: 'success', message: `Macro saved: ${draft.macro.name}` });
    };

    const deleteMacro = (name: string) => {
        const next = customMacros.filter(macro => macro.name.toLowerCase() !== name.toLowerCase());
        setCustomMacros(next);
        setSetting('copilotMacros', next);
        if (editingName.toLowerCase() === name.toLowerCase()) {
            setEditingName('');
            setMacroName('');
            setMacroSteps('');
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
            <div className="flex items-center gap-2 overflow-x-auto mt-2">
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-600">Macros</span>
                {macros.map(macro => (
                    <button
                        key={macro.name}
                        type="button"
                        onClick={() => void handleRunMacro(macro)}
                        disabled={!canSend}
                        className="whitespace-nowrap shrink-0 px-3 py-1.5 rounded-full text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 active:bg-zinc-700 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {macro.name}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => setEditing(value => !value)}
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs bg-zinc-900 border border-zinc-800 text-zinc-400 min-h-[44px]"
                >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                </button>
            </div>
            {editing && (
                <div className="mt-2 grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                    <input
                        value={macroName}
                        onChange={event => setMacroName(event.target.value)}
                        placeholder="Macro name"
                        className="rounded bg-zinc-950 border border-zinc-800 px-2 py-2 text-sm text-zinc-100"
                    />
                    <textarea
                        value={macroSteps}
                        onChange={event => setMacroSteps(event.target.value)}
                        placeholder="One command per line"
                        rows={3}
                        className="rounded bg-zinc-950 border border-zinc-800 px-2 py-2 text-sm text-zinc-100"
                    />
                    <div className="flex gap-2 overflow-x-auto">
                        <button type="button" onClick={saveMacro} className="px-3 py-2 rounded bg-emerald-500 text-black text-xs font-bold min-h-[44px]">Save</button>
                        {customMacros.map(macro => (
                            <button
                                key={macro.name}
                                type="button"
                                onClick={() => {
                                    setEditingName(macro.name);
                                    setMacroName(macro.name);
                                    setMacroSteps(macro.steps.join('\n'));
                                }}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs min-h-[44px]"
                            >
                                <Edit2 className="w-3.5 h-3.5" />
                                {macro.name}
                            </button>
                        ))}
                        {editingName && (
                            <button
                                type="button"
                                onClick={() => deleteMacro(editingName)}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-rose-300 text-xs min-h-[44px]"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                            </button>
                        )}
                    </div>
                </div>
            )}
            <div className={`mt-2 text-xs ${status.type === 'error' || (status.type === 'success' && status.failed) ? 'text-rose-400' : status.type === 'success' ? 'text-emerald-400' : status.type === 'macro' ? 'text-amber-400' : 'text-zinc-500'}`}>
                {hint}{status.type === 'success' && status.confirmed ? ' ✓' : ''}
            </div>
        </section>
    );
}
