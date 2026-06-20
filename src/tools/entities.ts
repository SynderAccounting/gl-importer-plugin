import type { ToolDefinition } from "./types.js";

export const entitiesList: ToolDefinition = {
  name: "list_entities",
  description:
    "Lists importable entity types for a company (Invoice, Bill, JournalEntry, Customer, Vendor, etc.). Use the returned 'name' as entityName for get_fields and import tools.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from list_companies." },
    },
    required: ["companyId"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      entities: {
        type: "array",
        description: "Importable entity types for this company.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Entity name (use as entityName downstream)." },
            displayName: { type: "string", description: "Human-readable entity name." },
          },
          required: ["name"],
          additionalProperties: true,
        },
      },
    },
    additionalProperties: true,
  },
  annotations: {
    title: "List importable entity types",
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    return client.request({ path: `/companies/${encodeURIComponent(companyId)}/entities` });
  },
};

export const fieldsGet: ToolDefinition = {
  name: "get_fields",
  description:
    "Returns the field schema for an entity in a company: every field with its type, required flag, alternativeTitles, and predefinedValues. Use to build or verify a mapping before running an import.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from list_companies." },
      entityName: {
        type: "string",
        description: "Entity name from list_entities (e.g., 'Invoice', 'Bill').",
      },
    },
    required: ["companyId", "entityName"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      fields: {
        type: "array",
        description: "Field schema entries for the entity.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Field id — pass as targetFieldId in create_mapping/update." },
            name: { type: "string", description: "Human-readable field name." },
            type: { type: "string", description: "Field type (string, number, date, reference, etc.)." },
            required: { type: "boolean", description: "Whether the field must be supplied per row." },
            alternativeTitles: {
              type: "array",
              items: { type: "string" },
              description: "Aliases the auto-mapper recognizes for this field.",
            },
            predefinedValues: {
              type: "array",
              items: { type: "string" },
              description: "Closed-vocabulary values, if any.",
            },
          },
          required: ["id", "name", "type"],
          additionalProperties: true,
        },
      },
    },
    additionalProperties: true,
  },
  annotations: {
    title: "Get entity field schema",
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    const entityName = String(input.entityName);
    return client.request({
      path: `/companies/${encodeURIComponent(companyId)}/entities/${encodeURIComponent(entityName)}/fields`,
    });
  },
};
