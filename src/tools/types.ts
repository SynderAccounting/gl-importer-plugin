import type { ImporterClient } from "../client.js";

export interface ToolContext {
  client: ImporterClient;
  log: (line: string) => void;
  /** Override for time source. Used by polling composites; defaults to Date.now. */
  now?: () => number;
  /** Override for sleep. Used by polling composites; defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
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
  outputSchema?: {
    readonly type: "object";
    readonly description?: string;
    readonly properties?: Readonly<Record<string, unknown>>;
    readonly required?: readonly string[];
    readonly additionalProperties?: boolean;
  };
  annotations?: ToolAnnotations;
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}
