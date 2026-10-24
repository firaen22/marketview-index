import type { PresentCommand, PresentRange, PresentView } from './presentCommand.js';
import type { PresentFullscreenMode, PresentIndexDensity } from './presentIndexView.js';

export const PROJECTOR_STATE_KEY = 'present:pstate:v1';
export const PROJECTOR_LAST_KEY = 'present:pstate:last:v1';
export const APPLIED_STATE_KEY = 'present:applied:v1';
export const CMD_META_PREFIX = 'present:cmdmeta:v1:';
export const PROJECTOR_STATE_TTL_SECONDS = 15;
export const PROJECTOR_LAST_TTL_SECONDS = 86_400;
export const APPLIED_TTL_SECONDS = 86_400;
export const CMD_META_TTL_SECONDS = 300;

export interface CmdMeta {
    kind: PresentCommand['kind'];
    at: number;
    view?: PresentView;
    density?: PresentIndexDensity;
    fsMode?: PresentFullscreenMode;
    symbol?: string;
    range?: PresentRange;
}

export interface AppliedState {
    id: string;
    kind: PresentCommand['kind'];
    at: number;
    view?: PresentView;
    density?: PresentIndexDensity;
    fsMode?: PresentFullscreenMode;
    symbol?: string;
    range?: PresentRange;
}

export interface ProjectorSnapshot {
    mode: string;
    page: number;
    v: number;
    at: number;
    lid?: string;
    display?: unknown;
}

export interface ProjectorLastResponse extends ProjectorSnapshot {
    stale: boolean;
    ageMs: number;
}

export function cmdMetaKey(commandId: string): string {
    return `${CMD_META_PREFIX}${commandId}`;
}

export function buildCmdMeta(command: PresentCommand): CmdMeta {
    const base: CmdMeta = { kind: command.kind, at: command.issuedAt };
    switch (command.kind) {
        case 'view':
            return { ...base, view: command.view! };
        case 'layout':
            return { ...base, density: command.density! };
        case 'fullscreen':
            return { ...base, fsMode: command.fsMode! };
        case 'highlight':
            return { ...base, symbol: command.symbols[0] };
        case 'range':
            return { ...base, range: command.range! };
        default:
            return base;
    }
}

export function buildAppliedFromMeta(id: string, meta: CmdMeta, ackAt: number): AppliedState {
    return {
        id,
        kind: meta.kind,
        at: ackAt,
        ...(meta.view !== undefined ? { view: meta.view } : {}),
        ...(meta.density !== undefined ? { density: meta.density } : {}),
        ...(meta.fsMode !== undefined ? { fsMode: meta.fsMode } : {}),
        ...(meta.symbol !== undefined ? { symbol: meta.symbol } : {}),
        ...(meta.range !== undefined ? { range: meta.range } : {}),
    };
}

function atFromStored(json: string | null): number {
    if (!json) return 0;
    try {
        const parsed = JSON.parse(json) as { at?: unknown };
        return typeof parsed.at === 'number' && Number.isFinite(parsed.at) ? parsed.at : 0;
    } catch {
        return 0;
    }
}

/** Atomic live + last projector write; returns 1 if accepted, 0 if rejected (older at). */
export const PROJECTOR_COMMIT_SCRIPT = `
local live_raw = redis.call('GET', KEYS[1])
local last_raw = redis.call('GET', KEYS[2])
local function at_from(raw)
  if not raw then return 0 end
  local ok, o = pcall(cjson.decode, raw)
  if not ok or type(o) ~= 'table' then return 0 end
  if o.at then return tonumber(o.at) or 0 end
  return 0
end
local ok_in, incoming = pcall(cjson.decode, ARGV[1])
if not ok_in or type(incoming) ~= 'table' or not incoming.at then
  return 0
end
local stored_at = math.max(at_from(live_raw), at_from(last_raw))
local incoming_at = tonumber(incoming.at) or 0
if incoming_at < stored_at then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
redis.call('SET', KEYS[2], ARGV[1], 'EX', tonumber(ARGV[3]))
if ARGV[4] ~= '' and KEYS[3] ~= '' then
  local meta = redis.call('GET', ARGV[4])
  if meta then
    local ok_new, new_applied = pcall(cjson.decode, ARGV[5])
    if ok_new and type(new_applied) == 'table' and new_applied.id then
      local applied_raw = redis.call('GET', KEYS[3])
      if applied_raw then
        local ok_old, old = pcall(cjson.decode, applied_raw)
        if ok_old and type(old) == 'table' and old.id == new_applied.id then
          return 1
        end
        if ok_old and type(old) == 'table' and tonumber(old.at) and tonumber(new_applied.at)
          and tonumber(old.at) > tonumber(new_applied.at) then
          return 1
        end
      end
      redis.call('SET', KEYS[3], ARGV[5], 'EX', tonumber(ARGV[6]))
    end
  end
end
return 1`;

export const COMMAND_STORE_WITH_META = `
local existing = redis.call('GET', KEYS[1])
if existing then
  local parsed = cjson.decode(existing)
  if parsed.issuedAt and tonumber(parsed.issuedAt) > tonumber(ARGV[2]) then
    return 0
  end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
if KEYS[2] and KEYS[2] ~= '' then
  redis.call('SET', KEYS[2], ARGV[4], 'EX', tonumber(ARGV[5]))
end
return 1`;

export function enrichProjectorLast(
    snapshot: ProjectorSnapshot | null,
    serverTime: number,
    liveFresh: boolean,
): ProjectorLastResponse | null {
    if (!snapshot) return null;
    return {
        ...snapshot,
        stale: !liveFresh,
        ageMs: Math.max(0, serverTime - snapshot.at),
    };
}

export function isLiveProjector(snapshot: ProjectorSnapshot | null, serverTime: number): boolean {
    if (!snapshot) return false;
    const ageMs = serverTime - snapshot.at;
    const ttlMs = PROJECTOR_STATE_TTL_SECONDS * 1000;
    if (ageMs < 0) {
        // Projector `at` can be slightly ahead of server clock; still treat as live within TTL.
        return -ageMs <= ttlMs;
    }
    return ageMs <= ttlMs;
}

export async function commitProjectorReport(
    redis: { eval: (...args: unknown[]) => Promise<unknown> },
    projectorJson: string,
    appliedPayload: { metaKey: string; appliedJson: string } | null,
): Promise<boolean> {
    const keys = appliedPayload
        ? [PROJECTOR_STATE_KEY, PROJECTOR_LAST_KEY, APPLIED_STATE_KEY]
        : [PROJECTOR_STATE_KEY, PROJECTOR_LAST_KEY, ''];
    const args = appliedPayload
        ? [
            projectorJson,
            String(PROJECTOR_STATE_TTL_SECONDS),
            String(PROJECTOR_LAST_TTL_SECONDS),
            appliedPayload.metaKey,
            appliedPayload.appliedJson,
            String(APPLIED_TTL_SECONDS),
        ]
        : [
            projectorJson,
            String(PROJECTOR_STATE_TTL_SECONDS),
            String(PROJECTOR_LAST_TTL_SECONDS),
            '',
            '',
            '',
        ];
    const result = await redis.eval(PROJECTOR_COMMIT_SCRIPT, keys, args);
    return Number(result) === 1;
}

export function storedAtFromMemory(live: string | null, last: string | null): number {
    return Math.max(atFromStored(live), atFromStored(last));
}
