import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MarketStatCard } from './components/MarketStatCard';
import { MacroStatCard } from './components/MacroStatCard';
import { SlideRenderer } from './components/SlideRenderer';
import { SlideErrorBoundary } from './components/SlideErrorBoundary';
import { getSettings, normalizePresentCycle, setSetting, type PresentCycle, type PresentView } from './settings';
import { useSlideSync } from './hooks/useSlideSync';
import { useSettingsSync } from './hooks/useSettingsSync';
import { useClock } from './hooks/useClock';
import { getLocale } from './locales';
import { Pencil, Maximize2, Minimize2, ExternalLink, Keyboard, LayoutGrid, Rows3, EyeOff, LayoutDashboard, Presentation, TrendingUp, Sunrise, Grid3x3, Play, Pause, QrCode } from 'lucide-react';
import { TickerItem } from './components/TickerItem';
import { Link } from 'react-router-dom';
import { STRIP_MODES, type StripMode } from './constants';
import { useMarketData } from './hooks/useMarketData';
import { useMacroData } from './hooks/useMacroData';
import { useQuotePanel } from './hooks/useQuotePanel';
import { QuotePanel } from './components/QuotePanel';
import { QuotePickerModal } from './components/QuotePickerModal';
import { QuoteSpotlight } from './components/QuoteSpotlight';
import { QuoteSpotlightSearch } from './components/QuoteSpotlightSearch';
import { MorningBriefPanel } from './components/MorningBriefPanel';
import { IndexChartModal } from './components/IndexChartModal';
import { SlideEditorPanel } from './components/SlideEditorPanel';
import { GlossarySessionPanel } from './components/GlossarySessionPanel';
import { useGlossarySession } from './hooks/useGlossarySession';
import { JargonSpotlight } from './components/JargonSpotlight';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useJargon } from './hooks/useJargon';
import type { PdfViewerHandle } from './components/PdfViewer';
import { getAllMarketStatuses } from './marketHours';
import { MarketStatusChip } from './components/MarketStatusChip';
import { usePresentCommand } from './hooks/usePresentCommand';
import type { ProjectorState } from './hooks/usePresentCommand';
import { CYCLE_DWELL_PRESETS, PRESENT_RANGES, type PresentCommand, type PresentRange } from '../lib/presentCommand';
import { buildGlossaryLookup, JARGON_GLOSSARY, lookupExplanation, normalizeTerm } from '../lib/jargonGlossary';
import { parseJargonResponse, type JargonTerm } from './jargon';
import { authHeaders } from './presentCommandApi';
import { indexToQuoteItem } from './types/QuoteItem';
import type { TimeRange } from './types';

type RangeParity = [PresentRange] extends [TimeRange] ? ([TimeRange] extends [PresentRange] ? true : false) : false;
const _rangeParity: RangeParity = true;
const _presentRangesParity: readonly TimeRange[] = PRESENT_RANGES;

type QuotePanelController = Pick<ReturnType<typeof useQuotePanel>, 'closeChart' | 'dismissSpotlight' | 'openChart' | 'openSpotlight' | 'allItems'>;

interface PresentationCommandExecutorDeps {
    marketData: ReturnType<typeof useMarketData>['data'];
    qp: QuotePanelController;
    setRemoteCompare: React.Dispatch<React.SetStateAction<{ id: string; symbols: string[] } | null>>;
    resetDwellCountdown: () => void;
    mainView: PresentView;
    setMainView: React.Dispatch<React.SetStateAction<PresentView>>;
    slideMode: ReturnType<typeof useSlideSync>['slide']['mode'];
    pdfRef: React.RefObject<PdfViewerHandle | null>;
    setJargonEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    persistPresentCycle: (next: PresentCycle) => void;
    normalizedPresentCycle: PresentCycle;
    setDataRange: React.Dispatch<React.SetStateAction<TimeRange>>;
    showExplainTerm: (term: string, commandId: string) => void;
    clearRemoteJargon: () => void;
    postToIndexIframe: (msg: unknown) => boolean;
}

export async function fetchExplainTerm(
    term: string,
    lang: 'en' | 'zh-TW',
    geminiKey: string,
    signal?: AbortSignal,
): Promise<JargonTerm | null> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders() };
    if (geminiKey) headers.Authorization = `Bearer ${geminiKey}`;
    const response = await fetch('/api/explain-jargon', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text: term, lang }),
        signal,
    });
    if (!response.ok) return null;
    const terms = parseJargonResponse(await response.json());
    if (terms.length === 0) return null;
    return terms.find(item => normalizeTerm(item.term) === normalizeTerm(term)) ?? terms[0];
}

// A PDF page turn must drop the presenter's `explain` card: it captions the page
// it was asked on, and while it is up it also suppresses that page's own auto
// jargon card (it is the `?` branch of the render ternary below). PdfViewer
// re-fires onPageChange whenever the callback identity churns, so an UNCHANGED
// page must NOT clear a card the presenter just asked for. lastPage === 0 means
// "no page rendered yet" — first render, and after the deck-swap reset.
export function handlePdfPageChangeWithDeps(
    page: number,
    deps: { lastPage: number; clearRemoteJargon: () => void; onJargonPageChange: () => void },
): void {
    if (deps.lastPage > 0 && deps.lastPage !== page) deps.clearRemoteJargon();
    deps.onJargonPageChange();
}

