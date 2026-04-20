import { cn } from '../utils';

interface Props {
    checked: boolean;
    onChange: (next: boolean) => void;
    label?: React.ReactNode;
    ariaLabel?: string;
}

export function Toggle({ checked, onChange, label, ariaLabel }: Props) {
    const button = (
        <button
            onClick={() => onChange(!checked)}
            aria-label={ariaLabel}
            aria-pressed={checked}
            className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-900',
                checked ? 'bg-blue-600' : 'bg-zinc-700',
            )}
        >
            <span
                className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    checked ? 'translate-x-6' : 'translate-x-1',
                )}
            />
        </button>
    );

    if (!label) return button;

    return (
        <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-zinc-300 flex items-center">{label}</div>
            {button}
        </div>
    );
}
