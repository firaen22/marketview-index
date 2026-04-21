import type { Lang } from '../locales';

interface Props {
    language: Lang;
    onChange: (next: Lang) => void;
    className?: string;
}

export function LangToggle({ language, onChange, className }: Props) {
    return (
        <button
            onClick={() => onChange(language === 'en' ? 'zh-TW' : 'en')}
            className={className}
            aria-label={language === 'en' ? 'Switch to Traditional Chinese' : 'Switch to English'}
        >
            {language === 'en' ? 'EN' : '中文'}
        </button>
    );
}
