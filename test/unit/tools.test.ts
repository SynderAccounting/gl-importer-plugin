import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImporterClient } from "../../src/client.js";
import { TOOLS, findTool } from "../../src/tools/registry.js";
import { FetchMock } from "./fetch-mock.js";

const BASE = "https://importer.synder.com/api/v1";

let fixtureDir: string;
let csvPath: string;

beforeAll(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), "gl-importer-tools-"));
  csvPath = join(fixtureDir, "sample.csv");
  await writeFile(csvPath, "Date,Amount\n2026-01-01,100\n");
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

function makeCtx(mock: FetchMock) {
  return {
    client: new ImporterClient({ token: "t", fetchImpl: mock.fetch }),
    log: () => {},
  };
}

describe("tool registry", () => {
  it("registers 19 tools through PR 5 (15 low-level + 2 composites)", () => {
    expect(TOOLS).toHaveLength(19);
    expect(TOOLS.map((t) => t.name)).toEqual([
      "get_account",
      "list_companies",
      "get_settings",
      "update_settings",
      "list_entities",
      "get_fields",
      "list_mappings",
      "create_mapping",
      "update_mapping",
      "delete_mapping",
      "list_imports",
      "get_import_status",
      "get_import_results",
      "execute_import",
      "auto_import",
      "cancel_import",
      "revert_import",
      "wait_for_import",
      "import_csv",
    ]);
  });

  it("each tool has a non-trivial description", () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(40);
    }
  });

  it("findTool returns undefined for unknown tool", () => {
    expect(findTool("nope")).toBeUndefined();
  });

  it("get_account hits /account", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "5", email: "x@y.z", status: "ACTIVE" } });
    const result = await findTool("get_account")!.handler({}, makeCtx(mock));
    expect(result).toMatchObject({ id: "5" });
    expect(mock.calls[0].url).toBe(`${BASE}/account`);
  });

  it("list_companies hits /companies", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: [{ id: "9", companyName: "Acme" }] });
    const result = (await findTool("list_companies")!.handler({}, makeCtx(mock))) as unknown[];
    expect(result).toHaveLength(1);
    expect(mock.calls[0].url).toBe(`${BASE}/companies`);
  });

  it("get_settings hits /companies/{id}/settings", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { dateFormat: "MM/dd/yyyy" } });
    await findTool("get_settings")!.handler({ companyId: "9" }, makeCtx(mock));
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/settings`);
  });

  it("list_entities URL-encodes the company id", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: [] });
    await findTool("list_entities")!.handler({ companyId: "9" }, makeCtx(mock));
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/entities`);
  });

  it("get_fields URL-encodes the entity name", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: [{ id: "1", title: "DocNumber" }] });
    await findTool("get_fields")!.handler(
      { companyId: "9", entityName: "Journal Entry" },
      makeCtx(mock),
    );
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/entities/Journal%20Entry/fields`);
  });

  it("list_mappings returns mappings", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: [] });
    const result = await findTool("list_mappings")!.handler({ companyId: "9" }, makeCtx(mock));
    expect(result).toEqual([]);
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/mappings`);
  });

  it("list_imports returns imports", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: [{ id: "42", status: "FINISHED" }] });
    await findTool("list_imports")!.handler({ companyId: "9" }, makeCtx(mock));
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/imports`);
  });

  it("get_import_status returns status object", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "42", status: "FINISHED" } });
    const result = await findTool("get_import_status")!.handler(
      { companyId: "9", importId: "42" },
      makeCtx(mock),
    );
    expect(result).toMatchObject({ status: "FINISHED" });
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/imports/42`);
  });

  it("get_import_results forwards type, page, perPage as query params", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { data: [], pagination: {} } });
    await findTool("get_import_results")!.handler(
      { companyId: "9", importId: "42", type: "ERROR", page: 2, perPage: 50 },
      makeCtx(mock),
    );
    const url = new URL(mock.calls[0].url);
    expect(url.pathname).toBe("/api/v1/companies/9/imports/42/results");
    expect(url.searchParams.get("type")).toBe("ERROR");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("perPage")).toBe("50");
  });

  it("get_import_results works without optional query params", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { data: [] } });
    await findTool("get_import_results")!.handler(
      { companyId: "9", importId: "42" },
      makeCtx(mock),
    );
    const url = new URL(mock.calls[0].url);
    expect(url.searchParams.toString()).toBe("");
  });

  it("update_settings POSTs the settings body to /companies/{id}/settings", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { dateFormat: "dd/MM/yyyy" } });
    const result = await findTool("update_settings")!.handler(
      { companyId: "9", settings: { dateFormat: "dd/MM/yyyy" } },
      makeCtx(mock),
    );
    expect(result).toMatchObject({ dateFormat: "dd/MM/yyyy" });
    expect(mock.calls[0].method).toBe("POST");
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/settings`);
    expect(mock.calls[0].body).toBe(JSON.stringify({ dateFormat: "dd/MM/yyyy" }));
    expect(mock.calls[0].headers["content-type"]).toBe("application/json");
    expect(mock.calls[0].headers["idempotency-key"]).toBeTruthy();
  });

  it("create_mapping POSTs {title, entityName, fields} to /companies/{id}/mappings", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 201, body: { id: "m1", title: "JE map" } });
    const fields = [{ targetFieldId: "f1", sourceFieldTitle: "Date" }];
    const result = await findTool("create_mapping")!.handler(
      { companyId: "9", title: "JE map", entityName: "Journal Entry", fields },
      makeCtx(mock),
    );
    expect(result).toMatchObject({ id: "m1" });
    expect(mock.calls[0].method).toBe("POST");
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/mappings`);
    expect(JSON.parse(mock.calls[0].body as string)).toEqual({
      title: "JE map",
      entityName: "Journal Entry",
      fields,
    });
    expect(mock.calls[0].headers["idempotency-key"]).toBeTruthy();
  });

  it("update_mapping PUTs full body to /companies/{id}/mappings/{mid}", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "m1", title: "JE map v2" } });
    const fields = [{ targetFieldId: "f1", fixedValue: "USD" }];
    await findTool("update_mapping")!.handler(
      {
        companyId: "9",
        mappingId: "m1",
        title: "JE map v2",
        entityName: "Journal Entry",
        fields,
      },
      makeCtx(mock),
    );
    expect(mock.calls[0].method).toBe("PUT");
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/mappings/m1`);
    expect(JSON.parse(mock.calls[0].body as string)).toEqual({
      title: "JE map v2",
      entityName: "Journal Entry",
      fields,
    });
  });

  it("delete_mapping DELETEs /companies/{id}/mappings/{mid} and returns confirmation", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 204 });
    const result = await findTool("delete_mapping")!.handler(
      { companyId: "9", mappingId: "m1" },
      makeCtx(mock),
    );
    expect(result).toEqual({ deleted: true, mappingId: "m1" });
    expect(mock.calls[0].method).toBe("DELETE");
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/mappings/m1`);
  });

  it("delete_mapping surfaces 404 as NOT_FOUND", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 404, body: { message: "mapping not found" } });
    await expect(
      findTool("delete_mapping")!.handler(
        { companyId: "9", mappingId: "missing" },
        makeCtx(mock),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404 });
  });

  it("execute_import uploads file as multipart with entityName + mappingId", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 201, body: { id: "imp1", status: "SCHEDULED" } });

    const result = await findTool("execute_import")!.handler(
      {
        companyId: "9",
        filePath: csvPath,
        entityName: "Journal Entry",
        mappingId: "m1",
      },
      makeCtx(mock),
    );
    expect(result).toMatchObject({ id: "imp1", status: "SCHEDULED" });
    expect(mock.calls[0].method).toBe("POST");
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/imports`);
    const fd = mock.calls[0].body as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get("entityName")).toBe("Journal Entry");
    expect(fd.get("mappingId")).toBe("m1");
    const file = fd.get("file") as File;
    expect(file.name).toBe("sample.csv");
    expect(file.type).toBe("text/csv");
    expect(mock.calls[0].headers["idempotency-key"]).toBeTruthy();
  });

  it("execute_import rejects unsupported file types before hitting the API", async () => {
    const mock = new FetchMock();
    const badPath = join(fixtureDir, "bad.txt");
    await writeFile(badPath, "hi");
    await expect(
      findTool("execute_import")!.handler(
        { companyId: "9", filePath: badPath, entityName: "Bill", mappingId: "m1" },
        makeCtx(mock),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mock.calls).toHaveLength(0);
  });

  it("auto_import with dryRun=true sends 'dryRun' in form and returns proposed mapping", async () => {
    const mock = new FetchMock();
    mock.enqueue({
      status: 200,
      body: { proposedMapping: { fields: [] }, missingRequired: [] },
    });

    const result = await findTool("auto_import")!.handler(
      {
        companyId: "9",
        filePath: csvPath,
        entityName: "Bill",
        dryRun: true,
      },
      makeCtx(mock),
    );
    expect(result).toMatchObject({ proposedMapping: { fields: [] } });
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/imports/auto`);
    const fd = mock.calls[0].body as FormData;
    expect(fd.get("entityName")).toBe("Bill");
    expect(fd.get("dryRun")).toBe("true");
  });

  it("auto_import omits dryRun when falsy or absent", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 201, body: { id: "imp2", status: "SCHEDULED" } });

    await findTool("auto_import")!.handler(
      { companyId: "9", filePath: csvPath, entityName: "Bill" },
      makeCtx(mock),
    );
    const fd = mock.calls[0].body as FormData;
    expect(fd.has("dryRun")).toBe(false);
    expect(fd.get("entityName")).toBe("Bill");
  });

  it("cancel_import POSTs to /imports/{id}/cancel with no body", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "42", status: "CANCELED" } });

    const result = await findTool("cancel_import")!.handler(
      { companyId: "9", importId: "42" },
      makeCtx(mock),
    );
    expect(result).toMatchObject({ status: "CANCELED" });
    expect(mock.calls[0].method).toBe("POST");
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/imports/42/cancel`);
    expect(mock.calls[0].body).toBeUndefined();
  });

  it("revert_import POSTs to /imports/{id}/revert with no body", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "42", status: "REVERTING" } });

    const result = await findTool("revert_import")!.handler(
      { companyId: "9", importId: "42" },
      makeCtx(mock),
    );
    expect(result).toMatchObject({ status: "REVERTING" });
    expect(mock.calls[0].method).toBe("POST");
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/imports/42/revert`);
    expect(mock.calls[0].body).toBeUndefined();
  });

  it("propagates ApiError from 404", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 404, body: { message: "not found" } });
    await expect(
      findTool("get_settings")!.handler({ companyId: "999" }, makeCtx(mock)),
    ).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404 });
  });
});
