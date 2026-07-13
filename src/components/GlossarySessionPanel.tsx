import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clipboard, ExternalLink, Loader2, Maximize2, Play, Power, RotateCcw, X } from 'lucide-react';
import { toDataURL } from 'qrcode';
import type { GlossarySession } from '../../lib/glossarySession';
import { getLocale, type Lang } from '../locales';
import { cn } from '../utils';
import { Toggle } from './Toggle';
import type { UseGlossarySessionResult } from '../hooks/useGlossarySession';

interface Props {
    open: boolean;
    onClose: () => void;
    glossary: UseGlossarySessionResult;
    lang?: Lang;
}

type Mode = GlossarySession['mode'];

function isAuthOrStorageError(error: string | null): boolean {
    if (!error) return false;
    return /unauthorized|present_api_key|storage not configured|missing present_api_key|401|503/i.test(error);
}

export function GlossarySessionPanel({ open, onClose, glossary, lang = 'zh-TW' }: Props) {
    const t = getLocale(lang).glossary.presenter;
    const session = glossary.session;
    const [mode, setMode] = useState<Mode>('gradual');
    const [keepAfter, setKeepAfter] = useState(true);
    const [qrUrl, setQrUrl] = useState<string | null>(null);
    const [qrError, setQrError] = useState(false);
    const [copied, setCopied] = useState(false);
    const [fullscreenQr, setFullscreenQr] = useState(false);
    const copyTextRef = useRef<HTMLTextAreaElement | null>(null);

    const joinUrl = useMemo(() => {
        if (!session?.joinCode || typeof window === 'undefined') return '';
        return `${window.location.origin}/session/${session.joinCode}`;
    }, [session?.joinCode]);

    useEffect(() => {
        if (!joinUrl) {
            setQrUrl(null);
            setQrError(false);
            return;
        }

        let cancelled = false;
        setQrUrl(null);
        setQrError(false);
        void toDataURL(joinUrl, {
            margin: 1,
            width: 320,
            color: { dark: '#09090b', light: '#ffffff' },
        }).then(url => {
            if (!cancelled) setQrUrl(url);
        }).catch(() => {
            if (!cancelled) setQrError(true);
        });

        return () => {
            cancelled = true;
        };
    }, [joinUrl]);

    useEffect(() => {
        if (!fullscreenQr) return;
        // Modal-owns-its-Esc (Modal.tsx / IndexChartModal.tsx precedent).
        // Capture phase + stopPropagation so useKeyboardShortcuts' bubble
        // handler in PresentationPage doesn't also close the panel beneath
        // this overlay — Escape must dismiss the topmost layer only.
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                setFullscreenQr(false);
            }
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [fullscreenQr]);

    useEffect(() => {
        if (!copied) return;
        const id = window.setTimeout(() => setCopied(false), 1800);
        return () => window.clearTimeout(id);
    }, [copied]);

    const copyLink = async () => {
        if (!joinUrl) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(joinUrl);
                setCopied(true);
                return;
            }
            copyTextRef.current?.select();
            if (document.execCommand?.('copy')) {
                setCopied(true);
                return;
            }
        } catch {}
        window.prompt(t.copyFallback, joinUrl);
    };

    const start = () => {
        void glossary.start(mode, keepAfter);
    };

    const switchMode = (next: Mode) => {
        if (!session || session.mode === next || session.status !== 'live') return;
        void glossary.setMode(next);
    };

    const activeTerms = session?.terms.length ?? 0;
    const status = session?.status ?? null;

    return (
        <>
            <div
                className={cn(
                    'fixed right-0 top-0 z-40 h-full w-[460px] max-w-[100vw] transform border-l border-zinc-800 bg-zinc-950 shadow-2xl transition-transform duration-300',
                    open ? 'translate-x-0' : 'translate-x-full',
                )}
            >
                <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                    <div>
                        <h2 className="font-mono text-sm tracking-widest text-zinc-300">{t.title}</h2>
                        <p className="mt-0.5 text-xs text-zinc-500">{t.subtitle}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
                        aria-label={t.close}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex h-[calc(100%-61px)] flex-col gap-4 overflow-y-auto p-4">
                    {glossary.error && (
                        <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                            {isAuthOrStorageError(glossary.error) ? t.authMissing : glossary.error}
                        </div>
                    )}

                    {!session ? (
                        <div className="space-y-4">
                            <div>
                                <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                                    {t.mode}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['all', 'gradual'] as const).map(option => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setMode(option)}
                                            className={cn(
                                                'rounded border px-3 py-2 text-left text-sm transition',
                                                mode === option
                                                    ? 'border-emerald-500 bg-emerald-500 text-black'
                                                    : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700',
                                            )}
                                        >
                                            <span className="block font-semibold">{option === 'all' ? t.modeAll : t.modeGradual}</span>
                                            <span className={cn('mt-1 block text-xs', mode === option ? 'text-black/70' : 'text-zinc-500')}>
                                                {option === 'all' ? t.modeAllHint : t.modeGradualHint}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
                                <Toggle
                                    checked={keepAfter}
                                    onChange={setKeepAfter}
                                    ariaLabel={t.keepAfter}
                                    label={<span>{t.keepAfter}</span>}
                                />
                                <p className="mt-2 text-xs text-zinc-500">{t.keepAfterHint}</p>
                            </div>

                            <button
                                type="button"
                                onClick={start}
                                disabled={glossary.loading}
                                className="flex w-full items-center justify-center gap-2 rounded bg-emerald-500 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
                            >
                                {glossary.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                {t.start}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span
                                    className={cn(
                                        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide',
                                        status === 'live'
                                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                            : 'border-zinc-700 bg-zinc-900 text-zinc-300',
                                    )}
                                >
                                    {status === 'live' ? t.live : t.ended}
                                </span>
                                <span className="font-mono text-xs text-zinc-500">{t.joins.replace('{count}', String(session.joins ?? 0))}</span>
                            </div>

                            <button
                                type="button"
                                onClick={() => qrUrl && setFullscreenQr(true)}
                                className="flex w-full min-h-64 items-center justify-center rounded border border-zinc-800 bg-white p-4 text-zinc-950 transition hover:border-emerald-500"
                                aria-label={t.openQr}
                            >
                                {qrUrl ? (
                                    <img src={qrUrl} alt={t.qrAlt} className="h-56 w-56" />
                                ) : qrError ? (
                                    <span className="break-all px-3 text-center font-mono text-sm">{joinUrl}</span>
                                ) : (
                                    <span className="flex items-center gap-2 text-sm text-zinc-600">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {t.generatingQr}
                                    </span>
                                )}
                            </button>

                            <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3 text-center">
                                <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t.joinCode}</div>
                                <div className="mt-1 font-mono text-4xl font-bold tracking-[0.18em] text-zinc-100">{session.joinCode}</div>
                                <div className="mt-2 break-all font-mono text-xs text-zinc-500">{joinUrl}</div>
                                <textarea ref={copyTextRef} value={joinUrl} readOnly className="sr-only" />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={copyLink}
                                    className="flex items-center justify-center gap-2 rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition hover:border-emerald-500"
                                >
                                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Clipboard className="h-4 w-4 text-emerald-400" />}
                                    {copied ? t.copied : t.copyLink}
                                </button>
                                <a
                                    href={joinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition hover:border-emerald-500"
                                >
                                    <ExternalLink className="h-4 w-4 text-emerald-400" />
                                    {t.openAudience}
                                </a>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <Metric label={t.currentPage} value={session.currentPage ? String(session.currentPage) : '-'} />
                                <Metric label={t.unlockedTerms} value={String(activeTerms)} />
                            </div>

                            <div>
                                <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-zinc-500">{t.mode}</div>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['all', 'gradual'] as const).map(option => (
                                        <button
                                            key={option}
                                            type="button"
                                            disabled={status !== 'live' || glossary.loading}
                                            onClick={() => switchMode(option)}
                                            className={cn(
                                                'rounded border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                                                session.mode === option
                                                    ? 'border-emerald-500 bg-emerald-500 text-black'
                                                    : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700',
                                            )}
                                        >
                                            {option === 'all' ? t.modeAll : t.modeGradual}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {status === 'ended' ? (
                                <button
                                    type="button"
                                    onClick={() => void glossary.reopen()}
                                    disabled={glossary.loading}
                                    className="flex w-full items-center justify-center gap-2 rounded border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-wait disabled:opacity-60"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    {t.reopen}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => void glossary.end()}
                                    disabled={glossary.loading}
                                    className="flex w-full items-center justify-center gap-2 rounded border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm font-bold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-60"
                                >
                                    <Power className="h-4 w-4" />
                                    {t.end}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {fullscreenQr && session && (
                <div
                    className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-black/95 p-6 text-center"
                    onClick={() => setFullscreenQr(false)}
                    role="dialog"
                    aria-label={t.fullscreenQr}
                >
                    <button
                        type="button"
                        className="absolute right-4 top-4 rounded p-2 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                        onClick={() => setFullscreenQr(false)}
                        aria-label={t.close}
                    >
                        <X className="h-6 w-6" />
                    </button>
                    <div className="rounded bg-white p-5">
                        {qrUrl ? (
                            <img src={qrUrl} alt={t.qrAlt} className="h-[min(72vmin,720px)] w-[min(72vmin,720px)] min-h-[60vmin] min-w-[60vmin]" />
                        ) : (
                            <div className="flex h-[60vmin] w-[60vmin] items-center justify-center p-4 font-mono text-lg text-zinc-950">
                                {joinUrl}
                            </div>
                        )}
                    </div>
                    <div className="font-mono text-6xl font-bold tracking-[0.18em] text-zinc-100">{session.joinCode}</div>
                    <div className="max-w-4xl break-all font-mono text-2xl text-emerald-300">{joinUrl}</div>
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                        <Maximize2 className="h-4 w-4" />
                        {t.closeQrHint}
                    </div>
                </div>
            )}
        </>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{label}</div>
            <div className="mt-1 font-mono text-2xl font-bold text-zinc-100">{value}</div>
        </div>
    );
}
