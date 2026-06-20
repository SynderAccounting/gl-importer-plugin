import type { ToolDefinition } from "./types.js";
import { loadFileForUpload, buildImportFormData } from "../upload.js";

const IMPORT_OBJECT_SHAPE = {
  type: "object",
  properties: {
    id: { type: "string", description: "Import id." },
    status: {
      type: "string",
      description: "Lifecycle status (SCHEDULED, IN_PROGRESS, FINISHED, FINISHED_WITH_WARNINGS, FAILED, CANCELED, REVERTING, REVERTED).",
    },
    entityName: { type: "string", description: "Entity type being imported." },
    fileName: { type: "string", description: "Uploaded file name." },
    summary: {
      type: "object",
      description: "Counts per result type.",
      properties: {
        total: { type: "integer" },
        succeeded: { type: "integer" },
        failed: { type: "integer" },
        warnings: { type: "integer" },
      },
      additionalProperties: true,
    },
    createdAt: { type: "string", description: "ISO timestamp." },
    finishedAt: { type: "string", description: "ISO timestamp when reached terminal status, if applicable." },
  },
  required: ["id", "status"],
  additionalProperties: true,
} as const;

const IMPORT_RESULT_ROW_SHAPE = {
  type: "object",
  properties: {
    rowNumber: { type: "integer", description: "1-indexed row number in the source file." },
    type: { type: "string", enum: ["INFO", "WARNING", "ERROR"] },
    message: { type: "string", description: "Human-readable result message." },
    createdEntityId: { type: "string", description: "QBO/Xero entity id created, if any." },
  },
  required: ["rowNumber", "type"],
  additionalProperties: true,
} as const;

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
  outputSchema: {
    type: "object",
    properties: {
      imports: { type: "array", description: "Recent imports.", items: IMPORT_OBJECT_SHAPE },
    },
    additionalProperties: true,
  },
  annotations: {
    title: "List recent imports",
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
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
  outputSchema: IMPORT_OBJECT_SHAPE,
  annotations: {
    title: "Get import status",
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
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
  outputSchema: {
    type: "object",
    properties: {
      rows: { type: "array", description: "Per-row results.", items: IMPORT_RESULT_ROW_SHAPE },
      page: { type: "integer", description: "Current page (1-indexed)." },
      perPage: { type: "integer", description: "Rows per page." },
      total: { type: "integer", description: "Total result rows across all pages." },
      totalPages: { type: "integer", description: "Total page count." },
    },
    additionalProperties: true,
  },
  annotations: {
    title: "Get per-row import results",
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
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

export const importExecute: ToolDefinition = {
  name: "import_execute",
  description:
    "Uploads a CSV/XLSX file and starts an import using an existing mapping. The MCP server reads the file from disk — pass an absolute path. Returns the created import object including importId. Status starts as SCHEDULED — poll import_status or use import_wait. Limits: .csv/.xlsx/.xls only, 50MB max.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
      filePath: {
        type: "string",
        description: "Absolute path to a .csv, .xlsx, or .xls file on the machine running the MCP server.",
      },
      entityName: {
        type: "string",
        description: "Entity to import as — must match entities_list (e.g. 'Journal Entry').",
      },
      mappingId: { type: "string", description: "Mapping id from mappings_list to apply to the file." },
    },
    required: ["companyId", "filePath", "entityName", "mappingId"],
    additionalProperties: false,
  },
  outputSchema: IMPORT_OBJECT_SHAPE,
  annotations: {
    title: "Execute file import with mapping",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    const file = await loadFileForUpload(String(input.filePath));
    const fd = buildImportFormData(file, {
      entityName: String(input.entityName),
      mappingId: String(input.mappingId),
    });
    return client.request({
      method: "POST",
      path: `/companies/${encodeURIComponent(companyId)}/imports`,
      formData: fd,
    });
  },
};

export const importAuto: ToolDefinition = {
  name: "import_auto",
  description:
    "Uploads a file and asks the server to auto-map columns to the target entity. Set dryRun=true to get the proposed mapping back without creating an import — useful for showing the user what will happen and asking 'does this look right?' before committing. Set dryRun=false (default) to auto-map and import in one call.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
      filePath: { type: "string", description: "Absolute path to a .csv, .xlsx, or .xls file." },
      entityName: {
        type: "string",
        description: "Entity to import as — must match entities_list output.",
      },
      dryRun: {
        type: "boolean",
        description: "If true, returns proposed mapping without starting an import. Default false.",
      },
    },
    required: ["companyId", "filePath", "entityName"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    description:
      "Either an import object (dryRun=false) or a proposed mapping with detected columns (dryRun=true).",
    properties: {
      id: { type: "string", description: "Import id (present when dryRun=false)." },
      status: { type: "string", description: "Import status (present when dryRun=false)." },
      proposedMapping: {
        type: "object",
        description: "Auto-resolved column→field mapping (present when dryRun=true).",
        additionalProperties: true,
      },
      detectedColumns: {
        type: "array",
        items: { type: "string" },
        description: "Headers found in the uploaded file (present when dryRun=true).",
      },
      missingRequired: {
        type: "array",
        items: { type: "string" },
        description: "Required target fields the auto-mapper could not resolve.",
      },
    },
    additionalProperties: true,
  },
  annotations: {
    title: "Auto-map and import a file",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    const file = await loadFileForUpload(String(input.filePath));
    const fd = buildImportFormData(file, {
      entityName: String(input.entityName),
      dryRun: input.dryRun === true ? "true" : undefined,
    });
    return client.request({
      method: "POST",
      path: `/companies/${encodeURIComponent(companyId)}/imports/auto`,
      formData: fd,
    });
  },
};

export const importCancel: ToolDefinition = {
  name: "import_cancel",
  description:
    "Cancels a SCHEDULED or IN_PROGRESS import. Already-imported rows are NOT rolled back — use import_revert for that. Returns the updated import status.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
      importId: { type: "string", description: "Import id from imports_list." },
    },
    required: ["companyId", "importId"],
    additionalProperties: false,
  },
  outputSchema: IMPORT_OBJECT_SHAPE,
  annotations: {
    title: "Cancel a running import",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    const importId = String(input.importId);
    return client.request({
      method: "POST",
      path: `/companies/${encodeURIComponent(companyId)}/imports/${encodeURIComponent(importId)}/cancel`,
    });
  },
};

export const importRevert: ToolDefinition = {
  name: "import_revert",
  description:
    "Reverts a FINISHED or FINISHED_WITH_WARNINGS import — deletes the QuickBooks/Xero entries the import created, using their live SyncTokens. Status transitions FINISHED → REVERTING → REVERTED. Confirm with the user before calling — irreversible from their perspective.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
      importId: { type: "string", description: "Import id from imports_list." },
    },
    required: ["companyId", "importId"],
    additionalProperties: false,
  },
  outputSchema: IMPORT_OBJECT_SHAPE,
  annotations: {
    title: "Revert finished import",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    const importId = String(input.importId);
    return client.request({
      method: "POST",
      path: `/companies/${encodeURIComponent(companyId)}/imports/${encodeURIComponent(importId)}/revert`,
    });
  },
};
