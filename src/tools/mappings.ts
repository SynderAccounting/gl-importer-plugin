import type { ToolDefinition } from "./types.js";

export const mappingsList: ToolDefinition = {
  name: "mappings_list",
  description:
    "Lists field mappings saved for a company. Each mapping is reusable across imports of the same entity type.",
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
    return client.request({ path: `/companies/${encodeURIComponent(companyId)}/mappings` });
  },
};

const FIELD_SCHEMA = {
  type: "object",
  description:
    "One mapped field. Either map a CSV column via 'sourceFieldTitle' or pin a constant via 'fixedValue' — not both.",
  properties: {
    targetFieldId: {
      type: "string",
      description: "Importer field id from fields_get for the target entity.",
    },
    sourceFieldTitle: {
      type: "string",
      description: "CSV column header to read from.",
    },
    fixedValue: {
      description: "Constant value applied to every row (string, number, or boolean).",
    },
  },
  required: ["targetFieldId"],
  additionalProperties: true,
} as const;

export const mappingCreate: ToolDefinition = {
  name: "mapping_create",
  description:
    "Creates a new field mapping for an entity (e.g. 'Journal Entry', 'Bill', 'Invoice'). Look up valid target fields with fields_get first. Returns the created mapping including its id.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
      title: { type: "string", description: "Human-readable mapping name." },
      entityName: {
        type: "string",
        description: "Entity this mapping targets — must match entities_list output (e.g. 'Journal Entry').",
      },
      fields: {
        type: "array",
        description: "Field mappings. Each entry maps a CSV column or a constant to an Importer target field.",
        items: FIELD_SCHEMA,
      },
    },
    required: ["companyId", "title", "entityName", "fields"],
    additionalProperties: false,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    return client.request({
      method: "POST",
      path: `/companies/${encodeURIComponent(companyId)}/mappings`,
      body: {
        title: input.title,
        entityName: input.entityName,
        fields: input.fields,
      },
    });
  },
};

export const mappingUpdate: ToolDefinition = {
  name: "mapping_update",
  description:
    "Replaces an existing mapping in full. Fetch the current mapping with mappings_list first and send the whole desired shape — this is a PUT, not a patch. Returns the updated mapping.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
      mappingId: { type: "string", description: "Mapping id from mappings_list." },
      title: { type: "string", description: "Human-readable mapping name." },
      entityName: {
        type: "string",
        description: "Entity this mapping targets — must match entities_list output.",
      },
      fields: {
        type: "array",
        description: "Field mappings (full replacement).",
        items: FIELD_SCHEMA,
      },
    },
    required: ["companyId", "mappingId", "title", "entityName", "fields"],
    additionalProperties: false,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    const mappingId = String(input.mappingId);
    return client.request({
      method: "PUT",
      path: `/companies/${encodeURIComponent(companyId)}/mappings/${encodeURIComponent(mappingId)}`,
      body: {
        title: input.title,
        entityName: input.entityName,
        fields: input.fields,
      },
    });
  },
};

export const mappingDelete: ToolDefinition = {
  name: "mapping_delete",
  description:
    "Deletes a saved mapping. Irreversible. Imports that referenced this mapping keep their historical record but new imports can no longer pick it.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from companies_list." },
      mappingId: { type: "string", description: "Mapping id from mappings_list." },
    },
    required: ["companyId", "mappingId"],
    additionalProperties: false,
  },
  handler: async (input, { client }) => {
    const companyId = String(input.companyId);
    const mappingId = String(input.mappingId);
    await client.request({
      method: "DELETE",
      path: `/companies/${encodeURIComponent(companyId)}/mappings/${encodeURIComponent(mappingId)}`,
    });
    return { deleted: true, mappingId };
  },
};
