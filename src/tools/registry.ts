import type { ToolDefinition } from "./types.js";
import { accountGet } from "./account.js";
import { companiesList, settingsGet } from "./companies.js";
import { entitiesList, fieldsGet } from "./entities.js";
import { mappingsList } from "./mappings.js";
import { importsList, importStatus, importResults } from "./imports.js";

export const TOOLS: ToolDefinition[] = [
  accountGet,
  companiesList,
  settingsGet,
  entitiesList,
  fieldsGet,
  mappingsList,
  importsList,
  importStatus,
  importResults,
];

export function findTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}
