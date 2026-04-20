import { cn } from '../utils';

export const TIME_RANGES = ['1M', '3M', 'YTD', '1Y'] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

type Variant = 'default' | 'blue' | 'subtle';

interface Props {
    value: string;
    onChange: (range: string) => void;
    variant?: Variant;
    className?: string;
    ranges?: readonly string[];
}

const CONTAINER: Record<Variant, string> = {
    default: 'bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 backdrop-blur-md',
    blue: 'bg-zinc-900/50 p-1 rounded-xl border border-zinc-800 backdrop-blur-md',
    subtle: 'bg-zinc-900/80 p-1 rounded-lg border border-zinc-800/80 backdrop-blur-md',
};

const ACTIVE: Record<Variant, string> = {
    default: 'bg-zinc-800 text-zinc-100 shadow-sm',
    blue: 'bg-blue-600 text-white shadow-lg shadow-blue-900/20',
    subtle: 'bg-zinc-800 text-zinc-100 shadow-sm',
};

const BTN_SIZE: Record<Variant, string> = {
    default: 'px-3 py-1.5',
    blue: 'px-3 py-1.5',
    subtle: 'px-3 py-1',
};

export function TimeRangeSelector({
    value,
    onChange,
    variant = 'default',
    className,
    ranges = TIME_RANGES,
}: Props) {
    return (
        <div className={cn('flex items-center', CONTAINER[variant], className)}>
            {ranges.map((range) => (
                <button
                    key={range}
                    onClick={() => onChange(range)}
                    className={cn(
                        'text-xs font-mono font-bold rounded-lg transition-all duration-200',
                        BTN_SIZE[variant],
                        value === range
                            ? ACTIVE[variant]
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
                    )}
                >
                    {range}
                </button>
            ))}
        </div>
    );
}
