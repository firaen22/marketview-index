import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deletePdf, getSettings, type PresentSlideMode } from './utils';
import { useSlideSync } from './hooks/useSlideSync';
import { SlideRenderer } from './components/SlideRenderer';
import { PdfUploader } from './components/PdfUploader';
import { Monitor, Save, RotateCcw, Clipboard, Eye, EyeOff } from 'lucide-react';
import { MODE_HINTS, EXAMPLES } from './presentationExamples';

export default function PresentationControl() {
    const { slide, saveSlide, doRemoteSave, cloudStatus, lastSavedAt, sizeWarning, formatRelativeTime } = useSlideSync();
    const [marketData, setMarketData] = useState<any[]>([]);
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        const lang = getSettings().lang;
        fetch(`/api/market-data?t=${Date.now()}&range=YTD&lang=${lang}`)
            .then(r => r.json())
            .then(j => { if (j?.data) setMarketData(j.data); })
            .catch(() => {});
    }, []);

    const updateMode = (mode: PresentSlideMode) => saveSlide({ mode });
    const updateContent = (content: string) => saveSlide({ content });

    const pasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) updateContent(text);
        } catch {
            alert('Clipboard access denied. Paste manually with Cmd+V / long-press Paste.');
        }
    };

    const saveBtn = (
        <button
            onClick={() => doRemoteSave()}
            disabled={cloudStatus === 'saving'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition
                ${cloudStatus === 'saving' ? 'bg-zinc-700 text-zinc-400 cursor-wait'
                : cloudStatus === 'ok' ? 'bg-emerald-600 text-white'
                : cloudStatus === 'error' ? 'bg-rose-600 text-white hover:bg-rose-500'
                : 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'}`}
        >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
                {cloudStatus === 'saving' ? 'Saving…'
                    : cloudStatus === 'ok' ? 'Saved'
                    : cloudStatus === 'error' ? 'Retry'
                    : 'Save'}
            </span>
        </button>
    );

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
            {/* Header */}
            <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-zinc-900 shrink-0">
                <div className="flex items-center gap-3">
                    <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-200">← Dashboard</Link>
                    <span className="text-sm font-mono tracking-widest text-zinc-400 hidden sm:inline">CONTROL</span>
                </div>
                <div className="flex items-center gap-2">
                    {saveBtn}
                    {/* Preview toggle — mobile only */}
                    <button
                        onClick={() => setShowPreview(p => !p)}
                        className="sm:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    >
                        {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {showPreview ? 'Editor' : 'Preview'}
                    </button>
                    <button
                        onClick={() => {
                            const w = screen.availWidth;
                            const h = screen.availHeight;
                            window.open(
                                '/present',
                                'marketflow_present',
                                `width=${w},height=${h},left=0,top=0,menubar=no,toolbar=no,location=no,status=no`
                            );
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-black rounded-lg text-xs font-bold hover:bg-emerald-400"
                        title="Opens /present in a new window"
                    >
                        <Monitor className="w-3.5 h-3.5" />
                        <span>Launch</span>
                    </button>
                </div>
            </header>

            {/* Body — two-column on desktop, single-column on mobile */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 min-h-0">
                {/* Editor — hidden on mobile when preview is shown */}
                <div className={`border-r border-zinc-900 flex flex-col min-h-0 ${showPreview ? 'hidden sm:flex' : 'flex'}`}>
                    {/* Mode tabs */}
                    <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-b border-zinc-900 shrink-0 flex-wrap gap-y-2">
                        {(['markdown', 'html', 'url', 'pdf'] as PresentSlideMode[]).map(m => (
                            <button
                                key={m}
                                onClick={() => updateMode(m)}
                                className={`px-3 py-1.5 text-xs font-mono uppercase rounded ${
                                    slide.mode === m
                                        ? 'bg-emerald-500 text-black font-bold'
                                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                }`}
                            >
                                {m === 'markdown' ? 'Markdown' : m.toUpperCase()}
                            </button>
                        ))}
                        <div className="flex-1" />
                        <button
                            onClick={pasteFromClipboard}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-zinc-800 rounded text-zinc-300 hover:bg-zinc-700"
                        >
                            <Clipboard className="w-3 h-3" />
                            <span>Paste</span>
                        </button>
                        <button
                            onClick={() => {
                                if (slide.mode === 'pdf' && slide.content) deletePdf(slide.content);
                                saveSlide({ mode: 'markdown', content: '' });
                            }}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-rose-900/60 border border-rose-800/50 rounded text-rose-300 hover:bg-rose-800/60"
                        >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset</span>
                        </button>
                    </div>

                    {/* Content area */}
                    {slide.mode === 'pdf' ? (
                        <div className="flex-1 flex flex-col gap-4 p-4 sm:p-6 overflow-y-auto">
                            <PdfUploader onUploaded={url => {
                                if (slide.mode === 'pdf' && slide.content && slide.content !== url) {
                                    deletePdf(slide.content);
                                }
                                updateContent(url);
                            }} />
                            {slide.content && (
                                <div className="flex flex-col gap-1">
                                    <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Current PDF</span>
                                    <a
                                        href={slide.content}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs font-mono text-emerald-400 truncate hover:underline"
                                    >
                                        {slide.content}
                                    </a>
                                    <button
                                        onClick={() => { deletePdf(slide.content); updateContent(''); }}
                                        className="mt-1 self-start text-xs px-2 py-1 bg-zinc-800 rounded text-zinc-400 hover:bg-zinc-700"
                                    >
                                        Replace PDF
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <textarea
                            value={slide.content}
                            onChange={e => updateContent(e.target.value)}
                            placeholder={MODE_HINTS[slide.mode]}
                            className="flex-1 w-full bg-zinc-950 p-4 sm:p-6 font-mono text-sm text-zinc-200 resize-none focus:outline-none border-0"
                            spellCheck={false}
                            style={{ fontSize: '16px' /* prevents iOS zoom on focus */ }}
                        />
                    )}

                    {/* Footer */}
                    {sizeWarning && (
                        <div className="px-4 py-2 text-xs text-rose-400 bg-rose-500/10 border-t border-rose-500/30 shrink-0">
                            {sizeWarning}
                        </div>
                    )}
                    <div className="px-4 sm:px-6 py-2 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-500 shrink-0">
                        <span>
                            {slide.content.length} chars
                            {lastSavedAt ? ` · saved ${formatRelativeTime(lastSavedAt)}` : ' · not yet saved'}
                        </span>
                        {slide.mode === 'markdown' && (
                            <span className="font-mono hidden sm:inline">{'{{^GSPC.price}}'} {'{{^HSI.changePercent}}'}</span>
                        )}
                    </div>
                </div>

                {/* Preview — always visible on desktop, toggled on mobile */}
                <div className={`flex flex-col bg-black min-h-0 ${showPreview ? 'flex' : 'hidden sm:flex'}`}>
                    <div className="px-4 sm:px-6 py-3 border-b border-zinc-900 flex items-center justify-between shrink-0">
                        <span className="text-xs font-mono tracking-widest text-zinc-500">PREVIEW</span>
                        {EXAMPLES[slide.mode].length > 0 && (
                            <div className="flex gap-2">
                                {EXAMPLES[slide.mode].map(ex => (
                                    <button
                                        key={ex.label}
                                        onClick={() => updateContent(ex.content)}
                                        className="text-xs px-2 py-1 bg-zinc-900 rounded text-zinc-400 hover:bg-zinc-800"
                                    >
                                        {ex.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <SlideRenderer slide={slide} marketData={marketData} />
                    </div>
                </div>
            </div>
        </div>
    );
}
