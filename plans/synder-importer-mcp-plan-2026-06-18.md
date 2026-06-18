# Synder Importer MCP Server + Claude Code Plugin — Plan

**Date:** 2026-06-18
**Author:** Vasily (Synder dev agent), brief from Michael
**Status:** Planning + scaffold complete; implementation pending.

---

## 1. Goal

Ship a Claude Code plugin called `synder-importer` that:

1. Bundles an **MCP server** wrapping the public Synder Importer REST API (`https://importer.synder.com/api/v1`).
2. Bundles the existing **agent skills** (`synder-importer`, `gl-importer`) so the LLM gets both natural-language guidance *and* deterministic tool calls.
3. Is distributable via the **Claude Code community marketplace** (`claude-plugins-community`) and `npm`.

End state: a developer using Claude Code installs `synder-importer` from the marketplace, exports `IMPORTER_API_TOKEN`, and can say "import `invoices.csv` into my QuickBooks company" — Claude auto-discovers the company, auto-maps fields, runs the import, polls for completion, and reports results.

## 2. Locked premises (Michael, 2026-06-18)

| # | Decision | Rationale |
|---|---|---|
| 1 | New local repo at `~/Documents/projects/synder-importer-plugin/` → eventually `SynderAccounting/synder-importer-plugin` on GitHub | Separate lifecycle from the b-imports Grails monolith; npm-publishable; cleaner marketplace listing. |
| 2 | MCP over **stdio**, distributed as **npm package** | Zero hosted infra; users invoke via `npx`. Standard Claude plugin pattern. |
| 3 | **ONE plugin** bundling both skills (`synder-importer` + `gl-importer`) + MCP server | Both skills wrap the same API; namespacing under one plugin (`synder-importer:synder-importer`, `synder-importer:gl-importer`) keeps discovery flexible. |
| 4 | **TypeScript** + `@modelcontextprotocol/sdk`, Node 18+, `tsc` to `dist/` | Canonical MCP SDK. Long-term maintainability. |
| 5 | **Full write from day 0** — no read-only mode, no confirm gates, no destructive-op flags | Customer's `IMPORTER_API_TOKEN` scope is the trust boundary. Trust the model. |
| 6 | **Public from day 0** | Listed in `claude-plugins-community` once approved. |
| 7 | `IMPORTER_API_TOKEN` env var, no OAuth | Matches existing skill auth flow. |

## 3. Repo layout

```
synder-importer-plugin/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── .mcp.json                    # MCP server registration
├── package.json                 # npm metadata; "bin": "dist/index.js"
├── tsconfig.json
├── .gitignore                   # node_modules, dist, .env
├── README.md                    # Install + usage
├── LICENSE                      # MIT (Synder default)
├── src/
│   ├── index.ts                 # MCP server entry; stdio transport
│   ├── client.ts                # HTTPS client w/ retry, idempotency, rate-limit handling
│   ├── tools/                   # One file per tool group
│   │   ├── account.ts
│   │   ├── companies.ts
│   │   ├── entities.ts
│   │   ├── mappings.ts
│   │   ├── imports.ts
│   │   └── composites.ts        # auto-import + wait helpers
│   ├── schema.ts                # zod schemas for tool inputs
│   └── errors.ts                # Maps REST error codes → MCP error responses
├── skills/
│   ├── synder-importer/
│   │   ├── SKILL.md             # copied from b-imports
│   │   └── references/
│   │       └── api.md
│   └── gl-importer/
│       ├── SKILL.md
│       └── references/
│           └── api.md
├── test/
│   ├── unit/                    # vitest, mocked HTTP
│   └── integration/             # nock recordings + opt-in live tests
├── plans/
│   └── synder-importer-mcp-plan-2026-06-18.md  ← this file
└── dist/                        # gitignored, built via npm prepublishOnly
```

