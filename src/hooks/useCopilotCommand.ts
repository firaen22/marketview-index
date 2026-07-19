import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

export type Status =
    | { type: 'idle' }
    | { type: 'sending' }
    | { type: 'macro'; name: string; step: number; total: number }
    | { type: 'success'; message: string; confirmed?: boolean; failed?: boolean }
    | { type: 'error'; message: string };

export interface CopilotCommandLifecycle {
    status: Status;
    setStatus: React.Dispatch<React.SetStateAction<Status>>;
    requestControllerRef: React.MutableRefObject<AbortController | null>;
    ackControllerRef: React.MutableRefObject<AbortController | null>;
    macroControllerRef: React.MutableRefObject<AbortController | null>;
    dismissTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    clearDismissTimer: () => void;
    abortAck: () => void;
    abortMacro: () => void;
}

export function useCopilotCommand(): CopilotCommandLifecycle {
    const [status, setStatus] = useState<Status>({ type: 'idle' });
    const requestControllerRef = useRef<AbortController | null>(null);
    const ackControllerRef = useRef<AbortController | null>(null);
    const macroControllerRef = useRef<AbortController | null>(null);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearDismissTimer = useCallback(() => {
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }
    }, []);

    const abortAck = useCallback(() => {
        ackControllerRef.current?.abort();
        ackControllerRef.current = null;
    }, []);

    const abortMacro = useCallback(() => {
        macroControllerRef.current?.abort();
        macroControllerRef.current = null;
    }, []);

    useEffect(() => () => {
        clearDismissTimer();
        abortAck();
        abortMacro();
        requestControllerRef.current?.abort();
        requestControllerRef.current = null;
    }, [abortAck, abortMacro, clearDismissTimer]);

    return {
        status,
        setStatus,
        requestControllerRef,
        ackControllerRef,
        macroControllerRef,
        dismissTimerRef,
        clearDismissTimer,
        abortAck,
        abortMacro,
    };
}
