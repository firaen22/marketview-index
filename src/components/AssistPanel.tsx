import { useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { PresentSlide } from '../settings';
import { usePresentAssist } from '../hooks/usePresentAssist';

interface Props {
    slide: PresentSlide;
    lang: 'en' | 'zh-TW';
    enabled?: boolean;
}

export function AssistPanel({ slide, lang, enabled = true }: Props) {
    const [collapsed, setCollapsed] = useState(false);
    const assist = usePresentAssist({ slide, lang, enabled });

    return (
        <section className="border-b border-zinc-900 bg-zinc-950/95">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3">
                <button
                    type="button"
                    onClick={() => setCollapsed(v => !v)}
                    className="flex items-center gap-2 text-left"
                >
                    {collapsed ? <ChevronRight className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
                    <span className="text-[10px] font-mono tracking-widest text-zinc-500">COPILOT NOTES</span>
                </button>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                    {assist.live ? (
                        <span className="text-emerald-400">● p.{assist.page}</span>
                    ) : (
                        <>
                            <span className="text-zinc-500">offline — manual</span>
                            <button
                                type="button"
                                onClick={event => { event.stopPropagation(); assist.prevManualPage(); }}
                                className="w-6 h-6 inline-flex items-center justify-center rounded bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                                title="Previous manual page"
                            >
                                ‹
                            </button>
                            <span className="text-zinc-400 min-w-6 text-center">p.{assist.page}</span>
                            <button
                                type="button"
                                onClick={event => { event.stopPropagation(); assist.nextManualPage(); }}
                                className="w-6 h-6 inline-flex items-center justify-center rounded bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                                title="Next manual page"
                            >
                                ›
                            </button>
                        </>
                    )}
                </div>
            </div>

            {!collapsed && (
                <div className="px-4 sm:px-6 pb-4">
                    {assist.status === 'loading' && (
                        <div className="space-y-2">
                            <div className="h-3 w-4/5 rounded bg-zinc-800 animate-pulse" />
                            <div className="h-3 w-2/3 rounded bg-zinc-800 animate-pulse" />
                            <div className="text-xs text-zinc-500 pt-1">Generating…</div>
                        </div>
                    )}

                    {assist.status === 'syncing' && <div className="text-xs text-zinc-500">Syncing deck…</div>}
                    {assist.status === 'notext' && <div className="text-xs text-zinc-500">Not enough text on this slide.</div>}
                    {assist.status === 'unsupported' && <div className="text-xs text-zinc-500">Presenter notes are not available for URL slides.</div>}
                    {assist.status === 'offdeck' && <div className="text-xs text-zinc-500">Projector is showing the heatmap/dashboard.</div>}
                    {assist.status === 'error' && (
                        <div className="flex items-center justify-between gap-3 text-xs text-rose-300">
                            <span>Could not generate notes.</span>
                            <button
                                type="button"
                                onClick={assist.retry}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                            >
                                <RefreshCw className="w-3 h-3" />
                                Retry
                            </button>
                        </div>
                    )}

                    {assist.status === 'ready' && assist.assist && (
                        <div className="space-y-4">
                            <ul className="space-y-2">
                                {assist.assist.points.map(point => (
                                    <li key={point} className="flex gap-2 text-sm text-zinc-200 leading-relaxed">
                                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                                        <span>{point}</span>
                                    </li>
                                ))}
                            </ul>
                            {assist.assist.questions.length > 0 && (
                                <div className="space-y-3">
                                    {assist.assist.questions.map(question => (
                                        <div key={question.q} className="border-t border-zinc-900 pt-3">
                                            <div className="text-sm font-semibold text-zinc-100">Q: {question.q}</div>
                                            <div className="mt-1 text-xs text-zinc-400 leading-relaxed">{question.a}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
