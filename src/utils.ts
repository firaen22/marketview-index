import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// Re-exports for backward compatibility
export { getSettings, setSetting, getSetting, type PresentSlide, type PresentSlideMode } from './settings';
export { loadRemoteSlide, saveRemoteSlide, uploadPdf, deletePdf, StaleSaveError } from './slideApi';
export { injectMarketTokens } from './tokenInject';
