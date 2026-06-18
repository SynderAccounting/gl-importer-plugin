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
