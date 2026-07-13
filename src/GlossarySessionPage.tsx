import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Bookmark, Languages, Search, SlidersHorizontal, WifiOff } from 'lucide-react';
import type { GlossaryLang, GlossaryTermSnapshot } from '../lib/glossarySession';
import { getLocale } from './locales';
import { useGlossaryPoll } from './hooks/useGlossaryPoll';
import { getSavedTerms, isTermSaved, setTermSaved } from './glossarySaved';
import { EmptyState } from './components/glossary/EmptyState';
import { Tabs, type GlossaryTab } from './components/glossary/Tabs';
import { TermCard } from './components/glossary/TermCard';

type SortMode = 'appearance' | 'alpha';

function termText(term: GlossaryTermSnapshot, lang: GlossaryLang): string {
    return term.explanation[lang] ?? term.explanation.en ?? term.explanation['zh-TW'] ?? '';
}

function sortLatest(terms: GlossaryTermSnapshot[]): GlossaryTermSnapshot[] {
    return [...terms].sort((a, b) => b.unlockedAt - a.unlockedAt);
}

function sortAll(terms: GlossaryTermSnapshot[], sortMode: SortMode): GlossaryTermSnapshot[] {
    if (sortMode === 'alpha') {
        return [...terms].sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' }));
    }
    return terms;
}

function filterTerms(terms: GlossaryTermSnapshot[], query: string, lang: GlossaryLang): GlossaryTermSnapshot[] {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return terms;
    return terms.filter(term => {
        const haystack = `${term.term} ${termText(term, lang)}`.toLocaleLowerCase();
        return haystack.includes(q);
    });
}

