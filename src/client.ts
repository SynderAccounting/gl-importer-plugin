import { randomUUID } from "node:crypto";
import { ApiError, buildApiError } from "./errors.js";

const DEFAULT_BASE_URL = "https://importer.synder.com/api/v1";
const USER_AGENT = "gl-importer-mcp/0.1.0";
const DEFAULT_MAX_RETRIES = 3;
const RATE_LIMIT_TOTAL_CAP_MS = 60_000;
const RATE_LIMIT_INITIAL_BACKOFF_MS = 2_000;

export interface ClientOptions {
  baseUrl?: string;
  token: string;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
  /** Per-request timeout in ms. 0/undefined disables. */
  requestTimeoutMs?: number;
  /** Override for 429 retry attempt count. Default 3. */
  maxRetries?: number;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Pre-built multipart form. When set, body is ignored and Content-Type is left to fetch (sets boundary). */
  formData?: FormData;
  /** When true, a fresh Idempotency-Key is added on the first attempt and reused on retries. */
  idempotent?: boolean;
  idempotencyKey?: string;
}

export class ImporterClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly log: (line: string) => void;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;

  constructor(opts: ClientOptions) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.log = opts.log ?? (() => {});
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 0;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  async request<T>(opts: RequestOptions): Promise<T> {
    const method = opts.method ?? "GET";
    const url = this.buildUrl(opts.path, opts.query);
    const idempotencyKey =
      method !== "GET" && (opts.idempotent ?? method === "POST")
        ? opts.idempotencyKey ?? randomUUID()
        : undefined;

    let waitedMs = 0;
    let attempt = 0;

    while (true) {
      attempt++;
      const start = Date.now();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      };
      if (opts.formData === undefined && opts.body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

      const requestBody: BodyInit | undefined = opts.formData
        ? opts.formData
        : opts.body === undefined
          ? undefined
          : JSON.stringify(opts.body);

      let res: Response;
      const abortController =
        this.requestTimeoutMs > 0 ? new AbortController() : undefined;
      const abortTimer = abortController
        ? setTimeout(() => abortController.abort(), this.requestTimeoutMs)
        : undefined;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers,
          body: requestBody,
          ...(abortController ? { signal: abortController.signal } : {}),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const timedOut = abortController?.signal.aborted === true;
        this.log(
          `[gl-importer] ${method} ${opts.path} → ${timedOut ? "TIMEOUT" : "NETWORK_ERROR"} (${msg})`,
        );
        throw new ApiError({
          code: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
          httpStatus: 0,
          message: timedOut
            ? `Request exceeded ${this.requestTimeoutMs}ms timeout`
            : msg,
          hint: timedOut
            ? "Increase IMPORTER_REQUEST_TIMEOUT_MS or check importer.synder.com."
            : "Check connectivity to importer.synder.com.",
        });
      } finally {
        if (abortTimer) clearTimeout(abortTimer);
      }

      const ms = Date.now() - start;
      this.log(`[gl-importer] ${method} ${opts.path} → ${res.status} (${ms}ms)`);

      if (res.status === 429 && attempt < this.maxRetries) {
        const retryAfter = res.headers.get("retry-after");
        const backoff = retryAfter
          ? Math.max(0, Number(retryAfter) * 1000)
          : RATE_LIMIT_INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        if (waitedMs + backoff > RATE_LIMIT_TOTAL_CAP_MS) {
          break;
        }
        this.log(
          `[gl-importer] ${method} ${opts.path} → 429 (retry ${attempt}/${this.maxRetries}, waiting ${backoff}ms)`,
        );
        await sleep(backoff);
        waitedMs += backoff;
        continue;
      }

      if (res.status === 204) return undefined as T;

      const text = await res.text();
      const json = text.length === 0 ? undefined : safeJson(text);

      if (!res.ok) {
        const msg = extractMessage(json) ?? (text || res.statusText);
        throw buildApiError(res.status, msg, json);
      }

      return json as T;
    }

    throw buildApiError(
      429,
      `Rate-limited after ${this.maxRetries} attempts (cap ${RATE_LIMIT_TOTAL_CAP_MS / 1000}s).`,
    );
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(this.baseUrl + (path.startsWith("/") ? path : `/${path}`));
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(body: unknown): string | undefined {
  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.message === "string") return b.message;
    if (typeof b.error === "string") return b.error;
    if (typeof b.detail === "string") return b.detail;
    if (Array.isArray(b.errors) && b.errors.length > 0) {
      return b.errors.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join("; ");
    }
  }
  return undefined;
}
