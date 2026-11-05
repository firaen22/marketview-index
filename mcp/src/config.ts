export interface PresentMcpConfig {
    origin: string;
    apiKey: string;
}

const DEFAULT_ORIGIN = 'https://marketindex.pmd-hk.com';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PresentMcpConfig {
    const origin = (env.MARKETVIEW_ORIGIN ?? DEFAULT_ORIGIN).replace(/\/+$/, '');
    const apiKey = env.PRESENT_API_KEY ?? '';
    if (!apiKey) {
        throw new Error('PRESENT_API_KEY is required for presenter writes (set in MCP server env).');
    }
    return { origin, apiKey };
}

export function loadConfigForStatus(env: NodeJS.ProcessEnv = process.env): Pick<PresentMcpConfig, 'origin'> {
    const origin = (env.MARKETVIEW_ORIGIN ?? DEFAULT_ORIGIN).replace(/\/+$/, '');
    return { origin };
}
