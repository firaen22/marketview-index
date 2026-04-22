import { useCallback, useMemo, useState } from 'react';
import type { IndexData, MacroData } from '../types';
import { indexToQuoteItem, macroToQuoteItem } from '../types/QuoteItem';
import type { QuoteItem } from '../types/QuoteItem';

export type { QuoteItem };

interface UseQuotePanelOptions {
    marketData: IndexData[];
    macroData: MacroData[];
}

export function useQuotePanel({ marketData, macroData }: UseQuotePanelOptions) {
    const [pinned, setPinned] = useState<QuoteItem[]>([]);
    const [isPickerOpen, setPickerOpen] = useState(false);
    const [chartItem, setChartItem] = useState<IndexData | null>(null);
    const [spotlight, setSpotlight] = useState<QuoteItem | null>(null);
    const [isSearchOpen, setSearchOpen] = useState(false);

    // All available items as QuoteItems (for the picker)
    const allItems = useMemo<QuoteItem[]>(() => [
        ...marketData.map(indexToQuoteItem),
        ...macroData.map(macroToQuoteItem),
    ], [marketData, macroData]);

    const pinnedIds = useMemo(() => new Set(pinned.map(p => p.id)), [pinned]);

    const toggle = useCallback((item: QuoteItem) => {
        setPinned(prev =>
            prev.some(p => p.id === item.id)
                ? prev.filter(p => p.id !== item.id)
                : [...prev, item]
        );
    }, []);

    const remove = useCallback((id: string) => {
        setPinned(prev => prev.filter(p => p.id !== id));
    }, []);

    const clearAll = useCallback(() => setPinned([]), []);

    const openPicker = useCallback(() => setPickerOpen(true), []);
    const closePicker = useCallback(() => setPickerOpen(false), []);
    const togglePicker = useCallback(() => setPickerOpen(o => !o), []);

    const openChart = useCallback((item: QuoteItem) => {
        const source = marketData.find(d => d.symbol === item.id);
        if (source) setChartItem(source);
    }, [marketData]);
    const closeChart = useCallback(() => setChartItem(null), []);

    const hasPinned = pinned.length > 0;

    const openSpotlight = useCallback((item: QuoteItem) => setSpotlight(item), []);
    const dismissSpotlight = useCallback(() => setSpotlight(null), []);

    const openSearch = useCallback(() => setSearchOpen(true), []);
    const closeSearch = useCallback(() => setSearchOpen(false), []);

    const resetAll = useCallback(() => {
        setPickerOpen(false);
        setChartItem(null);
        setSpotlight(null);
        setSearchOpen(false);
        setPinned([]);
    }, []);

    return {
        // data
        pinned,
        pinnedIds,
        allItems,
        isPickerOpen,
        chartItem,
        spotlight,
        isSearchOpen,
        hasPinned,
        // actions
        toggle,
        remove,
        clearAll,
        openPicker,
        closePicker,
        togglePicker,
        openChart,
        closeChart,
        openSpotlight,
        dismissSpotlight,
        openSearch,
        closeSearch,
        resetAll,
    };
}
