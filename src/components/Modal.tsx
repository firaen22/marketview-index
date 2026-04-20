import { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Card } from './ui';
import { cn } from '../utils';

interface Props {
    title: ReactNode;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    maxWidth?: string;
    zIndex?: number;
    accent?: string;
    bodyClassName?: string;
    cardClassName?: string;
}

export function Modal({
    title,
    onClose,
    children,
    footer,
    maxWidth = 'max-w-md',
    zIndex = 100,
    accent = 'from-blue-500 via-indigo-500 to-purple-500',
    bodyClassName,
    cardClassName,
}: Props) {
    return (
        <div
            className="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            style={{ zIndex }}
        >
            <Card className={cn(
                'w-full flex flex-col border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden relative',
                maxWidth,
                cardClassName,
            )}>
                <div className={cn('absolute top-0 left-0 w-full h-1 bg-gradient-to-r', accent)} />
                <div className="flex justify-between items-center p-5 pb-3">
                    <h3 className="text-lg font-bold flex items-center">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-zinc-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className={cn('px-5 pb-5', bodyClassName)}>{children}</div>
                {footer && (
                    <div className="flex gap-3 p-5 pt-3 border-t border-zinc-800">{footer}</div>
                )}
            </Card>
        </div>
    );
}
