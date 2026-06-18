#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "gl-importer";
const SERVER_VERSION = "0.1.0";

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => ({
  isError: true,
  content: [
    {
      type: "text",
      text: `Tool "${request.params.name}" is not yet implemented. The gl-importer MCP server is at scaffold stage (v${SERVER_VERSION}). See plans/gl-importer-mcp-plan-2026-06-18.md.`,
    },
  ],
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`gl-importer MCP server fatal error: ${err}\n`);
  process.exit(1);
});
