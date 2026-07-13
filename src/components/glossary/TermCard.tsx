import { Bookmark } from 'lucide-react';
import type { GlossaryTermSnapshot, GlossaryLang } from '../../../lib/glossarySession';

interface Props {
    term: GlossaryTermSnapshot;
    lang: GlossaryLang;
    saved: boolean;
    savingEnabled: boolean;
    onToggleSaved: (term: GlossaryTermSnapshot) => void;
    pageLabel: (page: number) => string;
}

function explanationFor(term: GlossaryTermSnapshot, lang: GlossaryLang): string {
    return term.explanation[lang] ?? term.explanation.en ?? term.explanation['zh-TW'] ?? '';
}

export function TermCard({ term, lang, saved, savingEnabled, onToggleSaved, pageLabel }: Props) {
    return (
        <article className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-4 py-4 shadow-lg shadow-black/20">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-xl font-semibold leading-snug text-zinc-100">
                            {term.term}
                        </h2>
                        {term.firstPage > 0 && (
                            <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
                                {pageLabel(term.firstPage)}
                            </span>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => onToggleSaved(term)}
                    disabled={!savingEnabled}
                    aria-pressed={saved}
                    aria-label={saved ? 'Remove saved term' : 'Save term'}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                        saved
                            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                            : 'border-zinc-800 bg-black/30 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100'
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                    <Bookmark className={`h-5 w-5 ${saved ? 'fill-current' : ''}`} />
                </button>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-zinc-300">
                {explanationFor(term, lang)}
            </p>
        </article>
    );
}
