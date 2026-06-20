#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ImporterClient } from "./client.js";
import { ApiError } from "./errors.js";
import { TOOLS, findTool } from "./tools/registry.js";

const SERVER_NAME = "gl-importer";
const SERVER_VERSION = "0.1.5";

const LOG_LEVELS = ["error", "warn", "info", "debug"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

function resolveLogLevel(): LogLevel {
  const raw = (process.env.IMPORTER_LOG_LEVEL ?? "info").toLowerCase();
  return (LOG_LEVELS as readonly string[]).includes(raw) ? (raw as LogLevel) : "info";
}

const CURRENT_LOG_LEVEL = resolveLogLevel();
const LOG_LEVEL_RANK: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

function log(line: string, level: LogLevel = "info"): void {
  if (LOG_LEVEL_RANK[level] <= LOG_LEVEL_RANK[CURRENT_LOG_LEVEL]) {
    process.stderr.write(`${line}\n`);
  }
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function makeUnauthorizedError(): ApiError {
  return new ApiError({
    code: "UNAUTHORIZED",
    httpStatus: 401,
    message: "IMPORTER_API_TOKEN env var is not set",
    hint: "Generate a token at importer.synder.com → Account → API Keys, then export IMPORTER_API_TOKEN=<token>.",
  });
}

async function validateTokenAtStartup(client: ImporterClient): Promise<void> {
  try {
    await client.request({ path: "/account" });
    log(`[gl-importer] Startup token check: OK`);
  } catch (e) {
    if (e instanceof ApiError) {
      log(`[gl-importer] Startup token check FAILED: ${e.toMcpText()}`);
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      log(`[gl-importer] Startup token check FAILED: ${msg}`);
    }
  }
}

async function main(): Promise<void> {
  const token = process.env.IMPORTER_API_TOKEN ?? "";
  const baseUrl = process.env.IMPORTER_BASE_URL;
  const requestTimeoutMs = parsePositiveInt(process.env.IMPORTER_REQUEST_TIMEOUT_MS);
  const maxRetries = parsePositiveInt(process.env.IMPORTER_MAX_RETRIES);

  if (!token) {
    log(`[gl-importer] ERROR: IMPORTER_API_TOKEN not set — all tool calls will fail`, "error");
  }

  const client = new ImporterClient({ token, baseUrl, log, requestTimeoutMs, maxRetries });

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
      ...(t.annotations ? { annotations: t.annotations } : {}),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = findTool(request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `NOT_FOUND (404): Tool "${request.params.name}" is not registered. Call tools/list to see available tools.`,
          },
        ],
      };
    }

    if (!token) {
      const err = makeUnauthorizedError();
      return {
        isError: true,
        content: [{ type: "text", text: err.toMcpText() }],
      };
    }

    try {
      const input = (request.params.arguments ?? {}) as Record<string, unknown>;
      const result = await tool.handler(input, { client, log });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (e) {
      if (e instanceof ApiError) {
        return {
          isError: true,
          content: [{ type: "text", text: e.toMcpText() }],
        };
      }
      const msg = e instanceof Error ? e.message : String(e);
      log(`[gl-importer] Unexpected error in tool ${tool.name}: ${msg}`);
      return {
        isError: true,
        content: [{ type: "text", text: `CLIENT_ERROR (0): ${msg}.` }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`[gl-importer] MCP server v${SERVER_VERSION} ready (${TOOLS.length} tools)`);

  if (token) {
    void validateTokenAtStartup(client);
  }
}

main().catch((err) => {
  process.stderr.write(`[gl-importer] fatal: ${err}\n`);
  process.exit(1);
});
