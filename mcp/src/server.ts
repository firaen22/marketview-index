#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DEFINITIONS, TOOL_HANDLERS } from './tools.js';

const server = new Server(
    { name: 'marketview-present', version: '0.1.0' },
    { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
    })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name as keyof typeof TOOL_HANDLERS;
    const handler = TOOL_HANDLERS[name];
    if (!handler) {
        return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }] };
    }
    return handler((req.params.arguments ?? {}) as Record<string, unknown>);
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
