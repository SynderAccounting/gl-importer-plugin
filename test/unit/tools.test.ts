import { describe, it, expect } from "vitest";
import { ImporterClient } from "../../src/client.js";
import { TOOLS, findTool } from "../../src/tools/registry.js";
import { FetchMock } from "./fetch-mock.js";

const BASE = "https://importer.synder.com/api/v1";

function makeCtx(mock: FetchMock) {
  return {
    client: new ImporterClient({ token: "t", fetchImpl: mock.fetch }),
    log: () => {},
  };
}

describe("tool registry", () => {
  it("registers 9 read-only tools in PR 1+2", () => {
    expect(TOOLS).toHaveLength(9);
    expect(TOOLS.map((t) => t.name)).toEqual([
      "account_get",
      "companies_list",
      "settings_get",
      "entities_list",
      "fields_get",
      "mappings_list",
      "imports_list",
      "import_status",
      "import_results",
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

  it("propagates ApiError from 404", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 404, body: { message: "not found" } });
    await expect(
      findTool("settings_get")!.handler({ companyId: "999" }, makeCtx(mock)),
    ).rejects.toMatchObject({ code: "NOT_FOUND", httpStatus: 404 });
  });
});
