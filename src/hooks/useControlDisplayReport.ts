import { useEffect } from 'react';
import { controlDisplayReportUrl, sampleProjectorDisplay } from '../../lib/presentDisplay';
import { authHeaders } from '../presentCommandApi';

const REPORT_MS = 12_000;
const REPORT_TIMEOUT_MS = 10_000;

export function useControlDisplayReport(enabled: boolean, lang?: string) {
    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;
        let timer: number | null = null;

        const schedule = () => {
            if (cancelled) return;
            timer = window.setTimeout(() => void tick(), REPORT_MS);
        };

        const tick = async () => {
            const display = sampleProjectorDisplay({ lang });
            if (!display) {
                schedule();
                return;
            }
            const controller = new AbortController();
            const timeoutId = window.setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);
            try {
                await fetch(controlDisplayReportUrl(display), { headers: authHeaders(), signal: controller.signal });
            } catch {
                // Best-effort telemetry — never block the control UI.
            } finally {
                window.clearTimeout(timeoutId);
                schedule();
            }
        };

        void tick();

        return () => {
            cancelled = true;
            if (timer !== null) window.clearTimeout(timer);
        };
    }, [enabled, lang]);
}
