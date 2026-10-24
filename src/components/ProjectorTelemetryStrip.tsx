import type { ControlSurfaceState } from '../../lib/presentDisplay';
import type { ProjectorLastState, ProjectorState } from '../presentCommandApi';

const LIVE_MS = 15_000;

function formatDisplay(projector: ProjectorState): string {
    const d = projector.display;
    if (!d) return 'viewport unknown';
    const outer = `${d.iw}×${d.ih}`;
    const embed = d.fw && d.fh ? ` · embed ${d.fw}×${d.fh}` : '';
    return `${outer}${embed} · dpr ${d.dpr}`;
}

function formatControlDisplay(control: ControlSurfaceState): string {
    const d = control.display;
    return `${d.iw}×${d.ih} · dpr ${d.dpr}`;
}

interface Props {
    projector: ProjectorState | null;
    projectorLast?: ProjectorLastState | null;
    control: ControlSurfaceState | null;
    serverTime: number;
}

export function ProjectorTelemetryStrip({ projector, projectorLast, control, serverTime }: Props) {
    const snapshot = projector ?? (projectorLast
        ? { mode: projectorLast.mode, page: projectorLast.page, v: projectorLast.v, at: projectorLast.at, display: projectorLast.display, lid: projectorLast.lid }
        : null);
    if (!snapshot) {
        return (
            <div className="flex items-center px-2 py-1 rounded-md bg-zinc-900/80 border border-zinc-800 text-[0.625rem] font-mono text-zinc-500 max-w-[min(100%,20rem)] sm:max-w-[min(100%,28rem)] truncate shrink min-w-0" title="Projector telemetry">
                Projector offline
            </div>
        );
    }

    const live = !!projector && serverTime - projector.at <= LIVE_MS;
    const ageMs = Math.max(0, serverTime - snapshot.at);
    const ageSec = Math.floor(ageMs / 1000);
    const ageLabel = live ? `${ageSec}s ago` : `stale ${ageSec}s`;

    return (
        <div
            className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 rounded-md border text-[0.625rem] font-mono max-w-[min(100%,20rem)] sm:max-w-[min(100%,32rem)] truncate shrink min-w-0 ${
                live ? 'bg-zinc-900/80 border-zinc-800 text-zinc-400' : 'bg-zinc-900/80 border-amber-900/50 text-amber-500/90'
            }`}
            title="Live projector viewport (world-readable via GET /api/present-command)"
        >
            <span className={`uppercase ${live ? 'text-emerald-500/90' : 'text-amber-500/90'}`}>{snapshot.mode}</span>
            <span>p{snapshot.page}</span>
            <span className="text-zinc-500">·</span>
            <span>{formatDisplay(snapshot)}</span>
            <span className="text-zinc-600">· {ageLabel}</span>
            {control && (
                <>
                    <span className="text-zinc-600 hidden md:inline">·</span>
                    <span className="hidden md:inline text-zinc-500">ctrl {formatControlDisplay(control)}</span>
                </>
            )}
        </div>
    );
}
