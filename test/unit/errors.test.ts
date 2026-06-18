import { describe, it, expect } from "vitest";
import { ApiError, mapHttpStatus, buildApiError } from "../../src/errors.js";

describe("errors", () => {
  it("maps standard HTTP statuses", () => {
    expect(mapHttpStatus(401)).toBe("UNAUTHORIZED");
    expect(mapHttpStatus(403)).toBe("FORBIDDEN");
    expect(mapHttpStatus(404)).toBe("NOT_FOUND");
    expect(mapHttpStatus(409)).toBe("CONFLICT");
    expect(mapHttpStatus(422)).toBe("VALIDATION_ERROR");
    expect(mapHttpStatus(400)).toBe("VALIDATION_ERROR");
    expect(mapHttpStatus(429)).toBe("RATE_LIMITED");
    expect(mapHttpStatus(500)).toBe("SERVER_ERROR");
    expect(mapHttpStatus(503)).toBe("SERVER_ERROR");
    expect(mapHttpStatus(418)).toBe("CLIENT_ERROR");
  });

  it("buildApiError attaches hint", () => {
    const err = buildApiError(401, "bad token");
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.hint).toContain("IMPORTER_API_TOKEN");
  });

  it("toMcpText formats CODE (HTTP): message. hint", () => {
    const err = new ApiError({
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      message: "missing field",
      hint: "Set it and retry.",
    });
    expect(err.toMcpText()).toBe(
      "VALIDATION_ERROR (422): missing field. Set it and retry.",
    );
  });

  it("toMcpText omits empty hint cleanly", () => {
    const err = new ApiError({
      code: "CLIENT_ERROR",
      httpStatus: 0,
      message: "oops",
    });
    expect(err.toMcpText()).toBe("CLIENT_ERROR (0): oops.");
  });
});
