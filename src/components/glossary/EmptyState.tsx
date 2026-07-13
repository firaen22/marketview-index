import type { ReactNode } from 'react';

interface Props {
    icon: ReactNode;
    title: string;
    body: string;
}

export function EmptyState({ icon, title, body }: Props) {
    return (
        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 px-5 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-800 bg-black text-zinc-400">
                {icon}
            </div>
            <h2 className="mt-4 text-lg font-semibold text-zinc-100">{title}</h2>
            <p className="mt-2 text-base leading-7 text-zinc-400">{body}</p>
        </div>
    );
}
