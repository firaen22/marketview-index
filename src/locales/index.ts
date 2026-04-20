import enLocale from './en';
import zhLocale from './zh-TW';

export type Lang = 'en' | 'zh-TW';
export type LocaleStrings = typeof enLocale;

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
