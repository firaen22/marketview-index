export const NIM_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

// Order = preference. Each chain's fallback is a different vendor so a single
// vendor outage doesn't take out both legs (probed live 2026-07-11).
// Vision: llama first — measured 13-17s vs mistral's 24s-timeout(>40s), so
// mistral-primary usually burned the whole 25s abort before falling back.
export const NIM_TEXT_MODELS = ['openai/gpt-oss-120b', 'mistralai/mistral-medium-3.5-128b'];
export const NIM_VISION_MODELS = ['meta/llama-3.2-90b-vision-instruct', 'mistralai/mistral-medium-3.5-128b'];

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
