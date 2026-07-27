// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Toast, useToast } from './Toast';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('useToast / Toast', () => {
    let container: HTMLDivElement;
    let root: Root;
    let latest: ReturnType<typeof useToast>;

    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.useRealTimers();
    });

    function Probe() {
        latest = useToast();
        return createElement(Toast, { message: latest.message });
    }

    it('renders nothing until a toast is shown', () => {
        act(() => { root.render(createElement(Probe)); });
        expect(container.textContent).toBe('');
    });

    it('shows a message and auto-dismisses after ~4s', () => {
        act(() => { root.render(createElement(Probe)); });
        act(() => { latest.showToast('Clipboard denied'); });
        expect(container.textContent).toContain('Clipboard denied');

        act(() => { vi.advanceTimersByTime(3999); });
        expect(container.textContent).toContain('Clipboard denied');

        act(() => { vi.advanceTimersByTime(1); });
        expect(container.textContent).toBe('');
    });

    it('single-instance: a new toast replaces the visible one and resets the timer', () => {
        act(() => { root.render(createElement(Probe)); });
        act(() => { latest.showToast('First'); });
        act(() => { vi.advanceTimersByTime(3000); });
        act(() => { latest.showToast('Second'); });
        // If the old timer had NOT been cancelled, it would fire at 4000ms total
        // and clear "Second" one second early.
        act(() => { vi.advanceTimersByTime(1000); });
        expect(container.textContent).toContain('Second');
        act(() => { vi.advanceTimersByTime(3000); });
        expect(container.textContent).toBe('');
    });

    it('exposes role=status and aria-live=polite, and never a native alert/confirm', () => {
        act(() => { root.render(createElement(Probe)); });
        act(() => { latest.showToast('hello'); });
        const el = container.querySelector('[role="status"]');
        expect(el).not.toBeNull();
        expect(el?.getAttribute('aria-live')).toBe('polite');
    });
});