## 4. Plugin manifest — `.claude-plugin/plugin.json`

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin.json",
  "name": "synder-importer",
  "description": "Import CSV/XLSX accounting data into QuickBooks Online or Xero via the Synder Importer API. Bundles MCP server + agent skills.",
  "version": "0.1.0",
  "author": {
    "name": "Synder",
    "email": "support@synder.com"
  },
  "homepage": "https://importer.synder.com",
  "repository": "https://github.com/SynderAccounting/synder-importer-plugin",
  "license": "MIT",
  "keywords": ["synder", "importer", "quickbooks", "xero", "accounting", "csv", "mcp"]
}
```

## 5. MCP server registration — `.mcp.json`

```json
{
  "mcpServers": {
    "synder-importer": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/index.js"],
      "env": {
        "IMPORTER_BASE_URL": "https://importer.synder.com/api/v1"
      }
    }
  }
}
```

Notes:
- `IMPORTER_API_TOKEN` is **not** in `env` — passed from the user's shell env (Claude Code forwards user env to MCP children).
- `IMPORTER_BASE_URL` defaults to prod but is overridable via the user's env for staging/test.
- Using `node` + `dist/index.js` (not `npx @synder/...`) means the plugin self-installs its server via `npm install` during plugin install. Marketplace `npm` source type handles this.

## 6. Tool taxonomy

**17 low-level tools** (1:1 with REST endpoints) **+ 2 composite tools** (happy-path workflows).

### Low-level (REST mirror)

| Tool | REST | Purpose |
|---|---|---|
| `account_get` | GET /account | Current account info |
| `companies_list` | GET /companies | All connected companies |
| `company_settings_get` | GET /companies/{cid}/settings | Date format, etc. |
| `company_settings_update` | POST /companies/{cid}/settings | Change date format |
| `entities_list` | GET /companies/{cid}/entities | Importable entity types |
| `entity_fields_get` | GET /companies/{cid}/entities/{entity}/fields | Field schema for an entity |
| `mapping_create` | POST /companies/{cid}/mappings | New field mapping |
| `mappings_list` | GET /companies/{cid}/mappings | List mappings |
| `mapping_update` | PUT /companies/{cid}/mappings/{mid} | Edit mapping |
| `mapping_delete` | DELETE /companies/{cid}/mappings/{mid} | Remove mapping |
| `import_execute` | POST /companies/{cid}/imports | Upload + map + import |
| `import_auto` | POST /companies/{cid}/imports/auto | Smart auto-map + (optional) import |
| `imports_list` | GET /companies/{cid}/imports | Recent imports |
| `import_status` | GET /companies/{cid}/imports/{iid} | Single import status |
| `import_cancel` | POST /companies/{cid}/imports/{iid}/cancel | Cancel scheduled/running |
| `import_revert` | POST /companies/{cid}/imports/{iid}/revert | Undo finished import |
| `import_results` | GET /companies/{cid}/imports/{iid}/results | Per-row results (filterable) |

### Composite (happy-path)

| Tool | Composition |
|---|---|
| `import_wait` | Polls `import_status` with exp backoff (2s → 1.5x → cap 30s, default timeout 600s). Returns terminal status + `import_results` summary (counts of INFO/WARNING/ERROR). |
| `import_csv_smart` | `companies_list` → pick ACTIVE → `import_auto(dryRun=true)` → if `missingRequired.length == 0` → `import_auto(dryRun=false)` → `import_wait`. One call, full pipeline. Returns `{importId, status, summary, missingRequired?}`. |

Composites are convenience wrappers; the LLM can always fall back to low-level tools for control.

### File upload mechanics

Tools that accept a file (`import_execute`, `import_auto`, `import_csv_smart`) take a **`filePath: string`** argument — absolute or relative path on the user's machine. The MCP server runs locally (stdio) so it has FS access. The client reads the file, builds the multipart form, posts to the API. No base64 round-trip; no size duplication in tool arg JSON.

### Error surface

Every tool error returns an MCP `isError: true` with structured content:

```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "VALIDATION_ERROR (422): Map all required fields. Missing: [DocNumber, TxnDate]. Call entity_fields_get to see schema."
  }]
}
```

This pattern: `{code} ({httpStatus}): {message}. {hint for next step}`. Hints come from the existing skill doc's error table — the LLM already knows what to do.

`RATE_LIMITED` triggers automatic in-server retry (respecting `Retry-After`) up to 3 attempts. If still rate-limited, surfaces to the LLM.

## 7. Implementation sequence (PRs)

1. **PR 0 — scaffold** (this commit). Manifest, package.json, tsconfig, src/index.ts stub registering zero tools, skills copied verbatim from b-imports. `npm run build` passes. `claude --plugin-dir .` loads without error.
2. **PR 1 — HTTP client + auth.** `src/client.ts` with bearer auth, base URL, idempotency-key on writes, rate-limit retry, error mapping. Unit tested with nock.
3. **PR 2 — read-only tools.** `account_get`, `companies_list`, `company_settings_get`, `entities_list`, `entity_fields_get`, `mappings_list`, `imports_list`, `import_status`, `import_results`. Vertical slice — proves end-to-end. Manual QA: `claude --plugin-dir . "list my Synder companies"`.
4. **PR 3 — mapping CRUD.** `mapping_create`, `mapping_update`, `mapping_delete`, `company_settings_update`.
5. **PR 4 — import execution.** `import_execute`, `import_auto`, `import_cancel`, `import_revert`. File-upload helper.
6. **PR 5 — composites.** `import_wait`, `import_csv_smart`.
7. **PR 6 — release prep.** README with install + usage, LICENSE, GitHub Actions for `npm publish` on tag, `claude plugin validate` in CI.
8. **PR 7 — submit to community marketplace.** Create marketplace.json in a separate `synder-marketplace` repo (or use direct submission form). Wait for review.

Estimate: 1-2 working sessions per PR. Total ~2 weeks calendar to ship v0.1.0 publicly.

## 8. Versioning & release

- **npm SemVer:** `0.1.0` initial, bump per PR group. `0.x` = pre-stable, breaking changes OK with minor bump.
- **Plugin version:** mirrors npm version (`plugin.json.version` synced via `npm version` hook).
- **Marketplace pinning:** community marketplace pins commit SHA; updates land via Anthropic's nightly catalog sync.
- **No `version` field strategy not used** — explicit semver from day 0 to give users update predictability.

## 9. Test strategy

- **Unit (vitest + nock):** every tool's happy path + each documented error code (UNAUTHORIZED, NOT_FOUND, VALIDATION_ERROR, RATE_LIMITED, etc.). Target 80% line coverage.
- **Integration (opt-in, env-gated):** real API calls against a Synder test account; gated by `IMPORTER_TEST_TOKEN` env var. Runs in CI on `main` only, not on PRs from forks.
- **MCP protocol test:** spawn the server as subprocess, send `tools/list` + `tools/call` over stdio, assert response shapes match SDK expectations.
- **Plugin validation:** `claude plugin validate` in CI pre-publish (mandatory for marketplace submission).

## 10. Marketplace submission checklist

- [ ] `package.json`, `plugin.json`, `.mcp.json` all valid
- [ ] `claude plugin validate` passes
- [ ] README has: install command, env var requirements, 3+ usage examples, support email
- [ ] LICENSE present (MIT)
- [ ] CI passes on Node 18 + 20 + 22
- [ ] `npm publish --dry-run` clean (no junk in tarball — check `files` field)
- [ ] Tagged release on GitHub
- [ ] Submitted via https://platform.claude.com/plugins/submit (Console form — Synder isn't a Team/Enterprise Anthropic org)
- [ ] PR opened in `anthropics/claude-plugins-community` (catalog auto-syncs)

## 11. Open questions / risks for Michael

1. **npm scope.** `@synder/importer-mcp` requires the `@synder` scope on npmjs.com. Do we own it? If not, what's our fallback — `@synderaccounting/importer-mcp` (matches GitHub org) or unscoped `synder-importer-mcp`? **Decision needed before PR 6 (release prep).**
2. **Test account.** Need a Synder Importer test account with `IMPORTER_TEST_TOKEN` for integration tests. Who provisions it? Sandbox QBO connection required.
3. **License.** MIT assumed (standard for SDKs); confirm with legal — could matter if anyone files an issue requesting Apache-2.0 patent grant.
4. **Two skills, one plugin.** `synder-importer` and `gl-importer` SKILL.md files are 95% identical (same API, slightly different framing). Ship both? Or pick one as canonical and drop the other? Cost of both is ~6KB; benefit is dual discoverability. Recommend ship both.
5. **Composite tools — too magical?** `import_csv_smart` hides a lot. If it fails mid-pipeline, error attribution gets murky. Mitigation: return progress markers (`stage: "company_lookup" | "auto_map" | "import" | "polling"`) so the LLM can narrate.
6. **Long imports >10min.** Default `import_wait` timeout is 600s. Real-world imports of 10K+ row CSVs can run longer. Should `import_wait` return early with `{status: "POLLING", importId, lastSeen}` and let the LLM re-call? **Yes — implement as default behavior.**
7. **Idempotency keys.** Server-generated UUID per `import_execute` call. Means re-running the same MCP tool call creates a new import. If we want true idempotency from the LLM's POV, expose `idempotencyKey?: string` arg.
8. **Marketplace co-hosting.** Plugin lives in `synder-importer-plugin` repo. Does the marketplace.json live there too (single-plugin marketplace) or in a separate `synder-marketplace` for future multi-plugin growth? Recommend single-plugin marketplace co-located for v0.1; split if/when we ship a second plugin.

## 12. Next session

```
Session goal: implement PR 1 (HTTP client + auth) and PR 2 (read-only tools — account_get, companies_list, entities_list, entity_fields_get, mappings_list, imports_list, import_status, import_results).
Repo: ~/Documents/projects/synder-importer-plugin/
Branch: feat/http-client-and-read-tools
Done definition:
  - npm test passes
  - claude --plugin-dir . "list my Synder companies" works end-to-end against prod with real IMPORTER_API_TOKEN
  - PR opened against main
```
