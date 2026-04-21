import { Save } from 'lucide-react';
import type { CloudStatus } from '../hooks/useSlideSync';

interface Props {
    cloudStatus: CloudStatus;
    onSave: () => void;
    variant?: 'full' | 'compact';
}

const STATE_STYLES: Record<CloudStatus, string> = {
    saving: 'bg-zinc-700 text-zinc-400 cursor-wait',
    ok: 'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white hover:bg-rose-500',
    idle: 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600',
};

const LABELS: Record<CloudStatus, string> = {
    saving: 'Saving…',
    ok: 'Saved',
    error: 'Retry',
    idle: 'Save',
};

const COMPACT_LABELS: Record<CloudStatus, string> = {
    saving: '↑ Saving…',
    ok: '✓ Saved',
    error: '✕ Retry',
    idle: '↑ Save',
};

export function SaveButton({ cloudStatus, onSave, variant = 'full' }: Props) {
    if (variant === 'compact') {
        return (
            <button
                onClick={onSave}
                disabled={cloudStatus === 'saving'}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition ${STATE_STYLES[cloudStatus]}`}
            >
                {COMPACT_LABELS[cloudStatus]}
            </button>
        );
    }
    return (
        <button
            onClick={onSave}
            disabled={cloudStatus === 'saving'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${STATE_STYLES[cloudStatus]}`}
        >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{LABELS[cloudStatus]}</span>
        </button>
    );
}
