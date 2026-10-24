import { useAudienceGlossaryPoll } from '../hooks/useAudienceGlossaryPoll';

export function GlossaryAudienceStrip() {
    const { snapshot, stale } = useAudienceGlossaryPoll(true);

    if (snapshot.kind === 'none') {
        return (
            <div
                className="flex items-center px-2 py-1 rounded-md bg-zinc-900/80 border border-zinc-800 text-[0.625rem] font-mono text-zinc-500 max-w-[min(100%,20rem)] sm:max-w-[min(100%,24rem)] truncate shrink min-w-0"
                title="Audience glossary session (via /j pointer)"
            >
                {stale ? 'Glossary: unavailable' : 'Glossary: no live session'}
            </div>
        );
    }

    const { session, code } = snapshot;
    const live = session.status === 'live';

    return (
        <div
            className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 rounded-md border text-[0.625rem] font-mono max-w-[min(100%,20rem)] sm:max-w-[min(100%,28rem)] truncate shrink min-w-0 ${
                live ? 'bg-zinc-900/80 border-zinc-800 text-zinc-400' : 'bg-zinc-900/80 border-zinc-700 text-zinc-500'
            }`}
            title={`Audience session ${code} — term list not shown on control`}
        >
            <span className={live ? 'text-sky-400/90 uppercase' : 'uppercase'}>{session.status}</span>
            <span className="text-zinc-600">{code}</span>
            <span className="text-zinc-500">·</span>
            <span>p{session.currentPage}</span>
            <span className="text-zinc-500">·</span>
            <span>{session.termCount} terms</span>
            <span className="text-zinc-500">·</span>
            <span>{session.joins} joins</span>
            <span className="hidden sm:inline text-zinc-600">· {session.mode}</span>
        </div>
    );
}
