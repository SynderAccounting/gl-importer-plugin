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

export const settingsUpdate: ToolDefinition = {
  name: "settings_update",
  description:
    "Updates per-company import settings. Pass only the fields you want to change inside 'settings' (e.g. { dateFormat: 'dd/MM/yyyy' }). Fetch current values with settings_get first so you don't clobber unrelated fields. Returns the updated settings.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
      settings: {
        type: "object",
        description:
          "Settings patch. Common fields: dateFormat ('MM/dd/yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd'), incrementDocNumber, createMissingProducts, createMissingAccounts, skipDuplicates.",
        additionalProperties: true,
      },
    },
    required: ["companyId", "settings"],
    additionalProperties: false,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    return client.request({
      method: "POST",
      path: `/companies/${encodeURIComponent(companyId)}/settings`,
      body: input.settings,
    });
  },
};
