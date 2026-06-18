import type { ToolDefinition } from "./types.js";

export const accountGet: ToolDefinition = {
  name: "account_get",
  description:
    "Returns the current Synder Importer account: email, name, status, subscription, and connected-company count. Call this first to verify the IMPORTER_API_TOKEN is valid.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  handler: async (_input, { client }) => {
    return client.request({ path: "/account" });
  },
};
