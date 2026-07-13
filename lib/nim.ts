export const NIM_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

// NIM_TEXT_MODELS is a fallback CHAIN (callNim tries each in order); order =
// preference, and the fallback is a different vendor so one vendor outage
// doesn't take out both legs (probed live 2026-07-11).
// NIM_VISION_MODELS feeds explain-jargon's HEDGED race (callNimHedged): the
// FIRST entry is the primary that fires immediately; the rest are backups that
// only fire if the primary is slow/fails. Order therefore MATTERS — primary
// first. gemma leads by choice (2026-07-11); note it showed the most timeouts
// in live prod logs and mistral had the lowest measured healthy latency (h2h
// P50 ~5.4s vs gemma ~7-9s vs llama ~22-34s), so a gemma primary will escalate
// to the backups more often than a mistral primary would — the hedge still
// returns a card whenever ANY model succeeds. All three verified vision-capable
// on the real slide 2026-07-11 (4 correct terms). gemma-3-12b excluded (404 on
// this account); deepseek-v4-flash excluded (text-only, multimodal disabled).
export const NIM_TEXT_MODELS = ['openai/gpt-oss-120b', 'mistralai/mistral-medium-3.5-128b'];
export const NIM_VISION_MODELS = ['google/gemma-4-31b-it', 'mistralai/mistral-medium-3.5-128b', 'meta/llama-3.2-90b-vision-instruct'];

// Each env var may hold a single key or several comma-separated keys.
export function getNimApiKeys(): string[] {
    return [process.env.NVIDIA_NIM_API_KEY, process.env.NVIDIA_NIM_API_KEY_FALLBACK]
        .flatMap(value => (typeof value === 'string' ? value.split(',') : []))
        .map(key => key.trim())
        .filter(key => key.length > 0);
}

// gpt-oss-* are reasoning models that may put the answer in reasoning_content
// with an empty content; mistral wraps JSON in markdown fences without
// response_format. Handle both so callers always get a bare JSON string.
export function extractNimText(message: unknown): string {
    if (!message || typeof message !== 'object') return '';
    const msg = message as { content?: unknown; reasoning_content?: unknown };
    const raw = typeof msg.content === 'string' && msg.content.trim().length > 0
        ? msg.content
        : typeof msg.reasoning_content === 'string' ? msg.reasoning_content : '';
    let text = raw.trim();
    if (text.startsWith('```')) {
        text = text.replace(/^```[a-zA-Z]*\s*\n?/, '');
        text = text.replace(/\n?```\s*$/, '');
        text = text.trim();
    }
    return text;
}

// Tries each key against each model until one attempt succeeds. Any per-attempt
// failure (non-2xx, network/abort error, unparseable body, missing choices) logs
// a warning and moves on; only total exhaustion throws.
// opts.reasoningEffort ('low') is applied ONLY to openai/gpt-oss* models —
// cuts jargon latency ~2x (measured 1.7s vs 2-3.8s); Mistral 400s on 'low'.
// opts.timeoutMs overrides the 25s per-attempt abort — NIM vision latency
// swings 16-43s on the same payload (measured 2026-07-11), so vision callers
// need more headroom or slow-but-successful runs get killed mid-flight.
export async function callNim(
    apiKeys: string[],
    models: string[],
    messages: unknown[],
    maxTokens: number,
    opts?: { reasoningEffort?: 'low'; timeoutMs?: number }
): Promise<string> {
    if (models.length === 0) {
        throw new Error('No NIM models configured');
    }
    for (const apiKey of apiKeys) {
        for (const model of models) {
            try {
                const body: Record<string, unknown> = {
                    model,
                    messages,
                    max_tokens: maxTokens,
                    response_format: { type: 'json_object' },
                };
                if (opts?.reasoningEffort && model.startsWith('openai/gpt-oss')) {
                    body.reasoning_effort = opts.reasoningEffort;
                }
                const response = await fetch(NIM_CHAT_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(opts?.timeoutMs ?? 25_000),
                });
                if (!response.ok) {
                    console.warn(`NIM call failed (model ${model}): HTTP ${response.status}`);
                    continue;
                }
                const data: any = await response.json();
                const message = data?.choices?.[0]?.message;
                if (!message) {
                    console.warn(`NIM call returned no choices (model ${model})`);
                    continue;
                }
                return extractNimText(message);
            } catch (error) {
                console.warn(`NIM call failed (model ${model}):`, error);
            }
        }
    }
    throw new Error('All NIM keys/models failed');
}

// Hedged race over models[0..n]: fire the FIRST model immediately and add the
// rest only once the primary has either FAILED or stayed pending past
// hedgeDelayMs — then race whatever is in flight via Promise.any. On the
// healthy path the primary answers in ~5-6s and the backups never fire (≈3x
// fewer NIM calls + far less "NIM call failed" log noise); on a slow or failing
// primary this degrades to the full parallel race, so a result is still
// produced as long as ANY model succeeds. Rejects only on total exhaustion
// (every model failed), matching the old Promise.any behaviour.
export async function callNimHedged(
    apiKeys: string[],
    models: string[],
    messages: unknown[],
    maxTokens: number,
    opts: { timeoutMs?: number; hedgeDelayMs: number }
): Promise<string> {
    if (models.length === 0) {
        throw new Error('No NIM models configured');
    }
    const { hedgeDelayMs, ...callOpts } = opts;
    const [primaryModel, ...backupModels] = models;
    const fire = (model: string) => callNim(apiKeys, [model], messages, maxTokens, callOpts);

    const primary = fire(primaryModel);
    if (backupModels.length === 0) return primary;

    // Escalate the moment the primary FAILS, or after hedgeDelayMs if it is
    // still pending — whichever comes first. A primary success short-circuits
    // before any backup is fired. The primary always carries a rejection
    // handler (via primaryOutcome, then via Promise.any), so it never leaks an
    // unhandled rejection.
    let timer: ReturnType<typeof setTimeout>;
    const hedge = new Promise<'escalate'>(resolve => {
        timer = setTimeout(() => resolve('escalate'), hedgeDelayMs);
    });
    const primaryOutcome = primary.then(() => 'ok' as const, () => 'escalate' as const);

    const trigger = await Promise.race([primaryOutcome, hedge]);
    clearTimeout(timer!);
    if (trigger === 'ok') return primary;
    return Promise.any([primary, ...backupModels.map(fire)]);
}
