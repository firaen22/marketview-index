import { useCallback, useEffect, useRef, useState } from 'react';
import {
    extractJargonImageBase64,
    isJargonEligible,
    jargonCacheKey,
    parseJargonResponse,
    prepareJargonText,
    type JargonTerm,
} from '../jargon';
import { jargonDebug } from '../jargonDebug';

interface Options {
    enabled: boolean;
    pdfUrl: string;
    lang: 'en' | 'zh-TW';
    geminiKey: string;
    // Stable, cross-machine slide identity (the slide's updatedAt). Sent to the
    // server as `${slideVersion}#${page}` so every device sharing this slide
    // hits the same server-side cache entry.
    slideVersion?: number;
}

interface LatestPageText {
    key: string;
    pdfUrl: string;
    page: number;
    text: string;
    image?: string;
}

export function useJargon(opts: Options): {
    terms: JargonTerm[];
    onPageText: (page: number, text: string, imageDataUrl?: string) => void;
    onPageChange: () => void;
} {
    const { enabled, pdfUrl, lang, geminiKey, slideVersion } = opts;
    const [terms, setTerms] = useState<JargonTerm[]>([]);
    const cacheRef = useRef(new Map<string, JargonTerm[]>());
    const latestRef = useRef<LatestPageText | null>(null);
    const activeRequestKeyRef = useRef<string | null>(null);
    const debounceRef = useRef<number | null>(null);
    const enabledRef = useRef(enabled);
    const pdfUrlRef = useRef(pdfUrl.trim());
    const langRef = useRef(lang);
    const geminiKeyRef = useRef(geminiKey);
    const slideVersionRef = useRef(slideVersion);
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

    const runPipeline = useCallback((page: number, text: string, imageDataUrl?: string) => {
        const currentPdfUrl = pdfUrlRef.current;
        const currentLang = langRef.current;
        latestRef.current = { key: '', pdfUrl: currentPdfUrl, page, text, image: imageDataUrl };
        if (!enabledRef.current) return;
        clearDebounce();

        const imageBase64 = isJargonEligible(text) ? null : extractJargonImageBase64(imageDataUrl);
        const path: 'text' | 'image' | null = isJargonEligible(text)
            ? 'text'
            : imageBase64
                ? 'image'
                : null;
        jargonDebug('pipeline', { page, textLen: text.trim().length, hasImage: !!imageDataUrl, path });
        if (!path) {
            // Not cached: extraction may have transiently failed with '' — a
            // revisit re-extracts and gets a fresh chance. Skipping the fetch
            // is free, so caching ineligible results saves nothing.
            activeRequestKeyRef.current = null;
            setTerms([]);
            return;
        }

        const key = jargonCacheKey(currentPdfUrl, page, currentLang, path);
        latestRef.current = { key, pdfUrl: currentPdfUrl, page, text, image: imageDataUrl };

        const cached = cacheRef.current.get(key);
        if (cached) {
            activeRequestKeyRef.current = null;
            setTerms(cached);
            return;
        }

        setTerms([]);
        activeRequestKeyRef.current = key;
        debounceRef.current = window.setTimeout(async () => {
            const requestKey = key;
            const requestPath = path;
            try {
                const headers: HeadersInit = { 'Content-Type': 'application/json' };
                const activeGeminiKey = geminiKeyRef.current.trim();
                if (activeGeminiKey) headers.Authorization = `Bearer ${activeGeminiKey}`;
                const version = slideVersionRef.current;
                const slideId = typeof version === 'number' && version > 0 ? `${version}#${page}` : undefined;
                const body = requestPath === 'text'
                    ? { text: prepareJargonText(text), lang: currentLang, ...(slideId ? { slideId } : {}) }
                    : { imageBase64, lang: currentLang, ...(slideId ? { slideId } : {}) };
                jargonDebug('fetchStart', { page, path: requestPath });
                const response = await fetch('/api/explain-jargon', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                });
                jargonDebug('fetchDone', { page, status: response.status });
                if (!response.ok) {
                    if (response.status !== 503) warnFailure(requestKey, new Error(`HTTP ${response.status}`));
                    if (activeRequestKeyRef.current === requestKey) {
                        const latest = latestRef.current;
                        const currentKey = latest && latest.pdfUrl === pdfUrlRef.current
                            ? jargonCacheKey(pdfUrlRef.current, latest.page, langRef.current, requestPath)
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
                jargonDebug('parsed', { page, terms: nextTerms.length });
                cacheRef.current.set(requestKey, nextTerms);
                const latest = latestRef.current;
                const currentKey = latest && latest.pdfUrl === pdfUrlRef.current
                    ? jargonCacheKey(pdfUrlRef.current, latest.page, langRef.current, requestPath)
                    : null;
                if (activeRequestKeyRef.current === requestKey && currentKey === requestKey) {
                    setTerms(nextTerms);
                }
            } catch (error) {
                jargonDebug('fetchError', { page, err: String(error).slice(0, 200) });
                warnFailure(requestKey, error);
                const latest = latestRef.current;
                const currentKey = latest && latest.pdfUrl === pdfUrlRef.current
                    ? jargonCacheKey(pdfUrlRef.current, latest.page, langRef.current, requestPath)
                    : null;
                if (activeRequestKeyRef.current === requestKey && currentKey === requestKey) {
                    setTerms([]);
                }
            }
        }, 600);
    }, [clearDebounce, warnFailure]);

    const onPageText = useCallback((page: number, text: string, imageDataUrl?: string) => {
        runPipeline(page, text, imageDataUrl);
    }, [runPipeline]);

    // Fired synchronously when the displayed PDF page changes, BEFORE the new
    // page's text extraction resolves — drops any in-flight response for the
    // previous page so its terms can never appear over the new page.
    // Also clears the latest page snapshot so enabled/lang toggles cannot replay it.
    const onPageChange = useCallback(() => {
        clearDebounce();
        latestRef.current = null;
        activeRequestKeyRef.current = null;
        setTerms([]);
    }, [clearDebounce]);

    useEffect(() => {
        geminiKeyRef.current = geminiKey;
    }, [geminiKey]);

    useEffect(() => {
        slideVersionRef.current = slideVersion;
    }, [slideVersion]);

    useEffect(() => {
        pdfUrlRef.current = pdfUrl.trim();
        clearDebounce();
        activeRequestKeyRef.current = null;
        cacheRef.current.clear();
        setTerms([]);
    }, [pdfUrl, clearDebounce]);

    useEffect(() => {
        langRef.current = lang;
        clearDebounce();
        activeRequestKeyRef.current = null;
        setTerms([]);
        const latest = latestRef.current;
        if (enabledRef.current && latest && latest.pdfUrl === pdfUrlRef.current) {
            runPipeline(latest.page, latest.text, latest.image);
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
            runPipeline(latest.page, latest.text, latest.image);
        }
    }, [enabled, clearDebounce, runPipeline]);

    useEffect(() => {
        return () => clearDebounce();
    }, [clearDebounce]);

    return { terms, onPageText, onPageChange };
}
