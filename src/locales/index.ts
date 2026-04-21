import enLocale from './en';
import zhLocale from './zh-TW';

export type Lang = 'en' | 'zh-TW';
export type LocaleStrings = typeof enLocale;

/**
 * Runtime-augmented locale dict passed to components. Call sites extend
 * the base locale with `language`, `activeRange`, and sometimes a
 * dynamic `indexNames` map, so components should type against this.
 */
export type TDict = Omit<LocaleStrings, 'indexNames'> & {
    indexNames: Record<string, string>;
    language?: Lang;
    activeRange?: string;
};

export const DICTIONARY: Record<Lang, LocaleStrings> = {
    en: enLocale,
    'zh-TW': zhLocale,
};

/**
 * Look up the full locale bundle for a language, falling back to English
 * if an unknown language code is passed.
 */
export function getLocale(lang: Lang): LocaleStrings {
    return DICTIONARY[lang] ?? DICTIONARY.en;
}
