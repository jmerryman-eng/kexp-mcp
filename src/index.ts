#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createKexpMcpServer } from './mcp-server.js';

async function runServer() {
  const server = createKexpMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('KEXP MCP Server running on stdio');
}

runServer().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
