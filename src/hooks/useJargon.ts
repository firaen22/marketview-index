import { useCallback, useEffect, useRef, useState } from 'react';
import {
    isJargonEligible,
    jargonCacheKey,
    parseJargonResponse,
    prepareJargonText,
    type JargonTerm,
} from '../jargon';

interface Options {
    enabled: boolean;
    pdfUrl: string;
    lang: 'en' | 'zh-TW';
    geminiKey: string;
}

interface LatestPageText {
    key: string;
    pdfUrl: string;
    page: number;
    text: string;
}

export function useJargon(opts: Options): {
    terms: JargonTerm[];
    onPageText: (page: number, text: string) => void;
    onPageChange: () => void;
} {
    const { enabled, pdfUrl, lang, geminiKey } = opts;
    const [terms, setTerms] = useState<JargonTerm[]>([]);
    const cacheRef = useRef(new Map<string, JargonTerm[]>());
    const latestRef = useRef<LatestPageText | null>(null);
    const activeRequestKeyRef = useRef<string | null>(null);
    const debounceRef = useRef<number | null>(null);
    const enabledRef = useRef(enabled);
    const pdfUrlRef = useRef(pdfUrl.trim());
    const langRef = useRef(lang);
    const geminiKeyRef = useRef(geminiKey);
    const warnedFailureKeysRef = useRef(new Set<string>());

    const clearDebounce = useCallback(() => {
        if (debounceRef.current !== null) {
            window.clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
    }, []);

    const warnFailure = useCallback((key: string, error: unknown) => {
        if (warnedFailureKeysRef.current.has(key)) return;
        warnedFailureKeysRef.current.add(key);
        console.warn('Failed to fetch jargon explanations', error);
    }, []);

    const runPipeline = useCallback((page: number, text: string) => {
        const currentPdfUrl = pdfUrlRef.current;
        const currentLang = langRef.current;
        const key = jargonCacheKey(currentPdfUrl, page, currentLang);
        latestRef.current = { key, pdfUrl: currentPdfUrl, page, text };
        if (!enabledRef.current) return;
        clearDebounce();

        const cached = cacheRef.current.get(key);
        if (cached) {
            activeRequestKeyRef.current = null;
            setTerms(cached);
            return;
        }

        if (!isJargonEligible(text)) {
            // Not cached: extraction may have transiently failed with '' — a
            // revisit re-extracts and gets a fresh chance. Skipping the fetch
            // is free, so caching ineligible results saves nothing.
            activeRequestKeyRef.current = null;
            setTerms([]);
            return;
        }

        setTerms([]);
        activeRequestKeyRef.current = key;
        debounceRef.current = window.setTimeout(async () => {
            const requestKey = key;
            try {
                const headers: HeadersInit = { 'Content-Type': 'application/json' };
                const activeGeminiKey = geminiKeyRef.current.trim();
                if (activeGeminiKey) headers.Authorization = `Bearer ${activeGeminiKey}`;
                const response = await fetch('/api/explain-jargon', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ text: prepareJargonText(text), lang: currentLang }),
                });
                if (!response.ok) {
                    if (response.status !== 503) warnFailure(requestKey, new Error(`HTTP ${response.status}`));
                    cacheRef.current.set(requestKey, []);
                    if (activeRequestKeyRef.current === requestKey) {
                        const latest = latestRef.current;
                        const currentKey = latest && latest.pdfUrl === pdfUrlRef.current
                            ? jargonCacheKey(pdfUrlRef.current, latest.page, langRef.current)
                            : null;
                        if (currentKey === requestKey) setTerms([]);
                    }
                    return;
                }

                let payload: unknown;
                try {
                    payload = await response.json();
                } catch (error) {
                    warnFailure(requestKey, error);
                    payload = null;
                }

                const nextTerms = parseJargonResponse(payload);
                cacheRef.current.set(requestKey, nextTerms);
                const latest = latestRef.current;
                const currentKey = latest && latest.pdfUrl === pdfUrlRef.current
                    ? jargonCacheKey(pdfUrlRef.current, latest.page, langRef.current)
                    : null;
                if (activeRequestKeyRef.current === requestKey && currentKey === requestKey) {
                    setTerms(nextTerms);
                }
            } catch (error) {
                warnFailure(requestKey, error);
                cacheRef.current.set(requestKey, []);
                const latest = latestRef.current;
                const currentKey = latest && latest.pdfUrl === pdfUrlRef.current
                    ? jargonCacheKey(pdfUrlRef.current, latest.page, langRef.current)
                    : null;
                if (activeRequestKeyRef.current === requestKey && currentKey === requestKey) {
                    setTerms([]);
                }
            }
        }, 600);
    }, [clearDebounce, warnFailure]);

    const onPageText = useCallback((page: number, text: string) => {
        runPipeline(page, text);
    }, [runPipeline]);

    // Fired synchronously when the displayed PDF page changes, BEFORE the new
    // page's text extraction resolves — drops any in-flight response for the
    // previous page so its terms can never appear over the new page.
    const onPageChange = useCallback(() => {
        clearDebounce();
        activeRequestKeyRef.current = null;
        setTerms([]);
    }, [clearDebounce]);

    useEffect(() => {
        geminiKeyRef.current = geminiKey;
    }, [geminiKey]);

    useEffect(() => {
        pdfUrlRef.current = pdfUrl.trim();
        clearDebounce();
        activeRequestKeyRef.current = null;
        setTerms([]);
    }, [pdfUrl, clearDebounce]);

    useEffect(() => {
        langRef.current = lang;
        clearDebounce();
        activeRequestKeyRef.current = null;
        setTerms([]);
        const latest = latestRef.current;
        if (enabledRef.current && latest && latest.pdfUrl === pdfUrlRef.current) {
            runPipeline(latest.page, latest.text);
        }
    }, [lang, clearDebounce, runPipeline]);

    useEffect(() => {
        enabledRef.current = enabled;
        if (!enabled) {
            clearDebounce();
            activeRequestKeyRef.current = null;
            setTerms([]);
            return;
        }

        const latest = latestRef.current;
        if (latest && latest.pdfUrl === pdfUrlRef.current) {
            runPipeline(latest.page, latest.text);
        }
    }, [enabled, clearDebounce, runPipeline]);

    useEffect(() => {
        return () => clearDebounce();
    }, [clearDebounce]);

    return { terms, onPageText, onPageChange };
}
