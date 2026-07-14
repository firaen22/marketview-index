import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { IndexData } from './types';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatRelativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}

export function displayName(item: Pick<IndexData, 'name' | 'nameEn'>, lang: 'en' | 'zh-TW'): string {
    return lang === 'en' ? (item.nameEn || item.name) : item.name;
}

export function formatPrice(n: number): string {
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatWhole(n: number): string {
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function formatSigned(n: number, digits = 2): string {
    if (!Number.isFinite(n)) return '—';
    return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`;
}

export function ytdComparator(sortOrder: 'asc' | 'desc') {
    return (a: Pick<IndexData, 'ytdChangePercent'>, b: Pick<IndexData, 'ytdChangePercent'>): number => {
        const av = Number.isFinite(a.ytdChangePercent) ? a.ytdChangePercent : null;
        const bv = Number.isFinite(b.ytdChangePercent) ? b.ytdChangePercent : null;
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return sortOrder === 'desc' ? bv - av : av - bv;
    };
}

export function groupByCategory<T extends Pick<IndexData, 'category'>>(items: T[]): Record<string, T[]> {
    return items.reduce<Record<string, T[]>>((acc, item) => {
        (acc[item.category] ??= []).push(item);
        return acc;
    }, {});
}
