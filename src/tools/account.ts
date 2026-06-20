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
  outputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Account id." },
      email: { type: "string", description: "Account owner email." },
      name: { type: "string", description: "Account owner full name." },
      status: { type: "string", description: "Account lifecycle status (e.g. ACTIVE, TRIAL, SUSPENDED)." },
      subscription: { type: "object", description: "Subscription plan + billing fields.", additionalProperties: true },
      connectedCompaniesCount: { type: "integer", description: "Number of accounting companies linked to this account." },
    },
    additionalProperties: true,
  },
  annotations: {
    title: "Get Synder Importer account",
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  },
  handler: async (_input, { client }) => {
    return client.request({ path: "/account" });
  },
};
