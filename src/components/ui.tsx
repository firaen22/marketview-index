import React from 'react';
import { cn } from '../utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("rounded-xl border border-zinc-800 bg-zinc-900/50 text-zinc-100 shadow-sm", className)}
        {...props}
    />
));
Card.displayName = "Card";

type BadgeVariant = 'default' | 'bullish' | 'bearish' | 'neutral';

export const Badge = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: BadgeVariant }>(({ className, variant = 'default', ...props }, ref) => {
    const variants: Record<BadgeVariant, string> = {
        default: "bg-zinc-100 text-zinc-900 hover:bg-zinc-100/80",
        bullish: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25",
        bearish: "bg-rose-500/15 text-rose-400 border border-rose-500/20 hover:bg-rose-500/25",
        neutral: "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20 hover:bg-zinc-500/25",
    };
    return (
        <div
            ref={ref}
            className={cn("inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2", variants[variant], className)}
            {...props}
        />
    );
});
Badge.displayName = "Badge";

export const ScrollArea = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, children, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("relative overflow-auto", className)}
        {...props}
    >
        {children}
    </div>
));
ScrollArea.displayName = "ScrollArea";
