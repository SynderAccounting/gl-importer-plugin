import type { ToolDefinition } from "./types.js";

export const companiesList: ToolDefinition = {
  name: "companies_list",
  description:
    "Lists all accounting companies connected to the Importer account (QuickBooks Online via 'intuit', Xero via 'xero'). Use the returned 'id' as companyId for downstream tools.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  handler: async (_input, { client }) => {
    return client.request({ path: "/companies" });
  },
};

export const settingsGet: ToolDefinition = {
  name: "settings_get",
  description:
    "Returns per-company import settings (dateFormat, document-number behavior, product/account auto-creation, duplicate-skip). Check dateFormat before importing — CSV date columns must match.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
    },
    required: ["companyId"],
    additionalProperties: false,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    return client.request({ path: `/companies/${encodeURIComponent(companyId)}/settings` });
  },
};
