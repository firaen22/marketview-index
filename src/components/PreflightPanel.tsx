import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { Modal } from './Modal';
import { cn } from '../utils';
import { runPreflight, type PreflightResult, type PreflightStatus } from '../preflight';

const CHECKS = [
    { id: 'slide', label: 'Slide state' },
    { id: 'deck', label: 'Deck PDF' },
    { id: 'market', label: 'Market data' },
    { id: 'macro', label: 'Macro data' },
    { id: 'projector', label: 'Projector' },
    { id: 'auth', label: 'Write auth' },
    { id: 'jargon', label: 'Jargon AI' },
] as const;

type RowState = {
    id: string;
    label: string;
    result: PreflightResult | null;
};

function initialRows(): RowState[] {
    return CHECKS.map(check => ({ ...check, result: null }));
}

function chipClass(status: PreflightStatus) {
    return cn(
        'min-w-14 rounded px-2 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide',
        status === 'pass' && 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
        status === 'warn' && 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
        status === 'fail' && 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
        status === 'skip' && 'bg-zinc-700/60 text-zinc-300 border border-zinc-600',
    );
}

interface Props {
    lang: 'en' | 'zh-TW';
    onClose: () => void;
}

export function PreflightPanel({ lang, onClose }: Props) {
    const [rows, setRows] = useState<RowState[]>(initialRows);
    const activeRunIdRef = useRef(0);
    const abortRef = useRef<(() => void) | null>(null);

    const startRun = useCallback(() => {
        abortRef.current?.();
        const runId = activeRunIdRef.current + 1;
        activeRunIdRef.current = runId;
        setRows(initialRows());

        const run = runPreflight({ lang });
        abortRef.current = run.abort;

        for (const promise of run.results) {
            promise.then(result => {
                if (activeRunIdRef.current !== runId) return;
                setRows(current => current.map(row => (
                    row.id === result.id ? { ...row, result } : row
                )));
            }).catch(() => {
                if (activeRunIdRef.current !== runId) return;
            });
        }
    }, [lang]);

    useEffect(() => {
        startRun();
        return () => {
            activeRunIdRef.current += 1;
            abortRef.current?.();
            abortRef.current = null;
        };
    }, [startRun]);

    const close = useCallback(() => {
        activeRunIdRef.current += 1;
        abortRef.current?.();
        abortRef.current = null;
        onClose();
    }, [onClose]);

    const allDone = rows.every(row => row.result);
    const hasFail = rows.some(row => row.result?.status === 'fail');
    const verdict = allDone ? (hasFail ? 'NOT READY' : 'GO') : 'Checking...';

    return (
        <Modal
            title="Preflight"
            onClose={close}
            maxWidth="max-w-2xl"
            accent="from-emerald-500 via-amber-500 to-rose-500"
            bodyClassName="space-y-4"
            cardClassName="bg-zinc-950 border-zinc-800"
            footer={(
                <div className="flex w-full items-center justify-between gap-3">
                    <div className={cn(
                        'text-sm font-bold tracking-wide',
                        allDone && !hasFail && 'text-emerald-300',
                        allDone && hasFail && 'text-rose-300',
                        !allDone && 'text-zinc-400',
                    )}>
                        {verdict}
                    </div>
                    <button
                        onClick={startRun}
                        className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>Re-run</span>
                    </button>
                </div>
            )}
        >
            <div className="divide-y divide-zinc-900 rounded-lg border border-zinc-800 bg-zinc-950">
                {rows.map(row => (
                    <div key={row.id} className="grid grid-cols-[minmax(7rem,1fr)_auto] gap-3 px-4 py-3 sm:grid-cols-[10rem_auto_1fr] sm:items-center">
                        <div className="text-sm font-medium text-zinc-100">{row.label}</div>
                        {row.result ? (
                            <span className={chipClass(row.result.status)}>{row.result.status}</span>
                        ) : (
                            <span className="flex min-w-14 justify-center text-zinc-500">
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                            </span>
                        )}
                        <div className="col-span-2 min-w-0 text-sm text-zinc-400 sm:col-span-1">
                            {row.result?.detail ?? 'Pending'}
                        </div>
                    </div>
                ))}
            </div>
        </Modal>
    );
}
