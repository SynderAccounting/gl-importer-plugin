import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFileForUpload, buildImportFormData, MAX_FILE_SIZE_BYTES } from "../../src/upload.js";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "gl-importer-upload-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("upload", () => {
  it("loadFileForUpload reads a small CSV and returns bytes + type", async () => {
    const path = join(dir, "data.csv");
    await writeFile(path, "Date,Amount\n2026-01-01,100\n");
    const file = await loadFileForUpload(path);
    expect(file.filename).toBe("data.csv");
    expect(file.contentType).toBe("text/csv");
    expect(file.contents.toString("utf8")).toContain("Date,Amount");
  });

  it("loadFileForUpload maps .xlsx to its Office content type", async () => {
    const path = join(dir, "book.xlsx");
    await writeFile(path, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const file = await loadFileForUpload(path);
    expect(file.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("rejects unsupported extensions with VALIDATION_ERROR", async () => {
    const path = join(dir, "wrong.txt");
    await writeFile(path, "x");
    await expect(loadFileForUpload(path)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      httpStatus: 0,
    });
  });

  it("rejects missing files with VALIDATION_ERROR", async () => {
    await expect(loadFileForUpload(join(dir, "nope.csv"))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects directories", async () => {
    await expect(loadFileForUpload(dir + "/")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("MAX_FILE_SIZE_BYTES is 50MB", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(50 * 1024 * 1024);
  });

  it("buildImportFormData appends file + non-undefined fields, skips undefined", () => {
    const fd = buildImportFormData(
      {
        filename: "x.csv",
        contents: Buffer.from("a,b\n1,2\n"),
        contentType: "text/csv",
      },
      { entityName: "Bill", mappingId: "m1", dryRun: undefined },
    );
    const file = fd.get("file");
    expect(file).toBeInstanceOf(Blob);
    expect((file as File).name).toBe("x.csv");
    expect(fd.get("entityName")).toBe("Bill");
    expect(fd.get("mappingId")).toBe("m1");
    expect(fd.has("dryRun")).toBe(false);
  });
});
