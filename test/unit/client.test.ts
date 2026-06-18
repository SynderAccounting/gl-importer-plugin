import { describe, it, expect, vi } from "vitest";
import { ImporterClient } from "../../src/client.js";
import { ApiError } from "../../src/errors.js";
import { FetchMock } from "./fetch-mock.js";

const BASE = "https://importer.synder.com/api/v1";

function makeClient(mock: FetchMock, opts: { token?: string; baseUrl?: string; log?: (l: string) => void } = {}) {
  return new ImporterClient({
    token: opts.token ?? "test-token",
    baseUrl: opts.baseUrl,
    fetchImpl: mock.fetch,
    log: opts.log,
  });
}

describe("ImporterClient", () => {
  it("sends Authorization header and parses JSON response", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "5", email: "x@y.z" } });

    const client = makeClient(mock);
    const result = await client.request<{ id: string }>({ path: "/account" });

    expect(result.id).toBe("5");
    expect(mock.calls[0].url).toBe(`${BASE}/account`);
    expect(mock.calls[0].headers.authorization).toBe("Bearer test-token");
    expect(mock.calls[0].headers["user-agent"]).toMatch(/^gl-importer-mcp/);
  });

  it("maps 401 to UNAUTHORIZED with hint", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 401, body: { message: "bad token" } });

    const client = makeClient(mock, { token: "bad" });
    try {
      await client.request({ path: "/account" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.code).toBe("UNAUTHORIZED");
      expect(err.httpStatus).toBe(401);
      expect(err.hint).toContain("IMPORTER_API_TOKEN");
    }
  });

  it("maps 422 to VALIDATION_ERROR and surfaces server message", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 422, body: { message: "missing required field 'entityName'" } });

    const client = makeClient(mock);
    try {
      await client.request({
        method: "POST",
        path: "/companies/1/mappings",
        body: { title: "x" },
      });
      throw new Error("should have thrown");
    } catch (e) {
      const err = e as ApiError;
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.message).toContain("missing required field");
      expect(err.toMcpText()).toContain("VALIDATION_ERROR (422)");
    }
  });

  it("retries on 429 respecting Retry-After header", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 429, headers: { "retry-after": "0" } });
    mock.enqueue({ status: 200, body: { id: "5" } });

    const client = makeClient(mock);
    const result = await client.request<{ id: string }>({ path: "/account" });
    expect(result.id).toBe("5");
    expect(mock.calls.length).toBe(2);
  });

  it("gives up on 429 after 3 attempts", async () => {
    const mock = new FetchMock();
    for (let i = 0; i < 3; i++) mock.enqueue({ status: 429, headers: { "retry-after": "0" } });

    const client = makeClient(mock);
    await expect(client.request({ path: "/account" })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(mock.calls.length).toBe(3);
  });

  it("sends Idempotency-Key on POST and reuses it on retries", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 429, headers: { "retry-after": "0" } });
    mock.enqueue({ status: 200, body: { id: "42" } });

    const client = makeClient(mock);
    const result = await client.request<{ id: string }>({
      method: "POST",
      path: "/companies/1/imports",
      body: {},
    });
    expect(result.id).toBe("42");
    const firstKey = mock.calls[0].headers["idempotency-key"];
    const retryKey = mock.calls[1].headers["idempotency-key"];
    expect(firstKey).toBeTruthy();
    expect(retryKey).toBe(firstKey);
  });

  it("does not send Idempotency-Key on GET", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { ok: true } });

    const client = makeClient(mock);
    await client.request({ path: "/account" });
    expect(mock.calls[0].headers["idempotency-key"]).toBeUndefined();
  });

  it("appends query string params", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { data: [] } });

    const client = makeClient(mock);
    await client.request({
      path: "/companies/1/imports/42/results",
      query: { type: "ERROR", page: 2, perPage: 100 },
    });
    const url = new URL(mock.calls[0].url);
    expect(url.searchParams.get("type")).toBe("ERROR");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("perPage")).toBe("100");
  });

  it("omits undefined query params", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: {} });

    const client = makeClient(mock);
    await client.request({
      path: "/x",
      query: { a: "1", b: undefined, c: "" },
    });
    const url = new URL(mock.calls[0].url);
    expect(url.searchParams.get("a")).toBe("1");
    expect(url.searchParams.has("b")).toBe(false);
    expect(url.searchParams.has("c")).toBe(false);
  });

  it("maps network failure to NETWORK_ERROR", async () => {
    const client = new ImporterClient({
      token: "t",
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    await expect(client.request({ path: "/account" })).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });

  it("respects custom baseUrl with trailing slash", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "9" } });

    const client = makeClient(mock, { baseUrl: "https://staging.example.com/v1/" });
    await client.request({ path: "/account" });
    expect(mock.calls[0].url).toBe("https://staging.example.com/v1/account");
  });

  it("returns undefined for 204 No Content", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 204 });

    const client = makeClient(mock);
    const result = await client.request({
      method: "DELETE",
      path: "/companies/1/mappings/9",
    });
    expect(result).toBeUndefined();
  });

  it("logs every request to the configured log fn", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: {} });
    const log = vi.fn();

    const client = makeClient(mock, { log });
    await client.request({ path: "/account" });

    expect(log).toHaveBeenCalled();
    const line = log.mock.calls[0]?.[0] ?? "";
    expect(line).toMatch(/\[gl-importer\] GET \/account → 200/);
  });

  it("sends JSON body with Content-Type on POST", async () => {
    const mock = new FetchMock();
    mock.enqueue({ status: 200, body: { id: "1" } });

    const client = makeClient(mock);
    await client.request({
      method: "POST",
      path: "/companies/1/mappings",
      body: { title: "x" },
    });
    expect(mock.calls[0].headers["content-type"]).toBe("application/json");
    expect(mock.calls[0].body).toBe(JSON.stringify({ title: "x" }));
  });
});
