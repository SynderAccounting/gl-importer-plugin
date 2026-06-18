export interface MockResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Optional inspector — gets the URL string and the init opts the client passed. */
  check?: (url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown }) => void;
}

export interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

export class FetchMock {
  readonly responses: MockResponse[] = [];
  readonly calls: FetchCall[] = [];

  enqueue(r: MockResponse): this {
    this.responses.push(r);
    return this;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = normalizeHeaders(init?.headers);
    const body = init?.body;

    this.calls.push({ url, method, headers, body });

    const r = this.responses.shift();
    if (!r) {
      throw new Error(`FetchMock: unexpected request ${method} ${url} (no queued response)`);
    }
    r.check?.(url, { method, headers, body });

    const responseBody =
      r.body === undefined
        ? null
        : typeof r.body === "string"
          ? r.body
          : JSON.stringify(r.body);

    return new Response(responseBody, {
      status: r.status,
      headers: r.headers ?? {},
    });
  };
}

function normalizeHeaders(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const out: Record<string, string> = {};
    h.forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
    return out;
  }
  if (Array.isArray(h)) {
    return Object.fromEntries(h.map(([k, v]) => [k.toLowerCase(), v]));
  }
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v)]));
}
