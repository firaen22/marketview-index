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
});
