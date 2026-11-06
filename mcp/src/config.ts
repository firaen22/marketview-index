export interface PresentMcpConfig {
    origin: string;
    apiKey: string;
}

const DEFAULT_ORIGIN = 'https://marketindex.pmd-hk.com';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PresentMcpConfig {
    const rawOrigin = env.MARKETVIEW_ORIGIN?.trim();
    const origin = (!rawOrigin || /^\/+$/u.test(rawOrigin) ? DEFAULT_ORIGIN : rawOrigin).replace(/\/+$/, '');
    const apiKey = env.PRESENT_API_KEY?.trim() ?? '';
    if (!apiKey) {
        throw new Error('PRESENT_API_KEY is required for presenter writes (set in MCP server env).');
    }
    return { origin, apiKey };
}

export function loadConfigForStatus(env: NodeJS.ProcessEnv = process.env): Pick<PresentMcpConfig, 'origin'> {
    const rawOrigin = env.MARKETVIEW_ORIGIN?.trim();
    const origin = (!rawOrigin || /^\/+$/u.test(rawOrigin) ? DEFAULT_ORIGIN : rawOrigin).replace(/\/+$/, '');
    return { origin };
}
