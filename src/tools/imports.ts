import type { ToolDefinition } from "./types.js";

export const importsList: ToolDefinition = {
  name: "imports_list",
  description:
    "Lists recent imports for a company with status and timestamps. Use to find an importId for status / results / revert / cancel.",
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
    return client.request({ path: `/companies/${encodeURIComponent(companyId)}/imports` });
  },
};

export const importStatus: ToolDefinition = {
  name: "import_status",
  description:
    "Returns a single import's current status and summary (total / succeeded / failed / warnings). Status lifecycle: SCHEDULED → IN_PROGRESS → FINISHED | FINISHED_WITH_WARNINGS | FAILED | CANCELED. FINISHED can transition to REVERTING → REVERTED.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
      importId: { type: "string", description: "Import id from imports_list." },
    },
    required: ["companyId", "importId"],
    additionalProperties: false,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    const importId = String(input.importId);
    return client.request({
      path: `/companies/${encodeURIComponent(companyId)}/imports/${encodeURIComponent(importId)}`,
    });
  },
};

export const importResults: ToolDefinition = {
  name: "import_results",
  description:
    "Returns per-row results for a finished import. Filter by 'type' (INFO / WARNING / ERROR) to surface only failures. Paginated — defaults to 20 rows per page, max 100.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
      importId: { type: "string", description: "Import id from imports_list." },
      type: {
        type: "string",
        enum: ["INFO", "WARNING", "ERROR"],
        description: "Optional: filter rows by result type.",
      },
      page: { type: "integer", minimum: 1, description: "Page number (1-indexed). Default 1." },
      perPage: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        description: "Rows per page. Default 20, max 100.",
      },
    },
    required: ["companyId", "importId"],
    additionalProperties: false,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    const importId = String(input.importId);
    return client.request({
      path: `/companies/${encodeURIComponent(companyId)}/imports/${encodeURIComponent(importId)}/results`,
      query: {
        type: input.type as string | undefined,
        page: input.page as number | undefined,
        perPage: input.perPage as number | undefined,
      },
    });
  },
};
