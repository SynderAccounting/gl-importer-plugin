import type { ToolDefinition, ToolContext } from "./types.js";
import { ApiError } from "../errors.js";
import { loadFileForUpload, buildImportFormData } from "../upload.js";

const TERMINAL_STATUSES = new Set([
  "FINISHED",
  "FINISHED_WITH_WARNINGS",
  "FAILED",
  "CANCELED",
  "REVERTED",
]);

const POLL_INITIAL_MS = 2_000;
const POLL_MAX_INTERVAL_MS = 30_000;
const POLL_MULTIPLIER = 1.5;
const DEFAULT_TIMEOUT_SECONDS = 600;

interface StatusResponse {
  id?: string;
  status?: string;
  [k: string]: unknown;
}

interface ResultsPage {
  data?: unknown[];
  pagination?: { total?: number };
}

async function summarizeResults(
  ctx: ToolContext,
  companyId: string,
  importId: string,
): Promise<{ INFO: number | null; WARNING: number | null; ERROR: number | null }> {
  const summary: { INFO: number | null; WARNING: number | null; ERROR: number | null } = {
    INFO: null,
    WARNING: null,
    ERROR: null,
  };
  for (const type of ["INFO", "WARNING", "ERROR"] as const) {
    try {
      const page = await ctx.client.request<ResultsPage>({
        path: `/companies/${encodeURIComponent(companyId)}/imports/${encodeURIComponent(importId)}/results`,
        query: { type, page: 1, perPage: 1 },
      });
      const total = page.pagination?.total;
      summary[type] = typeof total === "number" ? total : page.data?.length ?? 0;
    } catch {
      // Leave as null — server may not support the count yet; LLM can call import_results directly.
    }
  }
  return summary;
}

export const importWait: ToolDefinition = {
  name: "import_wait",
  description:
    "Polls import_status until the import reaches a terminal state (FINISHED, FINISHED_WITH_WARNINGS, FAILED, CANCELED, REVERTED). Exponential backoff (2s → 1.5× → cap 30s). Default timeout 600s — if exceeded, returns { status: 'POLLING', importId, lastSeen } so the LLM can re-call. Includes a per-type result count summary on terminal states (INFO / WARNING / ERROR; null if the server didn't return totals).",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
      importId: { type: "string", description: "Import id from imports_list or import_execute." },
      timeoutSeconds: {
        type: "integer",
        minimum: 1,
        maximum: 3600,
        description: "Max seconds to wait before returning POLLING. Default 600.",
      },
    },
    required: ["companyId", "importId"],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    const companyId = String(input.companyId);
    const importId = String(input.importId);
    const timeoutSeconds =
      typeof input.timeoutSeconds === "number" ? input.timeoutSeconds : DEFAULT_TIMEOUT_SECONDS;
    const now = ctx.now ?? Date.now;
    const sleep = ctx.sleep ?? defaultSleep;

    const deadline = now() + timeoutSeconds * 1000;
    let interval = POLL_INITIAL_MS;
    let lastSeen: StatusResponse | undefined;

    while (true) {
      const status = await ctx.client.request<StatusResponse>({
        path: `/companies/${encodeURIComponent(companyId)}/imports/${encodeURIComponent(importId)}`,
      });
      lastSeen = status;

      if (status.status && TERMINAL_STATUSES.has(status.status)) {
        const summary = await summarizeResults(ctx, companyId, importId);
        return { ...status, summary };
      }

      const remaining = deadline - now();
      if (remaining <= 0) break;
      const wait = Math.min(interval, remaining);
      await sleep(wait);
      interval = Math.min(interval * POLL_MULTIPLIER, POLL_MAX_INTERVAL_MS);
    }

    return { status: "POLLING", importId, lastSeen };
  },
};

interface Company {
  id?: string;
  companyName?: string;
  status?: string;
}

