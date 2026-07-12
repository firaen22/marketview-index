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
        <div className="absolute bottom-4 left-4 z-20 max-w-[400px] bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-lg px-4 py-2.5 pointer-events-none">
            <div key={index} className="hints-in">
                <div className="flex items-center justify-between gap-4 mb-1">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-500">
                        {lang === 'zh-TW' ? '關鍵詞解釋' : 'Jargon'}
                    </span>
                    {terms.length > 1 && (
                        <span className="text-[9px] font-mono text-zinc-600">
                            {index + 1}/{terms.length}
                        </span>
                    )}
                </div>
                <div className="text-sm font-semibold text-zinc-100">{current.term}</div>
                <div className="text-xs text-zinc-400 leading-snug">{current.explanation}</div>
            </div>
        </div>
    );
}
