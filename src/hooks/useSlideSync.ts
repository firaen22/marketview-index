import { useEffect, useRef, useState } from 'react';
import {
    getSettings,
    setSetting,
    type PresentSlide,
} from '../settings';
import {
    loadRemoteSlide,
    saveRemoteSlide,
    StaleSaveError,
    MAX_CONTENT_BYTES,
} from '../slideApi';

const SAVE_DEBOUNCE_MS = 800;

export type CloudStatus = 'idle' | 'saving' | 'ok' | 'error';

export interface UseSlideSyncResult {
    slide: PresentSlide;
    saveSlide: (next: Partial<PresentSlide>) => void;
    doRemoteSave: (s?: PresentSlide) => void;
    cloudStatus: CloudStatus;
    lastSavedAt: number | null;
    sizeWarning: string | null;
}

export function useSlideSync(): UseSlideSyncResult {
    const [slide, setSlide] = useState<PresentSlide>(() => getSettings().presentSlide);
    const [cloudStatus, setCloudStatus] = useState<CloudStatus>('idle');
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    const [sizeWarning, setSizeWarning] = useState<string | null>(null);
    const [, setTick] = useState(0);
    const saveTimerRef = useRef<number | null>(null);
    const slideRef = useRef(slide);
    slideRef.current = slide;

    // Periodic tick to keep "saved Ns ago" label fresh
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 15000);
        return () => clearInterval(id);
    }, []);

    // Load remote slide on mount (overrides local if newer)
    useEffect(() => {
        loadRemoteSlide().then(remote => {
            if (remote && remote.updatedAt > slideRef.current.updatedAt) {
                setSlide(remote);
                setSetting('presentSlide', remote);
            }
        });
    }, []);

    // Cross-tab localStorage sync
    useEffect(() => {
        const handler = (e: StorageEvent) => {
            if (e.key === 'marketflow_settings' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    if (parsed?.presentSlide) setSlide(parsed.presentSlide);
                } catch {}
            }
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);

    // Cleanup save debounce timer on unmount
    useEffect(() => () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    }, []);

    const doRemoteSave = (s?: PresentSlide) => {
        const target = s ?? slideRef.current;
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        setCloudStatus('saving');
        saveRemoteSlide(target).then(() => {
            setCloudStatus('ok');
            setLastSavedAt(Date.now());
            window.setTimeout(() => setCloudStatus('idle'), 2000);
        }).catch((e) => {
            // Superseded by newer save — not a real failure, let the newer one drive UI state
            if (e instanceof StaleSaveError) return;
            setCloudStatus('error');
            window.setTimeout(() => setCloudStatus('idle'), 3000);
        });
    };

    const saveSlide = (next: Partial<PresentSlide>) => {
        const merged: PresentSlide = { ...slideRef.current, ...next, updatedAt: Date.now() };
        setSlide(merged);
        setSetting('presentSlide', merged);

        const byteSize = new Blob([merged.content]).size;
        if (byteSize > MAX_CONTENT_BYTES) {
            setSizeWarning(`Content is ${(byteSize / 1024).toFixed(0)} KB — max ${MAX_CONTENT_BYTES / 1024} KB. Not synced to cloud.`);
            setCloudStatus('error');
            return;
        }
        setSizeWarning(null);

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        setCloudStatus('saving');
        saveTimerRef.current = window.setTimeout(() => {
            doRemoteSave(merged);
        }, SAVE_DEBOUNCE_MS);
    };

    return {
        slide,
        saveSlide,
        doRemoteSave,
        cloudStatus,
        lastSavedAt,
        sizeWarning,
    };
}