export function executePresentationCommandWithDeps(cmd: PresentCommand, deps: PresentationCommandExecutorDeps): boolean {
    const {
        marketData,
        qp,
        setRemoteCompare,
        resetDwellCountdown,
        mainView,
        setMainView,
        slideMode,
        pdfRef,
        setJargonEnabled,
        persistPresentCycle,
        normalizedPresentCycle,
        setDataRange,
        showExplainTerm,
        clearRemoteJargon,
        postToIndexIframe,
    } = deps;

    if (cmd.kind === 'clear') {
        qp.closeChart();
        qp.dismissSpotlight();
        setRemoteCompare(null);
        clearRemoteJargon();
        setMainView('slide');
        resetDwellCountdown();
        return true;
    }

    if (cmd.kind === 'view') {
        setMainView(cmd.view!);
        resetDwellCountdown();
        return true;
    }

    if (cmd.kind === 'page') {
        // Page commands are queue-drained (already consumed server-side): if the
        // projector is not on a mounted PDF slide, the turn is dropped, not retried.
        if (mainView !== 'slide' || slideMode !== 'pdf' || !pdfRef.current) return false;
        if (cmd.direction === 'next') pdfRef.current.nextPage();
        else pdfRef.current.prevPage();
        resetDwellCountdown();
        return true;
    }

    if (cmd.kind === 'goto') {
        if (slideMode !== 'pdf') return false;
        if (mainView !== 'slide') {
            setMainView('slide');
            resetDwellCountdown();
            return false;
        }
        if (!pdfRef.current) return false;
        // The imperative handle is published the moment PdfViewer mounts, well
        // before the document finishes downloading — so a goto issued during
        // that window must NOT be reported as executed, or usePresentCommand
        // locks its id and the page turn is lost instead of retried.
        if (!pdfRef.current.goToPage(cmd.page === 'first' ? 1 : cmd.page === 'last' ? 'last' : cmd.page)) return false;
        resetDwellCountdown();
        return true;
    }

    if (cmd.kind === 'jargon') {
        setJargonEnabled(cmd.on);
        setSetting('jargonEnabled', cmd.on);
        return true;
    }

    if (cmd.kind === 'cycle') {
        persistPresentCycle({
            ...normalizedPresentCycle,
            enabled: cmd.on,
            ...(cmd.dwellSec !== undefined ? { dwellSec: cmd.dwellSec } : {}),
        });
        return true;
    }

    if (cmd.kind === 'range') {
        setDataRange(cmd.range);
        resetDwellCountdown();
        return true;
    }

    if (cmd.kind === 'explain') {
        showExplainTerm(cmd.term!, cmd.id);
        return true;
    }

    if (cmd.kind === 'highlight') {
        if (mainView !== 'index') {
            setMainView('index');
            resetDwellCountdown();
            return false;
        }
        if (!postToIndexIframe({ type: 'mv-highlight', symbol: cmd.symbols[0] })) return false;
        resetDwellCountdown();
        return true;
    }

    if (cmd.kind === 'chart' || cmd.kind === 'compare') {
        if (cmd.range) setDataRange(cmd.range);
        const found = marketData.find(d => d.symbol === cmd.symbols[0]);
        if (!found) return false;
        qp.dismissSpotlight();
        setRemoteCompare({
            id: cmd.id,
            symbols: cmd.kind === 'compare' ? cmd.symbols.slice(1) : [],
        });
        qp.openChart(indexToQuoteItem(found));
        return true;
    }

    const item = qp.allItems.find(i => i.id === cmd.symbols[0]);
    if (!item) return false;
    qp.closeChart();
    setRemoteCompare(null);
    qp.openSpotlight(item);
    return true;
}

