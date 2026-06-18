import type { ToolDefinition } from "./types.js";

export const entitiesList: ToolDefinition = {
  name: "entities_list",
  description:
    "Lists importable entity types for a company (Invoice, Bill, JournalEntry, Customer, Vendor, etc.). Use the returned 'name' as entityName for fields_get and import tools.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
    },
    required: ["companyId"],
    additionalProperties: false,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    return client.request({ path: `/companies/${encodeURIComponent(companyId)}/entities` });
  },
};

export const fieldsGet: ToolDefinition = {
  name: "fields_get",
  description:
    "Returns the field schema for an entity in a company: every field with its type, required flag, alternativeTitles, and predefinedValues. Use to build or verify a mapping before running an import.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
      entityName: {
        type: "string",
        description: "Entity name from entities_list (e.g., 'Invoice', 'Bill').",
      },
    },
    required: ["companyId", "entityName"],
    additionalProperties: false,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    const entityName = String(input.entityName);
    return client.request({
      path: `/companies/${encodeURIComponent(companyId)}/entities/${encodeURIComponent(entityName)}/fields`,
    });
  },
};
