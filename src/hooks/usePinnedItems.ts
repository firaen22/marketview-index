import { useCallback, useState } from 'react';

export function usePinnedItems<T extends { symbol: string }>() {
    const [items, setItems] = useState<T[]>([]);

    const toggle = useCallback((item: T) => {
        setItems(prev =>
            prev.some(p => p.symbol === item.symbol)
                ? prev.filter(p => p.symbol !== item.symbol)
                : [...prev, item]
        );
    }, []);

    const remove = useCallback((symbol: string) => {
        setItems(prev => prev.filter(p => p.symbol !== symbol));
    }, []);

    const clear = useCallback(() => setItems([]), []);

    return { items, toggle, remove, clear };
}
