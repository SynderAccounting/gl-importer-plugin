import { stat, readFile } from "node:fs/promises";
import { extname, basename } from "node:path";
import { ApiError } from "./errors.js";

export const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls"] as const;
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export interface FileUpload {
  filename: string;
  contents: Buffer;
  contentType: string;
}

export async function loadFileForUpload(filePath: string): Promise<FileUpload> {
  const ext = extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    throw new ApiError({
      code: "VALIDATION_ERROR",
      httpStatus: 0,
      message: `Unsupported file extension '${ext || "(none)"}'. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`,
      hint: "Export the source data as .csv or .xlsx and try again.",
    });
  }

  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(filePath);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new ApiError({
      code: "VALIDATION_ERROR",
      httpStatus: 0,
      message: `Cannot open file '${filePath}': ${msg}`,
      hint: "Pass an absolute path the MCP server process can read.",
    });
  }

  if (!info.isFile()) {
    throw new ApiError({
      code: "VALIDATION_ERROR",
      httpStatus: 0,
      message: `Path is not a regular file: '${filePath}'.`,
    });
  }

  if (info.size > MAX_FILE_SIZE_BYTES) {
    throw new ApiError({
      code: "VALIDATION_ERROR",
      httpStatus: 0,
      message: `File too large: ${info.size} bytes (limit ${MAX_FILE_SIZE_BYTES} bytes / 50MB).`,
      hint: "Split the file into smaller chunks and import each one.",
    });
  }

  const contents = await readFile(filePath);
  return {
    filename: basename(filePath),
    contents,
    contentType: contentTypeForExt(ext),
  };
}

export function buildImportFormData(
  file: FileUpload,
  fields: Record<string, string | number | boolean | undefined>,
): FormData {
  const fd = new FormData();
  const ab = new ArrayBuffer(file.contents.byteLength);
  new Uint8Array(ab).set(file.contents);
  const blob = new Blob([ab], { type: file.contentType });
  fd.append("file", blob, file.filename);
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) fd.append(k, String(v));
  }
  return fd;
}

function contentTypeForExt(ext: string): string {
  if (ext === ".csv") return "text/csv";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === ".xls") return "application/vnd.ms-excel";
  return "application/octet-stream";
}
