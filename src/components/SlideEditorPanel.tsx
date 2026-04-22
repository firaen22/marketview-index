import React from 'react';
import { X, ExternalLink } from 'lucide-react';
import { PdfUploader } from './PdfUploader';
import { SaveButton } from './SaveButton';
import { deletePdf } from '../slideApi';
import { formatRelativeTime } from '../utils';
import type { PresentSlideMode } from '../settings';
import type { useSlideSync } from '../hooks/useSlideSync';

type SlideSync = ReturnType<typeof useSlideSync>;

interface Props {
    open: boolean;
    onClose: () => void;
    slide: SlideSync['slide'];
    saveSlide: SlideSync['saveSlide'];
    doRemoteSave: SlideSync['doRemoteSave'];
    cloudStatus: SlideSync['cloudStatus'];
    lastSavedAt: SlideSync['lastSavedAt'];
    sizeWarning: SlideSync['sizeWarning'];
}

export const SlideEditorPanel: React.FC<Props> = ({
    open, onClose, slide, saveSlide, doRemoteSave,
    cloudStatus, lastSavedAt, sizeWarning,
}) => {
    return (
        <div
            className={`
                fixed top-0 right-0 h-full w-[460px] bg-zinc-950 border-l border-zinc-800
                shadow-2xl z-40 transform transition-transform duration-300
                ${open ? 'translate-x-0' : 'translate-x-full'}
            `}
        >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <h2 className="text-sm font-mono tracking-widest text-zinc-300">SLIDE EDITOR</h2>
                <div className="flex items-center gap-2">
                    <SaveButton cloudStatus={cloudStatus} onSave={() => doRemoteSave()} variant="compact" />
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-zinc-800 text-zinc-500"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="p-4 flex flex-col gap-3 h-[calc(100%-49px)]">
                {/* Mode tabs */}
                <div className="flex gap-1">
                    {(['markdown', 'html', 'url', 'pdf'] as PresentSlideMode[]).map(m => (
                        <button
                            key={m}
                            onClick={() => saveSlide({ mode: m })}
                            className={`flex-1 px-2 py-1.5 text-xs font-mono uppercase rounded ${
                                slide.mode === m
                                    ? 'bg-emerald-500 text-black font-bold'
                                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                            }`}
                        >
                            {m === 'markdown' ? 'MD' : m.toUpperCase()}
                        </button>
                    ))}
                </div>

                {/* Quick actions */}
                <div className="flex gap-2">
                    <button
                        onClick={async () => {
                            try {
                                const text = await navigator.clipboard.readText();
                                if (text) saveSlide({ content: text });
                            } catch {
                                alert('Clipboard blocked. Paste into the textarea with Cmd+V.');
                            }
                        }}
                        className="flex-1 text-xs px-2 py-1.5 bg-zinc-800 rounded text-zinc-300 hover:bg-zinc-700"
                    >
                        Paste from clipboard
                    </button>
                    <button
                        onClick={() => {
                            if (slide.mode === 'pdf' && slide.content) deletePdf(slide.content);
                            saveSlide({ mode: 'markdown', content: '' });
                        }}
                        className="text-xs px-2 py-1.5 bg-rose-900/60 border border-rose-800/50 rounded text-rose-300 hover:bg-rose-800/60"
                        title="Clear content and reset to Markdown mode"
                    >
                        Reset
                    </button>
                </div>

                {/* PDF uploader or textarea */}
                {slide.mode === 'pdf' ? (
                    <div className="flex flex-col gap-3 flex-1">
                        <PdfUploader onUploaded={url => {
                            if (slide.mode === 'pdf' && slide.content && slide.content !== url) {
                                deletePdf(slide.content);
                            }
                            saveSlide({ content: url });
                        }} />
                        {slide.content && (
                            <p className="text-[10px] font-mono text-emerald-400 truncate">{slide.content}</p>
                        )}
                    </div>
                ) : (
                    <textarea
                        value={slide.content}
                        onChange={e => saveSlide({ content: e.target.value })}
                        placeholder={
                            slide.mode === 'url'
                                ? 'https://docs.google.com/presentation/d/e/.../embed'
                                : slide.mode === 'html'
                                ? '<!DOCTYPE html>...'
                                : '# Heading\n\nParagraph with **bold** and {{^GSPC.price}} tokens'
                        }
                        spellCheck={false}
                        className="flex-1 w-full bg-zinc-900 border border-zinc-800 rounded p-3 font-mono text-xs text-zinc-200 resize-none focus:outline-none focus:border-emerald-500"
                    />
                )}

                {/* Footer */}
                {sizeWarning && (
                    <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1">
                        {sizeWarning}
                    </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>
                        {slide.content.length} chars
                        {lastSavedAt ? ` · saved ${formatRelativeTime(lastSavedAt)}` : ' · not yet saved'}
                    </span>
                    <a
                        href="/present-control"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 hover:text-emerald-400"
                    >
                        Full editor <ExternalLink className="w-3 h-3" />
                    </a>
                </div>
            </div>
        </div>
    );
};
