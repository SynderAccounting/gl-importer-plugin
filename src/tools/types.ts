import type { ImporterClient } from "../client.js";

export interface ToolContext {
  client: ImporterClient;
  log: (line: string) => void;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}
