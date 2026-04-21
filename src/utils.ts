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

export function groupByCategory<T extends Pick<IndexData, 'category'>>(items: T[]): Record<string, T[]> {
    return items.reduce<Record<string, T[]>>((acc, item) => {
        (acc[item.category] ??= []).push(item);
        return acc;
    }, {});
}

// Re-exports for backward compatibility
export { getSettings, setSetting, getSetting, type PresentSlide, type PresentSlideMode } from './settings';
export { loadRemoteSlide, saveRemoteSlide, uploadPdf, deletePdf, StaleSaveError, MAX_CONTENT_BYTES } from './slideApi';
export { injectMarketTokens } from './tokenInject';
