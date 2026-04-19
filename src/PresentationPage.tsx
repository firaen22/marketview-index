import React, { useEffect, useState, useCallback } from 'react';
import { MarketStatCard } from './components/MarketStatCard';
import { SlideRenderer } from './components/SlideRenderer';
import { getSettings, setSetting, type PresentSlide, type PresentSlideMode } from './utils';
import enLocale from './locales/en.ts';

// Core pinned tickers for the top strip. Keep it small — must breathe on a projector.
const PINNED_SYMBOLS = ['^GSPC', '^IXIC', '^HSI', 'GC=F'];

const REFRESH_MS = 10 * 60 * 1000; // 10 min silent refresh

export default function PresentationPage() {
    const [marketData, setMarketData] = useState<any[]>([]);
    const [slide, setSlide] = useState<PresentSlide>(() => getSettings().presentSlide);
    const [showInput, setShowInput] = useState(false);
    const [clock, setClock] = useState<string>(() => new Date().toLocaleTimeString());

    const t = { ...enLocale, language: 'en', activeRange: 'YTD' };

    // --- Market data fetch ---
    const fetchData = useCallback(async () => {
        try {
            const lang = getSettings().lang;
            const res = await fetch(`/api/market-data?t=${Date.now()}&range=YTD&lang=${lang}`);
            const json = await res.json();
            if (json?.data && Array.isArray(json.data)) setMarketData(json.data);
        } catch (err) {
            console.error('Presentation fetch failed', err);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const id = setInterval(fetchData, REFRESH_MS);
        return () => clearInterval(id);
    }, [fetchData]);

    // --- Clock ---
    useEffect(() => {
        const id = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(id);
    }, []);

    // --- Cross-tab sync via StorageEvent ---
    useEffect(() => {
        const handler = (e: StorageEvent) => {
            if (e.key === 'marketflow_settings' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    if (parsed?.presentSlide) setSlide(parsed.presentSlide);
                } catch {}
            }
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);

    // --- Fullscreen toggle with 'f' ---
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'f' || e.key === 'F') {
                if (!document.fullscreenElement) document.documentElement.requestFullscreen();
                else document.exitFullscreen();
            }
            if (e.key === 'Escape') setShowInput(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const pinned = PINNED_SYMBOLS
        .map(sym => marketData.find(d => d.symbol === sym))
        .filter(Boolean);

    // --- Quick inline paste (bottom-right hover) ---
    const handleQuickSave = (mode: PresentSlideMode, content: string) => {
        const next: PresentSlide = { mode, content, updatedAt: Date.now() };
        setSlide(next);
        setSetting('presentSlide', next);
    };

    return (
        <div className="min-h-screen w-full bg-black text-zinc-100 flex flex-col">
            {/* Header strip: clock + brand */}
            <div className="flex items-center justify-between px-8 py-3 border-b border-zinc-900">
                <div className="text-sm font-mono tracking-widest text-zinc-500">
                    MARKETFLOW · PRESENT
                </div>
                <div className="text-sm font-mono text-zinc-400">{clock}</div>
            </div>

            {/* Top live strip — pinned indices */}
            <div className="grid grid-cols-4 gap-4 px-8 py-6 border-b border-zinc-900">
                {pinned.length > 0
                    ? pinned.map((item: any) => (
                        <MarketStatCard key={item.symbol} item={item} t={t} chartHeight="h-20" />
                    ))
                    : Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-40 rounded-xl bg-zinc-900/40 animate-pulse" />
                    ))}
            </div>

            {/* Slide content area */}
            <div className="flex-1 relative overflow-hidden">
                <SlideRenderer slide={slide} marketData={marketData} />

                {/* Hidden hover-activated quick paste — bottom-right */}
                <div
                    className="absolute bottom-4 right-4"
                    onMouseEnter={() => setShowInput(true)}
                >
                    {!showInput ? (
                        <button
                            className="w-3 h-3 rounded-full bg-zinc-700 hover:bg-emerald-500 transition"
                            aria-label="Open quick paste"
                        />
                    ) : (
                        <QuickPaste
                            slide={slide}
                            onSave={handleQuickSave}
                            onClose={() => setShowInput(false)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Inline quick-paste panel ---
const QuickPaste: React.FC<{
    slide: PresentSlide;
    onSave: (mode: PresentSlideMode, content: string) => void;
    onClose: () => void;
}> = ({ slide, onSave, onClose }) => {
    const [mode, setMode] = useState<PresentSlideMode>(slide.mode);
    const [content, setContent] = useState(slide.content);

    return (
        <div className="w-[480px] bg-zinc-950 border border-zinc-800 rounded-xl p-3 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
                <div className="flex gap-1">
                    {(['markdown', 'html', 'url'] as PresentSlideMode[]).map(m => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={`px-2 py-0.5 text-xs rounded font-mono uppercase ${
                                mode === m ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
                            }`}
                        >
                            {m === 'markdown' ? 'MD' : m}
                        </button>
                    ))}
                </div>
                <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xs">✕</button>
            </div>
            <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                className="w-full h-40 bg-zinc-900 border border-zinc-800 rounded p-2 font-mono text-xs text-zinc-200 resize-none focus:outline-none focus:border-emerald-500"
                placeholder={
                    mode === 'url' ? 'https://…' :
                    mode === 'html' ? '<!DOCTYPE html>…' :
                    '# Heading\nYour markdown here…'
                }
            />
            <div className="flex justify-end gap-2 mt-2">
                <button
                    onClick={() => { onSave(mode, content); onClose(); }}
                    className="px-3 py-1 bg-emerald-500 text-black text-xs font-bold rounded hover:bg-emerald-400"
                >
                    Apply
                </button>
            </div>
        </div>
    );
};
