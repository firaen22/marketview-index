import { useEffect, useState } from 'react';
import type { JargonTerm } from '../jargon';

interface Props {
    terms: JargonTerm[];
    lang: 'en' | 'zh-TW';
}

export function JargonSpotlight({ terms, lang }: Props) {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        setIndex(0);
        if (terms.length <= 1) return;
        const interval = window.setInterval(() => {
            setIndex(i => (i + 1) % terms.length);
        }, 8000);
        return () => window.clearInterval(interval);
    }, [terms]);

    if (terms.length === 0) return null;

    const current = terms[index] || terms[0];

    return (
        // Base font scales with the viewport's shorter side (`vmin`, which equals
        // the height on a landscape 16:9 projector), so the card holds the same
        // physical size on the wall across 720p, 1080p and native 4K rather than
        // shrinking as pixel count rises; `vmin` also keeps it from overflowing a
        // narrow preview window. Everything inside is sized in `em`, so this single
        // clamp drives the whole card: the 13px floor keeps a laptop preview
        // legible, and the 44px ceiling clears 4K's 2vmin (43.2px at 2160 CSS px)
        // so an unscaled 4K display stays on the same curve.
        <div className="absolute bottom-[1.2em] left-[1.2em] z-20 max-w-[30em] bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-[0.6em] px-[1.15em] py-[0.7em] pointer-events-none text-[clamp(13px,2vmin,44px)]">
            <div key={index} className="hints-in">
                <div className="flex items-center justify-between gap-[1em] mb-[0.35em]">
                    <span className="text-[0.8em] font-mono uppercase tracking-widest text-emerald-500">
                        {lang === 'zh-TW' ? '關鍵詞解釋' : 'Jargon'}
                    </span>
                    {terms.length > 1 && (
                        <span className="text-[0.8em] font-mono text-zinc-400">
                            {index + 1}/{terms.length}
                        </span>
                    )}
                </div>
                <div className="text-[1.3em] font-semibold text-zinc-100">{current.term}</div>
                <div className="text-[1em] text-zinc-400 leading-snug line-clamp-3">{current.explanation}</div>
            </div>
        </div>
    );
}
