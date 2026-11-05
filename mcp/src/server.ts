#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './createServer.js';
import { fetchCommandCatalog } from './catalog.js';
import { loadConfigForStatus } from './config.js';

async function main() {
    const transport = new StdioServerTransport();
    await createServer().connect(transport);
    // Warm the catalog so the first present_send skips ~1 s of market-data fetch.
    void fetchCommandCatalog(loadConfigForStatus().origin, 'en').catch(() => {});
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