export default function GlossarySessionPage() {
    const { code: rawCode } = useParams();
    const poll = useGlossaryPoll(rawCode);
    const [lang, setLang] = useState<GlossaryLang>('zh-TW');
    const [tab, setTab] = useState<GlossaryTab>('latest');
    const [query, setQuery] = useState('');
    const [sortMode, setSortMode] = useState<SortMode>('appearance');
    const [savedTerms, setSavedTerms] = useState<GlossaryTermSnapshot[]>([]);
    const [savingEnabled, setSavingEnabled] = useState(true);
    const t = getLocale(lang).glossary;

    useEffect(() => {
        if (!poll.code) return;
        setSavedTerms(getSavedTerms(poll.code));
    }, [poll.code]);

    useEffect(() => {
        if (poll.status === 'not_found' && savedTerms.length > 0) {
            setTab('saved');
        }
    }, [poll.status, savedTerms.length]);

    const liveTerms = poll.session?.terms ?? [];
    const latestTerms = useMemo(() => sortLatest(liveTerms), [liveTerms]);
    const allTerms = useMemo(
        () => filterTerms(sortAll(liveTerms, sortMode), query, lang),
        [liveTerms, sortMode, query, lang],
    );
    const visibleTerms = tab === 'latest' ? latestTerms : tab === 'all' ? allTerms : savedTerms;

    const toggleSaved = (term: GlossaryTermSnapshot) => {
        if (!poll.code || !savingEnabled) return;
        const nextShouldSave = !isTermSaved(poll.code, term.id);
        const result = setTermSaved(poll.code, term, nextShouldSave);
        setSavingEnabled(result.enabled);
        setSavedTerms(result.terms);
    };

    const savedIds = useMemo(() => new Set(savedTerms.map(term => term.id)), [savedTerms]);
    const counts = {
        latest: latestTerms.length,
        all: liveTerms.length,
        saved: savedTerms.length,
    };

    const fullPageState = (() => {
        if (poll.status === 'invalid') return { title: t.invalidTitle, body: t.invalidBody };
        if (poll.status === 'not_found' && !poll.session && savedTerms.length === 0) {
            return { title: t.notFoundTitle, body: t.notFoundBody };
        }
        if (poll.status === 'rate_limited' && !poll.session) return { title: t.rateLimitedTitle, body: t.rateLimitedBody };
        if (poll.status === 'error' && !poll.session) return { title: t.errorTitle, body: t.errorBody };
        return null;
    })();

    const pageLabel = (page: number) => lang === 'zh-TW' ? `第 ${page} 頁` : `Page ${page}`;

    return (
        <main className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-black">
                <div className="sticky top-0 z-20">
                <header className="border-b border-zinc-900 bg-black/95 px-4 py-3 backdrop-blur">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-400">
                                MarketFlow
                            </p>
                            <h1 className="mt-1 text-xl font-semibold leading-tight text-zinc-100">
                                {t.title}
                            </h1>
                            {poll.code && (
                                <p className="mt-1 font-mono text-xs text-zinc-500">{poll.code}</p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setLang(current => current === 'en' ? 'zh-TW' : 'en')}
                            className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm font-bold text-zinc-100"
                            aria-label={lang === 'en' ? 'Switch to Traditional Chinese' : 'Switch to English'}
                        >
                            <Languages className="h-4 w-4 text-emerald-400" />
                            {lang === 'en' ? 'EN' : '中文'}
                        </button>
                    </div>
                    {poll.reconnecting && (
                        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200">
                            <WifiOff className="h-3.5 w-3.5" />
                            {t.reconnecting}
                        </div>
                    )}
                    {poll.session?.status === 'ended' && (
                        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
                            {t.endedBanner}
                        </div>
                    )}
                    {poll.status === 'not_found' && (savedTerms.length > 0 || !!poll.session) && (
                        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
                            {t.savedAfterExpiry}
                        </div>
                    )}
                </header>
                {!fullPageState && (
                    <div className="border-b border-zinc-900 bg-black/95 px-4 py-3 backdrop-blur">
                        <Tabs
                            active={tab}
                            labels={{ latest: t.tabs.latest, all: t.tabs.all, saved: t.tabs.saved }}
                            counts={counts}
                            onChange={setTab}
                        />
                        {poll.session && (
                            <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                                <span>{t.currentPage}: {poll.session.currentPage || '-'}</span>
                                <span>{t.termCount}: {poll.session.termCount}</span>
                            </div>
                        )}
                    </div>
                )}
                </div>

                {fullPageState ? (
                    <section className="flex flex-1 items-center px-4">
                        <EmptyState
                            icon={<AlertCircle className="h-6 w-6" />}
                            title={fullPageState.title}
                            body={fullPageState.body}
                        />
                    </section>
                ) : (
                    <section className="flex-1 px-4 py-4">
                            {poll.status === 'loading' && !poll.session ? (
                                <div className="space-y-3">
                                    {[0, 1, 2].map(index => (
                                        <div key={index} className="h-36 rounded-lg border border-zinc-800 bg-zinc-900/60" />
                                    ))}
                                </div>
                            ) : (
                                <>
                                    {tab === 'all' && (
                                        <div className="mb-4 space-y-3">
                                            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-zinc-400">
                                                <Search className="h-4 w-4" />
                                                <input
                                                    value={query}
                                                    onChange={event => setQuery(event.target.value)}
                                                    placeholder={t.searchPlaceholder}
                                                    className="min-w-0 flex-1 bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-600"
                                                />
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setSortMode(current => current === 'appearance' ? 'alpha' : 'appearance')}
                                                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm font-semibold text-zinc-200"
                                            >
                                                <SlidersHorizontal className="h-4 w-4 text-emerald-400" />
                                                {sortMode === 'appearance' ? t.sortAppearance : t.sortAlpha}
                                            </button>
                                        </div>
                                    )}

                                    {visibleTerms.length === 0 ? (
                                        <EmptyState
                                            icon={<Bookmark className="h-6 w-6" />}
                                            title={
                                                tab === 'saved'
                                                    ? t.emptySavedTitle
                                                    : tab === 'all' && query.trim()
                                                        ? t.emptySearchTitle
                                                        : t.emptyLiveTitle
                                            }
                                            body={
                                                tab === 'saved'
                                                    ? t.emptySavedBody
                                                    : tab === 'all' && query.trim()
                                                        ? t.emptySearchBody
                                                        : t.emptyLiveBody
                                            }
                                        />
                                    ) : (
                                        <div className="space-y-3 pb-8">
                                            {visibleTerms.map(term => (
                                                <TermCard
                                                    key={term.id}
                                                    term={term}
                                                    lang={lang}
                                                    saved={savedIds.has(term.id)}
                                                    savingEnabled={savingEnabled}
                                                    onToggleSaved={toggleSaved}
                                                    pageLabel={pageLabel}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                    </section>
                )}
            </div>
        </main>
    );
}
