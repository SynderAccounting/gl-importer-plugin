import type { ToolDefinition } from "./types.js";

const MAPPING_FIELD_SHAPE = {
  type: "object",
  properties: {
    targetFieldId: { type: "string", description: "Importer field id." },
    sourceFieldTitle: { type: "string", description: "CSV column the field reads from." },
    fixedValue: { description: "Constant applied to every row, if not mapped from a column." },
  },
  required: ["targetFieldId"],
  additionalProperties: true,
} as const;

const MAPPING_OUTPUT_SHAPE = {
  type: "object",
  properties: {
    id: { type: "string", description: "Mapping id." },
    title: { type: "string", description: "Mapping name." },
    entityName: { type: "string", description: "Entity this mapping targets." },
    fields: { type: "array", description: "Persisted field entries.", items: MAPPING_FIELD_SHAPE },
    createdAt: { type: "string", description: "ISO timestamp." },
    updatedAt: { type: "string", description: "ISO timestamp." },
  },
  required: ["id", "title", "entityName", "fields"],
  additionalProperties: true,
} as const;

export const mappingsList: ToolDefinition = {
  name: "list_mappings",
  description:
    "Lists field mappings saved for a company. Each mapping is reusable across imports of the same entity type.",
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
      mappings: { type: "array", description: "Saved field mappings.", items: MAPPING_OUTPUT_SHAPE },
    },
    additionalProperties: true,
  },
  annotations: {
    title: "List saved field mappings",
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
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
      description: "Importer field id from get_fields for the target entity.",
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
  name: "create_mapping",
  description:
    "Creates a new field mapping for an entity (e.g. 'Journal Entry', 'Bill', 'Invoice'). Look up valid target fields with get_fields first. Returns the created mapping including its id.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from list_companies." },
      title: { type: "string", description: "Human-readable mapping name." },
      entityName: {
        type: "string",
        description: "Entity this mapping targets — must match list_entities output (e.g. 'Journal Entry').",
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
  outputSchema: MAPPING_OUTPUT_SHAPE,
  annotations: {
    title: "Create field mapping",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
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
  name: "update_mapping",
  description:
    "Replaces an existing mapping in full. Fetch the current mapping with list_mappings first and send the whole desired shape — this is a PUT, not a patch. Returns the updated mapping.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from list_companies." },
      mappingId: { type: "string", description: "Mapping id from list_mappings." },
      title: { type: "string", description: "Human-readable mapping name." },
      entityName: {
        type: "string",
        description: "Entity this mapping targets — must match list_entities output.",
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
  outputSchema: MAPPING_OUTPUT_SHAPE,
  annotations: {
    title: "Replace existing mapping",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
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
  name: "delete_mapping",
  description:
    "Deletes a saved mapping. Irreversible. Imports that referenced this mapping keep their historical record but new imports can no longer pick it.",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Company id from list_companies." },
      mappingId: { type: "string", description: "Mapping id from list_mappings." },
    },
    required: ["companyId", "mappingId"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      deleted: { type: "boolean", description: "True if the mapping was deleted." },
      mappingId: { type: "string", description: "Id of the deleted mapping." },
    },
    required: ["deleted", "mappingId"],
    additionalProperties: false,
  },
  annotations: {
    title: "Delete saved mapping",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
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
