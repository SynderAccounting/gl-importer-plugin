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
      "account_get",
      "companies_list",
      "settings_get",
      "settings_update",
      "entities_list",
      "fields_get",
      "mappings_list",
      "mapping_create",
      "mapping_update",
      "mapping_delete",
      "imports_list",
      "import_status",
      "import_results",
      "import_execute",
      "import_auto",
      "import_cancel",
      "import_revert",
      "import_wait",
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

  it("account_get hits /account", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "5", email: "x@y.z", status: "ACTIVE" } });
    const result = await findTool("account_get")!.handler({}, makeCtx(mock));
    expect(result).toMatchObject({ id: "5" });
    expect(mock.calls[0].url).toBe(`${BASE}/account`);
  });

  it("companies_list hits /companies", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: [{ id: "9", companyName: "Acme" }] });
    const result = (await findTool("companies_list")!.handler({}, makeCtx(mock))) as unknown[];
    expect(result).toHaveLength(1);
    expect(mock.calls[0].url).toBe(`${BASE}/companies`);
  });

  it("settings_get hits /companies/{id}/settings", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { dateFormat: "MM/dd/yyyy" } });
    await findTool("settings_get")!.handler({ companyId: "9" }, makeCtx(mock));
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/settings`);
  });

  it("entities_list URL-encodes the company id", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: [] });
    await findTool("entities_list")!.handler({ companyId: "9" }, makeCtx(mock));
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/entities`);
  });

  it("fields_get URL-encodes the entity name", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: [{ id: "1", title: "DocNumber" }] });
    await findTool("fields_get")!.handler(
      { companyId: "9", entityName: "Journal Entry" },
      makeCtx(mock),
    );
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/entities/Journal%20Entry/fields`);
  });

  it("mappings_list returns mappings", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: [] });
    const result = await findTool("mappings_list")!.handler({ companyId: "9" }, makeCtx(mock));
    expect(result).toEqual([]);
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/mappings`);
  });

  it("imports_list returns imports", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: [{ id: "42", status: "FINISHED" }] });
    await findTool("imports_list")!.handler({ companyId: "9" }, makeCtx(mock));
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/imports`);
  });

  it("import_status returns status object", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "42", status: "FINISHED" } });
    const result = await findTool("import_status")!.handler(
      { companyId: "9", importId: "42" },
      makeCtx(mock),
    );
    expect(result).toMatchObject({ status: "FINISHED" });
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/imports/42`);
  });

  it("import_results forwards type, page, perPage as query params", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { data: [], pagination: {} } });
    await findTool("import_results")!.handler(
      { companyId: "9", importId: "42", type: "ERROR", page: 2, perPage: 50 },
      makeCtx(mock),
    );
    const url = new URL(mock.calls[0].url);
    expect(url.pathname).toBe("/api/v1/companies/9/imports/42/results");
    expect(url.searchParams.get("type")).toBe("ERROR");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("perPage")).toBe("50");
  });

  it("import_results works without optional query params", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { data: [] } });
    await findTool("import_results")!.handler(
      { companyId: "9", importId: "42" },
      makeCtx(mock),
    );
    const url = new URL(mock.calls[0].url);
    expect(url.searchParams.toString()).toBe("");
  });

  it("settings_update POSTs the settings body to /companies/{id}/settings", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { dateFormat: "dd/MM/yyyy" } });
    const result = await findTool("settings_update")!.handler(
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

  it("mapping_create POSTs {title, entityName, fields} to /companies/{id}/mappings", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 201, body: { id: "m1", title: "JE map" } });
    const fields = [{ targetFieldId: "f1", sourceFieldTitle: "Date" }];
    const result = await findTool("mapping_create")!.handler(
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

  it("mapping_update PUTs full body to /companies/{id}/mappings/{mid}", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "m1", title: "JE map v2" } });
    const fields = [{ targetFieldId: "f1", fixedValue: "USD" }];
    await findTool("mapping_update")!.handler(
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

  it("mapping_delete DELETEs /companies/{id}/mappings/{mid} and returns confirmation", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 204 });
    const result = await findTool("mapping_delete")!.handler(
      { companyId: "9", mappingId: "m1" },
      makeCtx(mock),
    );
    expect(result).toEqual({ deleted: true, mappingId: "m1" });
    expect(mock.calls[0].method).toBe("DELETE");
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/mappings/m1`);
  });

  it("mapping_delete surfaces 404 as NOT_FOUND", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 404, body: { message: "mapping not found" } });
    await expect(
      findTool("mapping_delete")!.handler(
        { companyId: "9", mappingId: "missing" },
        makeCtx(mock),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404 });
  });

  it("import_execute uploads file as multipart with entityName + mappingId", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 201, body: { id: "imp1", status: "SCHEDULED" } });

    const result = await findTool("import_execute")!.handler(
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

  it("import_execute rejects unsupported file types before hitting the API", async () => {
    const mock = new FetchMock();
    const badPath = join(fixtureDir, "bad.txt");
    await writeFile(badPath, "hi");
    await expect(
      findTool("import_execute")!.handler(
        { companyId: "9", filePath: badPath, entityName: "Bill", mappingId: "m1" },
        makeCtx(mock),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mock.calls).toHaveLength(0);
  });

  it("import_auto with dryRun=true sends 'dryRun' in form and returns proposed mapping", async () => {
    const mock = new FetchMock();
    mock.enqueue({
      status: 200,
      body: { proposedMapping: { fields: [] }, missingRequired: [] },
    });

    const result = await findTool("import_auto")!.handler(
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

  it("import_auto omits dryRun when falsy or absent", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 201, body: { id: "imp2", status: "SCHEDULED" } });

    await findTool("import_auto")!.handler(
      { companyId: "9", filePath: csvPath, entityName: "Bill" },
      makeCtx(mock),
    );
    const fd = mock.calls[0].body as FormData;
    expect(fd.has("dryRun")).toBe(false);
    expect(fd.get("entityName")).toBe("Bill");
  });

  it("import_cancel POSTs to /imports/{id}/cancel with no body", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "42", status: "CANCELED" } });

    const result = await findTool("import_cancel")!.handler(
      { companyId: "9", importId: "42" },
      makeCtx(mock),
    );
    expect(result).toMatchObject({ status: "CANCELED" });
    expect(mock.calls[0].method).toBe("POST");
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/imports/42/cancel`);
    expect(mock.calls[0].body).toBeUndefined();
  });

  it("import_revert POSTs to /imports/{id}/revert with no body", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "42", status: "REVERTING" } });

    const result = await findTool("import_revert")!.handler(
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
      findTool("settings_get")!.handler({ companyId: "999" }, makeCtx(mock)),
    ).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404 });
  });
});