export default function PresentationPage() {
    const { slide, saveSlide, doRemoteSave, cloudStatus, lastSavedAt, sizeWarning } = useSlideSync();
    const initialSettings = React.useMemo(() => getSettings(), []);
    const geminiKey = initialSettings.geminiKey;
    const [editorOpen, setEditorOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showHints, setShowHints] = useState(false);
    const [stripMode, setStripMode] = useState<StripMode>('compact');
    const [pdfZoom, setPdfZoom] = useState(100);
    const [mainView, setMainView] = useState<PresentView>('slide');
    const [presentCycle, setPresentCycle] = useState<PresentCycle>(() => normalizePresentCycle(initialSettings.presentCycle));
    const [jargonEnabled, setJargonEnabled] = useState(initialSettings.jargonEnabled);
    const [dataRange, setDataRange] = useState<TimeRange>('YTD');
    const [dwellResetNonce, setDwellResetNonce] = useState(0);
    const [kioskHidden, setKioskHidden] = useState(false);
    const [statusNow, setStatusNow] = useState(() => Date.now());
    const clock = useClock();
    const [lang, setLang] = useState<'en' | 'zh-TW'>(initialSettings.lang);
    const [tickerSymbols, setTickerSymbols] = useState<string[] | null>(initialSettings.tickerSymbols);
    const [morningBrief, setMorningBrief] = useState<string[]>(initialSettings.morningBrief);
    const [briefPanelOpen, setBriefPanelOpen] = useState(false);
    const [glossaryPanelOpen, setGlossaryPanelOpen] = useState(false);
    const [remoteCompare, setRemoteCompare] = useState<{ id: string; symbols: string[] } | null>(null);
    const [remoteJargon, setRemoteJargon] = useState<{ id: string; terms: JargonTerm[] } | null>(null);
    const hintsTimerRef = useRef<number | null>(null);
    const kioskTimerRef = useRef<number | null>(null);
    const remoteJargonTimerRef = useRef<number | null>(null);
    const latestExplainIdRef = useRef<string | null>(null);
    // Declared up here, not beside showExplainTerm: glossaryOnPdfPageChange below
    // depends on it, and a useCallback dep list evaluates during render — so a
    // later `const` would be a temporal-dead-zone ReferenceError on first paint.
    const clearRemoteJargon = useCallback(() => {
        if (remoteJargonTimerRef.current) {
            window.clearTimeout(remoteJargonTimerRef.current);
            remoteJargonTimerRef.current = null;
        }
        latestExplainIdRef.current = null;
        setRemoteJargon(null);
    }, []);
    const indexIframeRef = useRef<HTMLIFrameElement | null>(null);
    const indexIframeLoadedRef = useRef(false);
    // The DOM node indexIframeLoadedRef was last marked loaded for, so a ref
    // re-attach to the SAME already-loaded element does not strand the flag false.
    const lastLoadedIndexNodeRef = useRef<HTMLIFrameElement | null>(null);
    const hasLoggedMarketStatusError = useRef(false);
    const iframeCleanupRef = useRef<Partial<Record<'index' | 'heatmap', () => void>>>({});
    const pdfRef = useRef<PdfViewerHandle>(null);
    const normalizedPresentCycle = React.useMemo(() => normalizePresentCycle(presentCycle), [presentCycle]);
    const glossaryLookup = React.useMemo(() => buildGlossaryLookup(JARGON_GLOSSARY), []);
    const cycleRunning = normalizedPresentCycle.enabled && normalizedPresentCycle.views.length >= 2;

    useSettingsSync(({ lang: nextLang, tickerSymbols: nextSymbols }) => {
        if (nextLang) setLang(nextLang);
        if (nextSymbols !== undefined) setTickerSymbols(nextSymbols);
    });

    const t = React.useMemo(() => ({ ...getLocale(lang), language: lang, activeRange: dataRange }), [lang, dataRange]);

    const { data: marketData, isLoading: marketLoading } = useMarketData({ range: dataRange, lang, refreshMs: 10 * 60 * 1000 });
    const { data: macroData } = useMacroData({ lang, refreshMs: 60 * 60 * 1000 });
    const qp = useQuotePanel({ marketData, macroData });
    const jargon = useJargon({ enabled: jargonEnabled && mainView === 'slide' && slide.mode === 'pdf', pdfUrl: slide.mode === 'pdf' ? slide.content : '', lang, geminiKey, slideVersion: slide.mode === 'pdf' ? slide.updatedAt : undefined });
    const glossary = useGlossarySession();
    const cyclePaused = editorOpen || !!qp.spotlight || qp.isPickerOpen || qp.isSearchOpen || briefPanelOpen || glossaryPanelOpen || !!qp.chartItem;

    // Session-glossary attribution: useJargon clears its terms synchronously on
    // page flip and drops stale in-flight responses, so jargon.terms is only
    // ever non-empty for the page reportPage last recorded — a term can never
    // be attributed to the wrong page.
    const { reportPage: glossaryReportPage, reportTerms: glossaryReportTerms } = glossary;
    // Last PDF page the presenter has rendered, so a session started AFTER the
    // page was already on screen can re-report it (see the session-start effect).
    const lastPdfPageRef = useRef(0);
    const glossaryOnPageText = useCallback((page: number, text: string, imageDataUrl?: string) => {
        lastPdfPageRef.current = page;
        glossaryReportPage(page);
        jargon.onPageText(page, text, imageDataUrl);
    }, [glossaryReportPage, jargon.onPageText]);
    // PdfViewer fires onPageChange with the page number as soon as the page
    // renders — well before the slower onPageText extraction — so track the ref
    // here too, or a session started in that window reports the previous page.
    const glossaryOnPdfPageChange = useCallback((page: number) => {
        handlePdfPageChangeWithDeps(page, {
            lastPage: lastPdfPageRef.current,
            clearRemoteJargon,
            onJargonPageChange: jargon.onPageChange,
        });
        lastPdfPageRef.current = page;
    }, [jargon.onPageChange, clearRemoteJargon]);
    // A deck swap must not let a session started before the new PDF renders
    // report the OLD deck's page number.
    const currentPdfUrl = slide.mode === 'pdf' ? slide.content : '';
    useEffect(() => {
        lastPdfPageRef.current = 0;
    }, [currentPdfUrl]);
    const projectorReportRef = useRef<{ mainView: PresentView; slideMode: typeof slide.mode; updatedAt: number } | null>(null);
    projectorReportRef.current = { mainView, slideMode: slide.mode, updatedAt: slide.updatedAt };
    const getProjectorState = useCallback((): ProjectorState | null => {
        const current = projectorReportRef.current;
        if (!current) return null;
        if (current.mainView === 'slide') {
            return {
                mode: current.slideMode,
                page: current.slideMode === 'pdf' ? Math.max(lastPdfPageRef.current, 1) : 1,
                v: current.updatedAt,
            };
        }
        if (current.mainView === 'index' || current.mainView === 'heatmap') {
            return { mode: current.mainView, page: 1, v: current.updatedAt };
        }
        return null;
    }, []);
    // Depend on jargon.terms only, NOT lang: on a mid-session language flip the
    // new lang commits a render before useJargon clears the old-language terms,
    // so firing on `lang` would push old-language text under the new label —
    // and mergeTerms only fills an empty slot, making that corruption stick.
    // reportTerms takes lang as an argument and the effect closes over the
    // current lang whenever the terms themselves change, so the correct push
    // still lands when the refetched terms arrive.
    useEffect(() => {
        if (jargon.terms.length > 0) glossaryReportTerms(jargon.terms, lang);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jargon.terms, glossaryReportTerms]);
    // When a session goes live (or the presenter switches to a PDF slide while
    // live), re-report the page already on screen. Term extraction only fires on
    // PDF load/page-change, so a session started while parked on a page would
    // otherwise stay at currentPage 0 and never push a term until the next flip.
    // If the server already has this page, skip both pushes; successful pushes
    // update session.currentPage, so the dependency re-run lands here and stops.
    const glossaryStatus = glossary.session?.status;
    const glossaryCurrentPage = glossary.session?.currentPage ?? 0;
    useEffect(() => {
        if (glossaryStatus !== 'live') return;
        if (!(mainView === 'slide' && slide.mode === 'pdf')) return;
        const page = lastPdfPageRef.current;
        if (page < 1) return;
        if (glossaryCurrentPage === page) return;
        glossaryReportPage(page);
        if (jargon.terms.length > 0) glossaryReportTerms(jargon.terms, lang);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [glossaryStatus, glossaryCurrentPage, mainView, slide.mode, glossaryReportPage, glossaryReportTerms]);
    const dwellSec = normalizedPresentCycle.dwellSec;

    const marketStatuses = React.useMemo(() => {
        try {
            return getAllMarketStatuses(new Date(statusNow));
        } catch (error) {
            if (!hasLoggedMarketStatusError.current) {
                console.error('Failed to compute market statuses', error);
                hasLoggedMarketStatusError.current = true;
            }
            return [];
        }
    }, [statusNow]);

    const briefItems = React.useMemo(
        () => morningBrief
            .map(id => qp.allItems.find(i => i.id === id))
            .filter((x): x is NonNullable<typeof x> => !!x),
        [morningBrief, qp.allItems]
    );

    const saveBrief = useCallback((next: string[]) => {
        setMorningBrief(next);
        setSetting('morningBrief', next);
    }, []);

    const resetDwellCountdown = useCallback(() => {
        setDwellResetNonce(n => n + 1);
    }, []);

    const scheduleRemoteJargonClear = useCallback(() => {
        if (remoteJargonTimerRef.current) window.clearTimeout(remoteJargonTimerRef.current);
        remoteJargonTimerRef.current = window.setTimeout(() => {
            setRemoteJargon(null);
            remoteJargonTimerRef.current = null;
        }, 30_000);
    }, []);

    const showExplainTerm = useCallback((term: string, commandId: string) => {
        if (latestExplainIdRef.current === commandId) return;
        latestExplainIdRef.current = commandId;
        const explanation = lookupExplanation(term, lang, glossaryLookup);
        if (explanation) {
            setRemoteJargon({ id: commandId, terms: [{ term, explanation }] });
            scheduleRemoteJargonClear();
            return;
        }
        void fetchExplainTerm(term, lang, geminiKey)
            .then(result => {
                if (!result || latestExplainIdRef.current !== commandId) return;
                setRemoteJargon({ id: commandId, terms: [result] });
                scheduleRemoteJargonClear();
            })
            .catch(() => undefined);
    }, [geminiKey, glossaryLookup, lang, scheduleRemoteJargonClear]);

    const postToIndexIframe = useCallback((msg: unknown): boolean => {
        const win = indexIframeRef.current?.contentWindow;
        if (!win || !indexIframeLoadedRef.current) return false;
        win.postMessage(msg, window.location.origin);
        return true;
    }, []);

    const persistPresentCycle = useCallback((next: PresentCycle) => {
        const normalized = normalizePresentCycle(next);
        setPresentCycle(normalized);
        setSetting('presentCycle', normalized);
        resetDwellCountdown();
    }, [resetDwellCountdown]);

    const toggleJargon = useCallback(() => {
        setJargonEnabled(prev => {
            const next = !prev;
            setSetting('jargonEnabled', next);
            return next;
        });
    }, []);

    // Returns false when the command's symbol isn't in the (possibly still
    // loading) data — usePresentCommand then leaves the id unlocked and the
    // next poll retries, instead of losing the command forever.
    const executePresentCommand = useCallback((cmd: PresentCommand): boolean => executePresentationCommandWithDeps(cmd, {
        marketData,
        qp,
        setRemoteCompare,
        resetDwellCountdown,
        mainView,
        setMainView,
        slideMode: slide.mode,
        pdfRef,
        setJargonEnabled,
        persistPresentCycle,
        normalizedPresentCycle,
        setDataRange,
        showExplainTerm,
        clearRemoteJargon,
        postToIndexIframe,
    }), [marketData, qp, resetDwellCountdown, mainView, slide.mode, persistPresentCycle, normalizedPresentCycle, setDataRange, showExplainTerm, clearRemoteJargon, postToIndexIframe]);

    usePresentCommand({ enabled: true, getState: getProjectorState, onCommand: executePresentCommand });

    const cycleMainView = useCallback(() => {
        setMainView(v => v === 'slide' ? 'index' : v === 'index' ? 'heatmap' : 'slide');
        resetDwellCountdown();
    }, [resetDwellCountdown]);

    const toggleHeatmapView = useCallback(() => {
        setMainView(v => v === 'heatmap' ? 'slide' : 'heatmap');
        resetDwellCountdown();
    }, [resetDwellCountdown]);

    const toggleCycle = useCallback(() => {
        persistPresentCycle({ ...normalizedPresentCycle, enabled: !normalizedPresentCycle.enabled });
    }, [normalizedPresentCycle, persistPresentCycle]);

    const cycleDwellPreset = useCallback(() => {
        const current = normalizedPresentCycle.dwellSec;
        const presets: readonly number[] = CYCLE_DWELL_PRESETS;
        const currentIndex = presets.indexOf(current);
        const nextDwell = currentIndex >= 0
            ? presets[(currentIndex + 1) % presets.length]
            : presets.find(v => v > current) ?? presets[0];
        persistPresentCycle({ ...normalizedPresentCycle, dwellSec: nextDwell });
    }, [normalizedPresentCycle, persistPresentCycle]);

    // Auto-show hints overlay briefly on first mount, then auto-hide
    useEffect(() => {
        setShowHints(true);
        hintsTimerRef.current = window.setTimeout(() => setShowHints(false), 4500);
        return () => {
            if (hintsTimerRef.current) clearTimeout(hintsTimerRef.current);
        };
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
    }, []);

    useEffect(() => {
        const onFs = () => {
            const next = !!document.fullscreenElement;
            setIsFullscreen(next);
            if (!next) {
                if (kioskTimerRef.current) {
                    window.clearTimeout(kioskTimerRef.current);
                    kioskTimerRef.current = null;
                }
                setKioskHidden(false);
            }
        };
        document.addEventListener('fullscreenchange', onFs);
        return () => document.removeEventListener('fullscreenchange', onFs);
    }, []);

    // Read fullscreen state through a ref so wakeKiosk keeps a stable identity.
    // wakeKiosk feeds the presenter callbacks, which feed attachIframeListeners;
    // if wakeKiosk's identity churned on every fullscreen toggle, the index
    // iframe's ref callback re-ran and reset indexIframeLoadedRef to false on an
    // already-loaded element (no fresh 'load' event fires), wedging it false and
    // silently dropping every subsequent `highlight` command.
    const isFullscreenRef = useRef(isFullscreen);
    isFullscreenRef.current = isFullscreen;
    const wakeKiosk = useCallback(() => {
        if (!isFullscreenRef.current) return;
        setKioskHidden(false);
        if (kioskTimerRef.current) window.clearTimeout(kioskTimerRef.current);
        kioskTimerRef.current = window.setTimeout(() => setKioskHidden(true), 5000);
    }, []);

    const handlePresenterKeydown = useCallback(() => {
        resetDwellCountdown();
        wakeKiosk();
    }, [resetDwellCountdown, wakeKiosk]);

    const handlePresenterPointerDown = useCallback(() => {
        resetDwellCountdown();
        wakeKiosk();
    }, [resetDwellCountdown, wakeKiosk]);

    const handlePresenterPointerMove = useCallback(() => {
        wakeKiosk();
    }, [wakeKiosk]);

    useEffect(() => {
        if (!isFullscreen) {
            setKioskHidden(false);
            if (kioskTimerRef.current) {
                window.clearTimeout(kioskTimerRef.current);
                kioskTimerRef.current = null;
            }
            return;
        }
        wakeKiosk();
        return () => {
            if (kioskTimerRef.current) {
                window.clearTimeout(kioskTimerRef.current);
                kioskTimerRef.current = null;
            }
        };
    }, [isFullscreen, wakeKiosk]);

    useEffect(() => {
        window.addEventListener('keydown', handlePresenterKeydown, true);
        window.addEventListener('pointerdown', handlePresenterPointerDown, true);
        window.addEventListener('pointermove', handlePresenterPointerMove, true);
        return () => {
            window.removeEventListener('keydown', handlePresenterKeydown, true);
            window.removeEventListener('pointerdown', handlePresenterPointerDown, true);
            window.removeEventListener('pointermove', handlePresenterPointerMove, true);
        };
    }, [handlePresenterKeydown, handlePresenterPointerDown, handlePresenterPointerMove]);

    useEffect(() => {
        if (!cycleRunning || cyclePaused) return;
        const timeout = window.setTimeout(() => {
            const views = normalizedPresentCycle.views;
            setMainView(prev => {
                const currentIndex = views.indexOf(prev);
                return currentIndex < 0 ? views[0] : views[(currentIndex + 1) % views.length];
            });
            setDwellResetNonce(n => n + 1);
        }, dwellSec * 1000);
        return () => window.clearTimeout(timeout);
    }, [cycleRunning, cyclePaused, normalizedPresentCycle, dwellResetNonce, dwellSec]);

    useEffect(() => {
        const interval = window.setInterval(() => setStatusNow(Date.now()), 10_000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => () => {
        if (remoteJargonTimerRef.current) window.clearTimeout(remoteJargonTimerRef.current);
    }, []);

    const isTypingTarget = useCallback((target: EventTarget | null) => {
        const element = target as HTMLElement | null;
        return !!element && (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT' || element.isContentEditable);
    }, []);

    const attachIframeListeners = useCallback((view: 'index' | 'heatmap') => (node: HTMLIFrameElement | null) => {
        if (view === 'index') {
            indexIframeRef.current = node;
            // Only treat this as an unloaded iframe when the DOM node genuinely
            // changes. React re-invokes a ref callback (detach with null, then
            // re-attach the SAME node) whenever the callback's identity changes;
            // that same already-loaded element fires no fresh 'load' event, so
            // blindly clearing the flag here would strand it false and silently
            // drop every subsequent `highlight` command.
            if (node && node !== lastLoadedIndexNodeRef.current) indexIframeLoadedRef.current = false;
        }
        iframeCleanupRef.current[view]?.();
        delete iframeCleanupRef.current[view];
        if (!node) return;

        let cleanupContent: (() => void) | null = null;
        const bindContentWindow = () => {
            cleanupContent?.();
            cleanupContent = null;
            try {
                const win = node.contentWindow;
                if (!win) return;
                const onKeydown = (event: KeyboardEvent) => {
                    handlePresenterKeydown();
                    if (event.key !== 'Escape' && isTypingTarget(event.target)) return;
                    const forwarded = new KeyboardEvent('keydown', {
                        key: event.key,
                        code: event.code,
                        ctrlKey: event.ctrlKey,
                        metaKey: event.metaKey,
                        altKey: event.altKey,
                        shiftKey: event.shiftKey,
                        bubbles: true,
                        cancelable: true,
                    });
                    window.dispatchEvent(forwarded);
                    if (forwarded.defaultPrevented) event.preventDefault();
                };
                const onPointerDown = () => handlePresenterPointerDown();
                const onPointerMove = () => handlePresenterPointerMove();
                win.addEventListener('keydown', onKeydown);
                win.addEventListener('pointerdown', onPointerDown);
                win.addEventListener('pointermove', onPointerMove);
                cleanupContent = () => {
                    win.removeEventListener('keydown', onKeydown);
                    win.removeEventListener('pointerdown', onPointerDown);
                    win.removeEventListener('pointermove', onPointerMove);
                };
            } catch {
                cleanupContent = null;
            }
        };

        const onLoad = () => {
            if (view === 'index') {
                indexIframeLoadedRef.current = true;
                lastLoadedIndexNodeRef.current = node;
            }
            bindContentWindow();
        };
        node.addEventListener('load', onLoad);
        bindContentWindow();
        iframeCleanupRef.current[view] = () => {
            node.removeEventListener('load', onLoad);
            cleanupContent?.();
        };
    }, [handlePresenterKeydown, handlePresenterPointerDown, handlePresenterPointerMove, isTypingTarget]);

    useEffect(() => {
        return () => {
            Object.values(iframeCleanupRef.current).forEach(cleanup => cleanup?.());
            iframeCleanupRef.current = {};
            indexIframeRef.current = null;
            if (remoteJargonTimerRef.current) window.clearTimeout(remoteJargonTimerRef.current);
        };
    }, []);
    const attachIndexIframe = React.useMemo(() => attachIframeListeners('index'), [attachIframeListeners]);
    const attachHeatmapIframe = React.useMemo(() => attachIframeListeners('heatmap'), [attachIframeListeners]);

    useKeyboardShortcuts({
        onEdit: useCallback(() => setEditorOpen(o => !o), []),
        onFullscreen: toggleFullscreen,
        onCycleStrip: useCallback(() => setStripMode(m => STRIP_MODES[(STRIP_MODES.indexOf(m) + 1) % STRIP_MODES.length]), []),
        onToggleView: cycleMainView,
        onTogglePlay: toggleCycle,
        onToggleQuote: useCallback(() => {
            if (qp.isSearchOpen) { qp.closeSearch(); return; }
            if (qp.spotlight) { qp.dismissSpotlight(); return; }
            if (briefItems.length > 0) { qp.openSpotlight(briefItems[0]); return; }
            qp.openSearch();
        }, [qp, briefItems]),
        onToggleJargon: toggleJargon,
        onToggleHints: useCallback(() => setShowHints(s => !s), []),
        // Escape closes the topmost overlay only. IndexChartModal owns its own
        // Escape (it layers an internal compare-picker we can't see from here).
        onEscape: useCallback(() => {
            if (qp.chartItem) return;
            if (qp.isSearchOpen) { qp.closeSearch(); return; }
            if (qp.spotlight) { qp.dismissSpotlight(); return; }
            if (qp.isPickerOpen) { qp.closePicker(); return; }
            if (briefPanelOpen) { setBriefPanelOpen(false); return; }
            // The panel's fullscreen QR overlay owns its own Escape (capture +
            // stopPropagation), so reaching here means only the panel is open.
            if (glossaryPanelOpen) { setGlossaryPanelOpen(false); return; }
            if (editorOpen) { setEditorOpen(false); return; }
            setShowHints(false);
        }, [qp, briefPanelOpen, glossaryPanelOpen, editorOpen]),
        onArrowLeft: useCallback(() => {
            if (!qp.spotlight) {
                if (mainView === 'slide' && slide.mode === 'pdf') pdfRef.current?.prevPage();
                return;
            }
            const cycleList = briefItems.some(b => b.id === qp.spotlight!.id) ? briefItems : qp.pinned;
            if (cycleList.length < 2) return;
            const i = cycleList.findIndex(p => p.id === qp.spotlight!.id);
            if (i < 0) return;
            qp.openSpotlight(cycleList[(i - 1 + cycleList.length) % cycleList.length]);
        }, [qp, briefItems, mainView, slide.mode]),
        onArrowRight: useCallback(() => {
            if (!qp.spotlight) {
                if (mainView === 'slide' && slide.mode === 'pdf') pdfRef.current?.nextPage();
                return;
            }
            const cycleList = briefItems.some(b => b.id === qp.spotlight!.id) ? briefItems : qp.pinned;
            if (cycleList.length < 2) return;
            const i = cycleList.findIndex(p => p.id === qp.spotlight!.id);
            if (i < 0) return;
            qp.openSpotlight(cycleList[(i + 1) % cycleList.length]);
        }, [qp, briefItems, mainView, slide.mode]),
        // Presentation clickers send PageUp/PageDown — always flip the PDF.
        onPageUp: useCallback(() => {
            if (mainView === 'slide' && slide.mode === 'pdf') pdfRef.current?.prevPage();
        }, [mainView, slide.mode]),
        onPageDown: useCallback(() => {
            if (mainView === 'slide' && slide.mode === 'pdf') pdfRef.current?.nextPage();
        }, [mainView, slide.mode]),
    });

    const pinnedRaw = tickerSymbols !== null
        ? marketData.filter(d => tickerSymbols.includes(d.symbol))
        : marketData;
    const pinned = pinnedRaw.length > 0 ? pinnedRaw : marketData;

    return (
        <div className={`h-screen overflow-hidden w-full bg-black text-zinc-100 flex flex-col relative ${kioskHidden ? 'cursor-none' : ''}`}>
            {/* Top bar */}
            <div className={`overflow-hidden transition-[max-height,opacity] duration-300 ${kioskHidden ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-20 opacity-100'}`}>
                <div className="flex items-center justify-between px-8 py-3 border-b border-zinc-900">
                    <div className="text-sm font-mono tracking-widest text-zinc-500">
                        MARKETFLOW · PRESENT
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-sm font-mono text-zinc-400">{clock}</div>
                        <div className="flex items-center gap-1">
                        <button
                            onClick={cycleMainView}
                            className={`p-1.5 rounded hover:bg-zinc-800 transition ${mainView === 'index' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400'}`}
                            title="Cycle slide, index, and heatmap views (I)"
                        >
                            {mainView === 'slide' ? <LayoutDashboard className="w-4 h-4" /> : <Presentation className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={toggleHeatmapView}
                            className={`p-1.5 rounded hover:bg-zinc-800 transition ${mainView === 'heatmap' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400'}`}
                            title="Toggle heatmap view (heatmap ↔ slide)"
                        >
                            <Grid3x3 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={toggleCycle}
                            className={`p-1.5 rounded hover:bg-zinc-800 transition ${cycleRunning ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400'}`}
                            title={normalizedPresentCycle.enabled && !cycleRunning ? 'Playlist needs at least 2 views' : `${cycleRunning ? 'Pause' : 'Play'} playlist (P)`}
                        >
                            {cycleRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={cycleDwellPreset}
                            className="px-2 py-1 rounded hover:bg-zinc-800 transition text-[11px] leading-none font-mono text-zinc-400"
                            title="Cycle playlist dwell time"
                        >
                            {normalizedPresentCycle.dwellSec}s
                        </button>
                        <Link
                            to="/"
                            className="p-1.5 rounded hover:bg-zinc-800 transition text-zinc-400 hover:text-emerald-400"
                            title="Exit to Dashboard"
                        >
                            <ExternalLink className="w-4 h-4" />
                        </Link>
                        <div className="h-4 w-px bg-zinc-800 mx-1"></div>
                        <button
                            onClick={() => setStripMode(m => STRIP_MODES[(STRIP_MODES.indexOf(m) + 1) % STRIP_MODES.length])}
                            className="p-1.5 rounded hover:bg-zinc-800 transition text-zinc-400"
                            title={`Strip: ${stripMode} (S)`}
                        >
                            {stripMode === 'full' ? <LayoutGrid className="w-4 h-4" />
                                : stripMode === 'compact' ? <Rows3 className="w-4 h-4" />
                                : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={qp.togglePicker}
                            className={`p-1.5 rounded hover:bg-zinc-800 transition ${qp.isPickerOpen || qp.hasPinned ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400'}`}
                            title="Quote overlay (Q)"
                        >
                            <TrendingUp className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setBriefPanelOpen(true)}
                            className={`p-1.5 rounded hover:bg-zinc-800 transition ${briefItems.length > 0 ? 'text-amber-400' : 'text-zinc-400'}`}
                            title={`Morning Brief${briefItems.length ? ` (${briefItems.length})` : ''}`}
                        >
                            <Sunrise className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setGlossaryPanelOpen(o => !o)}
                            className={`p-1.5 rounded hover:bg-zinc-800 transition ${glossary.session?.status === 'live' || glossaryPanelOpen ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400'}`}
                            title={t.glossary.presenter.title}
                        >
                            <QrCode className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setEditorOpen(o => !o)}
                            className={`p-1.5 rounded hover:bg-zinc-800 transition ${editorOpen ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400'}`}
                            title="Edit slide (E)"
                        >
                            <Pencil className="w-4 h-4" />
                        </button>
                        <button
                            onClick={toggleFullscreen}
                            className="p-1.5 rounded hover:bg-zinc-800 transition text-zinc-400"
                            title="Fullscreen (F)"
                        >
                            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => setShowHints(s => !s)}
                            className="p-1.5 rounded hover:bg-zinc-800 transition text-zinc-400"
                            title="Shortcuts (?)"
                        >
                            <Keyboard className="w-4 h-4" />
                        </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Card grid strip */}
            {stripMode === 'full' && (
                <div className="flex flex-col gap-4 px-8 py-6 border-b border-zinc-900 bg-zinc-950/30">
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                        {pinned.length > 0
                            ? pinned.map((item) => (
                                <MarketStatCard key={item.symbol} item={item} t={t} chartHeight="h-16" />
                            ))
                            : Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="h-36 rounded-xl bg-zinc-900/40 animate-pulse" />
                            ))}
                    </div>
                    {macroData.length > 0 && (
                        <>
                            <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mt-2">{t.macroData || 'Economic Data'}</div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {macroData.map((item) => (
                                    <MacroStatCard key={item.symbol} item={item} t={t} />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Slide area */}
            <div className="flex-1 flex min-h-0 overflow-hidden">
                {/* Main slide / index area */}
                <div className="flex-1 relative overflow-hidden">
                    <div className={mainView === 'slide' ? 'w-full h-full' : 'hidden'}>
                        <SlideErrorBoundary resetKey={`${slide.mode}:${slide.updatedAt ?? 0}:${typeof slide.content === 'string' ? slide.content.length : 0}`}>
                            <SlideRenderer
                                slide={slide}
                                marketData={marketData}
                                pdfZoom={pdfZoom}
                                pdfKeyboardEnabled={false}
                                pdfRef={pdfRef}
                                onPdfPageText={glossaryOnPageText}
                                onPdfPageChange={glossaryOnPdfPageChange}
                                lang={lang}
                            />
                        </SlideErrorBoundary>
                    </div>
                    {mainView === 'index' && (
                        <iframe
                            ref={attachIndexIframe}
                            src="/?embed=1"
                            className="w-full h-full border-0 bg-black"
                            title="Market Index"
                        />
                    )}
                    {mainView === 'heatmap' && (
                        <iframe
                            ref={attachHeatmapIframe}
                            src="/heatmap?embed=1"
                            className="w-full h-full border-0 bg-black"
                            title="Market Heatmap"
                        />
                    )}
                    <div key={mainView} className="pointer-events-none absolute inset-0 view-unfade" aria-hidden="true" />

                    {/* View hint — shown on PDF slide to surface the toggle */}
                    {mainView === 'slide' && slide.mode === 'pdf' && slide.content && (
                        <div className="absolute top-3 left-3 z-20 pointer-events-none">
                            <span className="text-[10px] font-mono text-zinc-600 bg-black/60 px-2 py-0.5 rounded">
                                {t.present.viewHintBefore} <kbd className="text-emerald-500">I</kbd> {t.present.viewHintAfter}
                            </span>
                        </div>
                    )}

                    {remoteJargon
                        ? <JargonSpotlight terms={remoteJargon.terms} lang={lang} />
                        : jargonEnabled && mainView === 'slide' && slide.mode === 'pdf' && <JargonSpotlight terms={jargon.terms} lang={lang} />}

                    {/* Quote spotlight — lower-third overlay */}
                    {qp.spotlight && (() => {
                        const cycleList = briefItems.some(b => b.id === qp.spotlight!.id) ? briefItems : qp.pinned;
                        const idx = cycleList.findIndex(p => p.id === qp.spotlight!.id);
                        const canCycle = idx >= 0 && cycleList.length > 1;
                        return (
                            <QuoteSpotlight
                                item={qp.spotlight}
                                lang={lang}
                                rangeLabel={t.rangeLabels?.[dataRange] || t.ytd}
                                onDismiss={qp.dismissSpotlight}
                                index={canCycle ? idx : undefined}
                                total={canCycle ? cycleList.length : undefined}
                                onPrev={canCycle ? () => qp.openSpotlight(cycleList[(idx - 1 + cycleList.length) % cycleList.length]) : undefined}
                                onNext={canCycle ? () => qp.openSpotlight(cycleList[(idx + 1) % cycleList.length]) : undefined}
                            />
                        );
                    })()}

                    {/* Zoom controls — shown for pdf and html modes */}
                    {mainView === 'slide' && (slide.mode === 'pdf' || slide.mode === 'html') && (
                        <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-zinc-900/90 backdrop-blur border border-zinc-800 rounded-full px-3 py-1.5 z-30">
                            <button
                                onClick={() => setPdfZoom(z => Math.max(25, z - 25))}
                                className="w-6 h-6 flex items-center justify-center text-zinc-300 hover:text-white text-lg font-bold"
                            >−</button>
                            <span className="text-xs font-mono text-zinc-300 w-10 text-center">{pdfZoom}%</span>
                            <button
                                onClick={() => setPdfZoom(z => Math.min(200, z + 25))}
                                className="w-6 h-6 flex items-center justify-center text-zinc-300 hover:text-white text-lg font-bold"
                            >+</button>
                            <div className="w-px h-3 bg-zinc-700 mx-1" />
                            <button
                                onClick={() => setPdfZoom(100)}
                                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300"
                            >reset</button>
                        </div>
                    )}
                </div>

                {/* Pinned quote panel — vertical right column */}
                {!qp.isPickerOpen && (
                    <QuotePanel
                        items={qp.pinned}
                        lang={lang}
                        onRemove={qp.remove}
                        onClearAll={qp.clearAll}
                        onItemClick={(item) => {
                            setRemoteCompare(null);
                            qp.openChart(item);
                        }}
                    />
                )}
            </div>

            {/* Slide-in session-glossary panel */}
            <GlossarySessionPanel
                open={glossaryPanelOpen}
                onClose={() => setGlossaryPanelOpen(false)}
                glossary={glossary}
                lang={lang}
            />

            {/* Slide-in editor panel */}
            <SlideEditorPanel
                open={editorOpen}
                onClose={() => setEditorOpen(false)}
                slide={slide}
                saveSlide={saveSlide}
                doRemoteSave={doRemoteSave}
                cloudStatus={cloudStatus}
                lastSavedAt={lastSavedAt}
                sizeWarning={sizeWarning}
                onPdfInserted={glossary.renew}
            />

            {/* Index chart modal */}
            {qp.chartItem && (
                <IndexChartModal
                    key={remoteCompare?.id ?? 'local'}
                    item={qp.chartItem}
                    allData={marketData}
                    onClose={qp.closeChart}
                    lang={lang}
                    initialCompareSymbols={remoteCompare?.symbols ?? []}
                    pageRange={dataRange}
                    pageLoading={marketLoading}
                />
            )}

            {/* Morning Brief config */}
            {briefPanelOpen && (
                <MorningBriefPanel
                    items={qp.allItems}
                    brief={morningBrief}
                    onChange={saveBrief}
                    onClose={() => setBriefPanelOpen(false)}
                />
            )}

            {/* Ad-hoc quote search */}
            {qp.isSearchOpen && (
                <QuoteSpotlightSearch
                    items={qp.allItems}
                    lang={lang}
                    pinnedIds={qp.pinnedIds}
                    onCommit={qp.toggle}
                    onClose={qp.closeSearch}
                />
            )}

            {/* Quote picker overlay */}
            {qp.isPickerOpen && (
                <QuotePickerModal
                    items={qp.allItems}
                    lang={lang}
                    pinnedIds={qp.pinnedIds}
                    onToggle={qp.toggle}
                    onClearAll={qp.clearAll}
                    onClose={qp.closePicker}
                />
            )}


            {/* Shortcut hints overlay */}
            {showHints && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900/95 backdrop-blur border border-zinc-800 rounded-xl px-5 py-3 z-50 shadow-2xl hints-in">
                    <div className="flex items-center gap-5 text-xs">
                        <span className="text-zinc-500">{t.present.shortcuts}</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">E</kbd>
                        <span className="text-zinc-400">{t.present.scEdit}</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">F</kbd>
                        <span className="text-zinc-400">{t.present.scFullscreen}</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">S</kbd>
                        <span className="text-zinc-400">{t.present.scStrip}</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">Q</kbd>
                        <span className="text-zinc-400">{t.present.scQuote}</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">J</kbd>
                        <span className="text-zinc-400">{t.present.scJargon}</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">I</kbd>
                        <span className="text-zinc-400">{t.present.scCycleView}</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">P</kbd>
                        <span className="text-zinc-400">{t.present.scPlaylist}</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">?</kbd>
                        <span className="text-zinc-400">{t.present.scToggleHints}</span>
                        <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded font-mono text-emerald-300">Esc</kbd>
                        <span className="text-zinc-400">{t.present.scClose}</span>
                    </div>
                </div>
            )}

            <div className="relative shrink-0 h-9 w-full bg-zinc-950/95 border-t border-zinc-800 flex items-center">
                {cycleRunning && !cyclePaused && (
                    <div
                        key={`${dwellResetNonce}-${mainView}-${dwellSec}`}
                        className="absolute -top-px left-0 h-0.5 bg-emerald-500/70 dwell-progress"
                        style={{ animationDuration: `${dwellSec}s` }}
                    />
                )}
                <div className="shrink-0 max-w-[520px] overflow-hidden flex items-center gap-3 px-4">
                    <span className="font-mono text-xs text-zinc-300">{clock}</span>
                    <div className="flex items-center gap-2 min-w-0">
                        {marketStatuses.map(status => (
                            <MarketStatusChip key={status.key} status={status} now={statusNow} />
                        ))}
                    </div>
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                    {stripMode === 'compact' && (
                        <div className="overflow-hidden relative h-9 flex items-center">
                            {pinned.length > 0 ? (
                                <div className="inline-flex animate-ticker whitespace-nowrap">
                                    {pinned.map((item) => <TickerItem key={item.symbol} item={item} t={t} />)}
                                    <span aria-hidden="true" className="inline-flex">
                                        {pinned.map((item) => <TickerItem key={`${item.symbol}-dup`} item={item} t={t} />)}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-xs text-zinc-600 px-8">Loading…</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
