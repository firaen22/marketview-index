// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { GlossaryTermSnapshot } from '../../../lib/glossarySession';
import { TermCard } from './TermCard';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const term: GlossaryTermSnapshot = {
    id: 'bps',
    term: 'bps',
    explanation: { en: 'Basis points' },
    firstPage: 1,
    unlockedAt: 100,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderCard(props: { saved: boolean; savingEnabled: boolean; onToggleSaved?: (t: GlossaryTermSnapshot) => void }) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root!.render(createElement(TermCard, {
            term,
            lang: 'en',
            saved: props.saved,
            savingEnabled: props.savingEnabled,
            onToggleSaved: props.onToggleSaved ?? (() => undefined),
            pageLabel: (page: number) => `Page ${page}`,
        }));
    });
    return container.querySelector('button')!;
}

afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
});

describe('TermCard bookmark while saving is disabled (sweep 19)', () => {
    it('keeps the unsave button clickable so the reader can free quota', () => {
        const onToggle = vi.fn();
        const button = renderCard({ saved: true, savingEnabled: false, onToggleSaved: onToggle });
        expect(button.disabled).toBe(false);
        act(() => button.click());
        expect(onToggle).toHaveBeenCalledWith(term);
    });

    it('still disables saving a new term when storage is unavailable', () => {
        const button = renderCard({ saved: false, savingEnabled: false });
        expect(button.disabled).toBe(true);
    });
});
