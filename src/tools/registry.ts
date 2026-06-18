import type { ToolDefinition } from "./types.js";
import { accountGet } from "./account.js";
import { companiesList, settingsGet, settingsUpdate } from "./companies.js";
import { entitiesList, fieldsGet } from "./entities.js";
import { mappingsList, mappingCreate, mappingUpdate, mappingDelete } from "./mappings.js";
import { importsList, importStatus, importResults } from "./imports.js";

export const TOOLS: ToolDefinition[] = [
  accountGet,
  companiesList,
  settingsGet,
  settingsUpdate,
  entitiesList,
  fieldsGet,
  mappingsList,
  mappingCreate,
  mappingUpdate,
  mappingDelete,
  importsList,
  importStatus,
  importResults,
];

export function findTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}
