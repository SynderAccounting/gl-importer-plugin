import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImporterClient } from "../../src/client.js";
import { findTool } from "../../src/tools/registry.js";
import { FetchMock } from "./fetch-mock.js";

const BASE = "https://importer.synder.com/api/v1";

let fixtureDir: string;
let csvPath: string;

beforeAll(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), "gl-importer-composites-"));
  csvPath = join(fixtureDir, "sample.csv");
  await writeFile(csvPath, "Date,Amount\n2026-01-01,100\n");
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

/**
 * Virtual-clock context: deterministic time + sleep, no real waiting.
 * Every sleep() advances the clock by the requested amount and yields.
 */
function virtualClockCtx(mock: FetchMock) {
  let clock = 0;
  return {
    client: new ImporterClient({ token: "t", fetchImpl: mock.fetch }),
    log: () => {},
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
      await Promise.resolve();
    },
    /** Test helper — not part of ToolContext. */
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("wait_for_import", () => {
  it("returns terminal status + result summary as soon as status is FINISHED", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "42", status: "FINISHED" } });
    mock.enqueue({ status: 200, body: { data: [], pagination: { total: 5 } } }); // INFO
    mock.enqueue({ status: 200, body: { data: [], pagination: { total: 1 } } }); // WARNING
    mock.enqueue({ status: 200, body: { data: [], pagination: { total: 0 } } }); // ERROR

    const ctx = virtualClockCtx(mock);
    const result = (await findTool("wait_for_import")!.handler(
      { companyId: "9", importId: "42" },
      ctx,
    )) as { status: string; summary: { INFO: number; WARNING: number; ERROR: number } };

    expect(result.status).toBe("FINISHED");
    expect(result.summary).toEqual({ INFO: 5, WARNING: 1, ERROR: 0 });
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/imports/42`);
    expect(new URL(mock.calls[1].url).searchParams.get("type")).toBe("INFO");
  });

  it("polls until terminal — IN_PROGRESS twice, then FINISHED_WITH_WARNINGS", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "42", status: "IN_PROGRESS" } });
    mock.enqueue({ status: 200, body: { id: "42", status: "IN_PROGRESS" } });
    mock.enqueue({ status: 200, body: { id: "42", status: "FINISHED_WITH_WARNINGS" } });
    mock.enqueue({ status: 200, body: { data: [{}], pagination: { total: 10 } } });
    mock.enqueue({ status: 200, body: { data: [], pagination: { total: 3 } } });
    mock.enqueue({ status: 200, body: { data: [], pagination: { total: 0 } } });

    const ctx = virtualClockCtx(mock);
    const result = (await findTool("wait_for_import")!.handler(
      { companyId: "9", importId: "42" },
      ctx,
    )) as { status: string; summary: Record<string, number> };

    expect(result.status).toBe("FINISHED_WITH_WARNINGS");
    expect(result.summary).toEqual({ INFO: 10, WARNING: 3, ERROR: 0 });
    expect(mock.calls.filter((c) => c.url.endsWith("/imports/42")).length).toBe(3);
  });

  it("returns { status: 'POLLING' } when timeoutSeconds elapses without terminal", async () => {
    const mock = new FetchMock();
    // 10 IN_PROGRESS responses — way more than needed before timeout
    for (let i = 0; i < 10; i++) {
      mock.enqueue({ status: 200, body: { id: "42", status: "IN_PROGRESS" } });
    }

    const ctx = virtualClockCtx(mock);
    const result = (await findTool("wait_for_import")!.handler(
      { companyId: "9", importId: "42", timeoutSeconds: 5 },
      ctx,
    )) as { status: string; importId: string; lastSeen: { status: string } };

    expect(result.status).toBe("POLLING");
    expect(result.importId).toBe("42");
    expect(result.lastSeen.status).toBe("IN_PROGRESS");
  });

  it("falls back to data.length when pagination.total is missing", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "1", status: "FINISHED" } });
    mock.enqueue({ status: 200, body: { data: [{}, {}, {}] } });
    mock.enqueue({ status: 200, body: { data: [] } });
    mock.enqueue({ status: 200, body: { data: [{}] } });

    const ctx = virtualClockCtx(mock);
    const result = (await findTool("wait_for_import")!.handler(
      { companyId: "9", importId: "1" },
      ctx,
    )) as { summary: { INFO: number; WARNING: number; ERROR: number } };
    expect(result.summary).toEqual({ INFO: 3, WARNING: 0, ERROR: 1 });
  });

  it("leaves a summary entry null when the results endpoint errors", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "1", status: "FAILED" } });
    mock.enqueue({ status: 500, body: { message: "boom" } }); // INFO results blow up
    mock.enqueue({ status: 200, body: { data: [], pagination: { total: 0 } } });
    mock.enqueue({ status: 200, body: { data: [], pagination: { total: 2 } } });

    const ctx = virtualClockCtx(mock);
    const result = (await findTool("wait_for_import")!.handler(
      { companyId: "9", importId: "1" },
      ctx,
    )) as { status: string; summary: { INFO: number | null; WARNING: number; ERROR: number } };

    expect(result.status).toBe("FAILED");
    expect(result.summary.INFO).toBeNull();
    expect(result.summary.WARNING).toBe(0);
    expect(result.summary.ERROR).toBe(2);
  });
});

describe("import_csv", () => {
  it("dry-run: auto-picks the single ACTIVE company and returns proposed mapping", async () => {
    const mock = new FetchMock();
    mock.enqueue({
      status: 200,
      body: [
        { id: "9", companyName: "Acme", status: "ACTIVE" },
        { id: "10", companyName: "Old Co", status: "DISCONNECTED" },
      ],
    });
    mock.enqueue({
      status: 200,
      body: {
        proposedMapping: { fields: [{ targetFieldId: "f1", sourceFieldTitle: "Date" }] },
        missingRequired: [],
      },
    });

    const ctx = virtualClockCtx(mock);
    const result = (await findTool("import_csv")!.handler(
      { filePath: csvPath, entityName: "Journal Entry" },
      ctx,
    )) as { stage: string; companyId: string; proposedMapping: unknown };

    expect(result.stage).toBe("DRY_RUN");
    expect(result.companyId).toBe("9");
    expect(result.proposedMapping).toBeTruthy();
    expect(mock.calls[0].url).toBe(`${BASE}/companies`);
    expect(mock.calls[1].url).toBe(`${BASE}/companies/9/imports/auto`);
    const fd = mock.calls[1].body as FormData;
    expect(fd.get("entityName")).toBe("Journal Entry");
    expect(fd.get("dryRun")).toBe("true");
  });

  it("dry-run: skips company resolution when companyId is given", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { proposedMapping: {}, missingRequired: [] } });

    const ctx = virtualClockCtx(mock);
    await findTool("import_csv")!.handler(
      { filePath: csvPath, entityName: "Bill", companyId: "777" },
      ctx,
    );

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].url).toBe(`${BASE}/companies/777/imports/auto`);
  });

  it("errors with VALIDATION_ERROR when no ACTIVE companies and no companyId", async () => {
    const mock = new FetchMock();
    mock.enqueue({
      status: 200,
      body: [{ id: "1", companyName: "Old", status: "DISCONNECTED" }],
    });

    const ctx = virtualClockCtx(mock);
    await expect(
      findTool("import_csv")!.handler(
        { filePath: csvPath, entityName: "Bill" },
        ctx,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("errors with VALIDATION_ERROR when multiple ACTIVE and no companyId", async () => {
    const mock = new FetchMock();
    mock.enqueue({
      status: 200,
      body: [
        { id: "1", companyName: "A", status: "ACTIVE" },
        { id: "2", companyName: "B", status: "ACTIVE" },
      ],
    });

    const ctx = virtualClockCtx(mock);
    await expect(
      findTool("import_csv")!.handler({ filePath: csvPath, entityName: "Bill" }, ctx),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("confirmed: runs auto (no dryRun) then polls wait_for_import to terminal", async () => {
    const mock = new FetchMock();
    // auto_import (confirmed) — returns created import
    mock.enqueue({ status: 201, body: { id: "imp99", status: "SCHEDULED" } });
    // wait_for_import first poll — FINISHED
    mock.enqueue({ status: 200, body: { id: "imp99", status: "FINISHED" } });
    // result summaries
    mock.enqueue({ status: 200, body: { data: [], pagination: { total: 12 } } });
    mock.enqueue({ status: 200, body: { data: [], pagination: { total: 0 } } });
    mock.enqueue({ status: 200, body: { data: [], pagination: { total: 0 } } });

    const ctx = virtualClockCtx(mock);
    const result = (await findTool("import_csv")!.handler(
      {
        filePath: csvPath,
        entityName: "Bill",
        companyId: "9",
        confirmed: true,
        timeoutSeconds: 30,
      },
      ctx,
    )) as { stage: string; importId: string; status: string; summary: Record<string, number> };

    expect(result.stage).toBe("DONE");
    expect(result.importId).toBe("imp99");
    expect(result.status).toBe("FINISHED");
    expect(result.summary).toEqual({ INFO: 12, WARNING: 0, ERROR: 0 });

    // First POST creates the import without dryRun in the form
    const createFd = mock.calls[0].body as FormData;
    expect(createFd.has("dryRun")).toBe(false);
    expect(createFd.get("entityName")).toBe("Bill");
    expect(mock.calls[0].url).toBe(`${BASE}/companies/9/imports/auto`);
  });
});
