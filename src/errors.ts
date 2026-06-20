export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "CLIENT_ERROR";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly hint: string;
  readonly responseBody?: unknown;

  constructor(opts: {
    code: ErrorCode;
    httpStatus: number;
    message: string;
    hint?: string;
    responseBody?: unknown;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.code = opts.code;
    this.httpStatus = opts.httpStatus;
    this.hint = opts.hint ?? "";
    this.responseBody = opts.responseBody;
  }

  toMcpText(): string {
    const tail = this.hint ? ` ${this.hint}` : "";
    return `${this.code} (${this.httpStatus}): ${this.message}.${tail}`;
  }
}

const HINTS: Record<ErrorCode, string> = {
  UNAUTHORIZED:
    "Set IMPORTER_API_TOKEN env var. Generate at importer.synder.com → Account → API Keys.",
  FORBIDDEN:
    "Your token doesn't have access to this resource. Check the company is connected.",
  NOT_FOUND: "Verify the company / import / mapping id exists.",
  VALIDATION_ERROR: "Inspect the missing or invalid fields above and retry.",
  CONFLICT: "The resource changed since you read it. Re-fetch and retry.",
  RATE_LIMITED: "Wait and retry — the server is rate-limiting requests.",
  SERVER_ERROR: "Importer API returned 5xx. Try again in a moment.",
  NETWORK_ERROR:
    "Network failure reaching importer.synder.com. Check connectivity.",
  TIMEOUT:
    "Request exceeded the configured timeout. Increase IMPORTER_REQUEST_TIMEOUT_MS.",
  CLIENT_ERROR: "Unexpected client error. See message above.",
};

export function mapHttpStatus(status: number): ErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 422 || status === 400) return "VALIDATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_ERROR";
  return "CLIENT_ERROR";
}

export function buildApiError(
  status: number,
  message: string,
  body?: unknown,
): ApiError {
  const code = mapHttpStatus(status);
  return new ApiError({
    code,
    httpStatus: status,
    message,
    hint: HINTS[code],
    responseBody: body,
  });
}
