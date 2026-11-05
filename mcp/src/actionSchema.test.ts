import { describe, expect, it } from 'vitest';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DEFINITIONS } from './tools.js';

describe('MCP tool schemas', () => {
    it('listTools payload validates through SDK schema', () => {
        const payload = {
            tools: TOOL_DEFINITIONS.map(({ name, description, inputSchema }) => ({
                name,
                description,
                inputSchema,
            })),
        };
        const parsed = ListToolsResultSchema.safeParse(payload);
        expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.flatten())).toBe(true);
    });

    it('present_action tells operators not to send a custom image overlay', () => {
        const action = TOOL_DEFINITIONS.find(d => d.name === 'present_action');
        expect(action?.description).toMatch(/NEVER put a custom overlay/);
        expect(action?.description).toMatch(/Do not call action "overlay" with src/);
        const branch = (action?.inputSchema as { oneOf: Array<{ description?: string; properties: { action: { const: string }; src?: { description?: string } } }> }).oneOf
            .find(entry => entry.properties.action.const === 'overlay');
        expect(branch?.description).toMatch(/Do not call/);
        expect(branch?.properties.src?.description).toMatch(/Do not send/);
        const clear = (action?.inputSchema as { oneOf: Array<{ description?: string; properties: { action: { const: string } } }> }).oneOf
            .find(entry => entry.properties.action.const === 'overlay_clear');
        expect(clear?.description).toMatch(/Remove an image overlay/);
    });
});