async function resolveCompanyId(
  ctx: ToolContext,
  explicitId: string | undefined,
): Promise<string> {
  if (explicitId) return explicitId;
  const companies = await ctx.client.request<Company[]>({ path: "/companies" });
  const active = (companies ?? []).filter((c) => c.status === "ACTIVE" && c.id);
  if (active.length === 1) return String(active[0].id);
  if (active.length === 0) {
    throw new ApiError({
      code: "VALIDATION_ERROR",
      httpStatus: 0,
      message: "No ACTIVE companies on this Importer account.",
      hint: "Connect a QuickBooks or Xero company in Synder Importer first.",
    });
  }
  const names = active.map((c) => `${c.id}: ${c.companyName ?? "(unnamed)"}`).join("; ");
  throw new ApiError({
    code: "VALIDATION_ERROR",
    httpStatus: 0,
    message: `Multiple ACTIVE companies — pass companyId explicitly. Options: ${names}.`,
  });
}

export const importCsv: ToolDefinition = {
  name: "import_csv",
  description:
    "Happy-path CSV/XLSX importer. Two-step: first call (without confirmed) auto-resolves the company, uploads the file, and returns the server's proposed mapping plus any missingRequired fields — show this to the user. Re-call with confirmed=true (and the same filePath) to run the real import and poll until it terminates. Returns { stage: 'DRY_RUN' | 'DONE', importId?, status, summary?, proposedMapping?, missingRequired? }.",
  inputSchema: {
    type: "object",
    properties: {
      filePath: { type: "string", description: "Absolute path to a .csv, .xlsx, or .xls file." },
      entityName: {
        type: "string",
        description: "Entity to import as — match entities_list (e.g. 'Journal Entry').",
      },
      companyId: {
        type: "string",
        description: "Optional. If omitted and exactly one ACTIVE company exists, it's picked automatically.",
      },
      confirmed: {
        type: "boolean",
        description: "Set true on the second call to commit the import. Default false (dry-run only).",
      },
      timeoutSeconds: {
        type: "integer",
        minimum: 1,
        maximum: 3600,
        description: "Forwarded to import_wait on the confirmed call. Default 600.",
      },
    },
    required: ["filePath", "entityName"],
    additionalProperties: false,
  },
  handler: async (input, ctx) => {
    const filePath = String(input.filePath);
    const entityName = String(input.entityName);
    const confirmed = input.confirmed === true;
    const explicitCompanyId =
      typeof input.companyId === "string" && input.companyId.length > 0
        ? input.companyId
        : undefined;
    const timeoutSeconds =
      typeof input.timeoutSeconds === "number" ? input.timeoutSeconds : DEFAULT_TIMEOUT_SECONDS;

    const companyId = await resolveCompanyId(ctx, explicitCompanyId);
    const file = await loadFileForUpload(filePath);

    if (!confirmed) {
      const dryFd = buildImportFormData(file, { entityName, dryRun: "true" });
      const dry = await ctx.client.request<{
        proposedMapping?: unknown;
        missingRequired?: unknown;
      }>({
        method: "POST",
        path: `/companies/${encodeURIComponent(companyId)}/imports/auto`,
        formData: dryFd,
      });
      return {
        stage: "DRY_RUN",
        companyId,
        entityName,
        proposedMapping: dry.proposedMapping,
        missingRequired: dry.missingRequired,
        hint: "Show the proposed mapping to the user. Re-call import_csv with the same filePath and confirmed=true to commit.",
      };
    }

    const realFd = buildImportFormData(file, { entityName });
    const created = await ctx.client.request<StatusResponse>({
      method: "POST",
      path: `/companies/${encodeURIComponent(companyId)}/imports/auto`,
      formData: realFd,
    });
    const importId = created.id;
    if (!importId) {
      return { stage: "DONE", companyId, entityName, status: created.status ?? "UNKNOWN", created };
    }

    const waitResult = (await importWait.handler(
      { companyId, importId, timeoutSeconds },
      ctx,
    )) as Record<string, unknown>;

    return {
      stage: "DONE",
      companyId,
      entityName,
      importId,
      ...waitResult,
    };
  },
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
