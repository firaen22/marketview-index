import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DEFINITIONS, TOOL_HANDLERS } from './tools.js';

export const SERVER_VERSION = '0.2.0';

export function createServer(): Server {
    const server = new Server(
        { name: 'marketview-present', version: SERVER_VERSION },
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
        const handler = Object.hasOwn(TOOL_HANDLERS, name) ? TOOL_HANDLERS[name] : undefined;
        if (!handler) {
            return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }] };
        }
        return handler((req.params.arguments ?? {}) as Record<string, unknown>);
    });

    return server;
}
