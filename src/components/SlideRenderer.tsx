import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { PresentSlide } from '../settings';
import { injectMarketTokens } from '../tokenInject';
import { PdfViewer, type PdfViewerHandle } from './PdfViewer';

interface Props {
    slide: PresentSlide;
    marketData: Array<{ symbol: string; [k: string]: any }>;
    pdfZoom?: number;
    pdfKeyboardEnabled?: boolean;
    pdfRef?: React.Ref<PdfViewerHandle>;
    onPdfPageText?: (page: number, text: string) => void;
}

export const SlideRenderer: React.FC<Props> = ({ slide, marketData, pdfZoom = 100, pdfKeyboardEnabled = true, pdfRef, onPdfPageText }) => {
    const injected = React.useMemo(() => {
        if (slide.mode !== 'markdown' && slide.mode !== 'html') return '';
        return injectMarketTokens(slide.content, marketData);
    }, [slide.content, slide.mode, marketData]);

    if (!slide.content?.trim()) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="text-zinc-600 text-2xl">Awaiting slide content…</div>
                <div className="text-zinc-700 text-sm flex items-center gap-2">
                    Press
                    <kbd className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded font-mono text-emerald-400">E</kbd>
                    to open the editor
                </div>
            </div>
        );
    }

    if (slide.mode === 'url') {
        return (
            <iframe
                key={slide.content}
                src={slide.content.trim()}
                className="w-full h-full border-0 bg-white rounded-xl"
                allow="autoplay; fullscreen"
                allowFullScreen
            />
        );
    }

    if (slide.mode === 'pdf') {
        return <PdfViewer ref={pdfRef} url={slide.content.trim()} zoom={pdfZoom} keyboardEnabled={pdfKeyboardEnabled} onPageText={onPdfPageText} />;
    }

    if (slide.mode === 'html') {
        const html = injected;
        const scale = pdfZoom / 100;
        return (
            <div className="absolute inset-0 w-full h-full overflow-auto bg-white flex items-start justify-center">
                <div style={{ width: '100%', height: '100%', transform: `scale(${scale})`, transformOrigin: 'top center', flexShrink: 0 }}>
                    <iframe
                        key={slide.updatedAt}
                        srcDoc={html}
                        sandbox="allow-scripts allow-same-origin"
                        className="w-full h-full border-0"
                    />
                </div>
            </div>
        );
    }

    // markdown mode
    const md = injected;
    return (
        <div className="w-full h-full overflow-auto px-12 py-10">
            <article
                className="
                    max-w-none text-zinc-100
                    [&_h1]:text-[clamp(2.5rem,5.5vw,6.5rem)] [&_h1]:leading-tight [&_h1]:font-bold [&_h1]:mb-8 [&_h1]:text-emerald-300
                    [&_h2]:text-[clamp(1.75rem,3.5vw,4rem)] [&_h2]:leading-tight [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-6 [&_h2]:text-zinc-100
                    [&_h3]:text-[clamp(1.4rem,2.5vw,3rem)] [&_h3]:font-semibold [&_h3]:mt-8 [&_h3]:mb-4 [&_h3]:text-zinc-200
                    [&_p]:text-[clamp(1.1rem,1.8vw,2.25rem)] [&_p]:leading-relaxed [&_p]:mb-5 [&_p]:text-zinc-200
                    [&_ul]:text-[clamp(1.1rem,1.8vw,2.25rem)] [&_ul]:space-y-3 [&_ul]:mb-6 [&_ul]:pl-8 [&_ul]:list-disc
                    [&_ol]:text-[clamp(1.1rem,1.8vw,2.25rem)] [&_ol]:space-y-3 [&_ol]:mb-6 [&_ol]:pl-8 [&_ol]:list-decimal
                    [&_li]:text-zinc-200
                    [&_strong]:text-emerald-300 [&_strong]:font-bold
                    [&_em]:text-amber-300 [&_em]:italic
                    [&_code]:font-mono [&_code]:bg-zinc-800 [&_code]:px-2 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-emerald-300
                    [&_pre]:bg-zinc-900 [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-auto
                    [&_table]:w-full [&_table]:border-collapse [&_table]:my-6 [&_table]:text-[clamp(1rem,1.4vw,1.75rem)]
                    [&_th]:border [&_th]:border-zinc-700 [&_th]:bg-zinc-900 [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:text-emerald-300
                    [&_td]:border [&_td]:border-zinc-800 [&_td]:px-4 [&_td]:py-2
                    [&_blockquote]:border-l-4 [&_blockquote]:border-emerald-400 [&_blockquote]:pl-6 [&_blockquote]:italic [&_blockquote]:text-zinc-300 [&_blockquote]:my-6
                    [&_a]:text-emerald-400 [&_a]:underline [&_a]:decoration-dotted
                    [&_hr]:border-zinc-800 [&_hr]:my-8
                "
            >
                <ReactMarkdown>{md}</ReactMarkdown>
            </article>
        </div>
    );
};
