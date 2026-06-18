<!-- /autoplan restore point: /Users/vasiliy/.gstack/projects/synder-importer-plugin/main-autoplan-restore-2026-06-18T15-50-48Z.md -->

# Synder Importer MCP Server + Claude Code Plugin — Plan

**Date:** 2026-06-18
**Author:** Vasily (Synder dev agent), brief from Michael
**Status:** Planning + scaffold complete; /autoplan review done (CEO+Eng+DX); implementation pending.

---

## 1. Goal

Ship a Claude Code plugin called `gl-importer` that:

1. Bundles an **MCP server** wrapping the public Synder Importer REST API (`https://importer.synder.com/api/v1`).
2. Bundles the existing **agent skill** `gl-importer` so the LLM gets both natural-language guidance *and* deterministic tool calls.
3. Is distributable via the **Claude Code community marketplace** (`claude-plugins-community`) and `npm`.

End state: a developer using Claude Code installs `gl-importer` from the marketplace, exports `IMPORTER_API_TOKEN`, and can say "import `invoices.csv` into my QuickBooks company" — Claude auto-discovers the company, auto-maps fields, runs the import, polls for completion, and reports results.

## 2. Locked premises (Michael, 2026-06-18)

| # | Decision | Rationale |
|---|---|---|
| 1 | New local repo at `~/Documents/projects/gl-importer-plugin/` → eventually `SynderAccounting/gl-importer-plugin` on GitHub | Separate lifecycle from the b-imports Grails monolith; npm-publishable; cleaner marketplace listing. |
| 2 | MCP over **stdio**, distributed as **npm package** | Zero hosted infra; users invoke via `npx`. Standard Claude plugin pattern. |
| 3 | **ONE plugin** with a single skill (`gl-importer`) + MCP server | synder-importer was 95% duplicate of gl-importer (same API, same endpoints). Michael picked `gl-importer` as canonical 2026-06-18. One skill = less context for the LLM, simpler maintenance. |
| 4 | **TypeScript** + `@modelcontextprotocol/sdk`, Node 18+, `tsc` to `dist/` | Canonical MCP SDK. Long-term maintainability. |
| 5 | **Full write from day 0** — no read-only mode, no confirm gates, no destructive-op flags | Customer's `IMPORTER_API_TOKEN` scope is the trust boundary. Trust the model. |
| 6 | **Public from day 0** | Listed in `claude-plugins-community` once approved. |
| 7 | `IMPORTER_API_TOKEN` env var, no OAuth | Matches existing skill auth flow. |

## 3. Repo layout

```
gl-importer-plugin/
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
│   └── gl-importer/
│       ├── SKILL.md             # from b-imports gl-importer (synder-importer dropped — 95% duplicate)
│       └── references/
│           └── api.md
├── test/
│   ├── unit/                    # vitest, mocked HTTP
│   └── integration/             # nock recordings + opt-in live tests
├── plans/
│   └── gl-importer-mcp-plan-2026-06-18.md  ← this file
└── dist/                        # gitignored, built via npm prepublishOnly
```

## 4. Plugin manifest — `.claude-plugin/plugin.json`

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin.json",
  "name": "gl-importer",
  "description": "Import CSV/XLSX accounting data into QuickBooks Online or Xero via the Synder Importer API. Bundles MCP server + agent skill.",
  "version": "0.1.0",
  "author": {
    "name": "Synder",
    "email": "support@synder.com"
  },
  "homepage": "https://importer.synder.com",
  "repository": "https://github.com/SynderAccounting/gl-importer-plugin",
  "license": "MIT",
  "keywords": ["synder", "importer", "quickbooks", "xero", "accounting", "csv", "mcp"]
}
```

## 5. MCP server registration — `.mcp.json`

```json
{
  "mcpServers": {
    "gl-importer": {
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
| `settings_get` | GET /companies/{cid}/settings | Date format, etc. |
| `settings_update` | POST /companies/{cid}/settings | Change date format |
| `entities_list` | GET /companies/{cid}/entities | Importable entity types |
| `fields_get` | GET /companies/{cid}/entities/{entity}/fields | Field schema for an entity |
| `mapping_create` | POST /companies/{cid}/mappings | New field mapping |
| `mappings_list` | GET /companies/{cid}/mappings | List mappings |
| `mapping_update` | PUT /companies/{cid}/mappings/{mid} | Edit mapping |
| `mapping_delete` | DELETE /companies/{cid}/mappings/{mid} | Remove mapping |
| `import_execute` | POST /companies/{cid}/imports | Upload + map + import |
| `import_auto` | POST /companies/{cid}/imports/auto | Auto-map + (optional) import |
| `imports_list` | GET /companies/{cid}/imports | Recent imports |
| `import_status` | GET /companies/{cid}/imports/{iid} | Single import status |
| `import_cancel` | POST /companies/{cid}/imports/{iid}/cancel | Cancel scheduled/running |
| `import_revert` | POST /companies/{cid}/imports/{iid}/revert | Undo finished import |
| `import_results` | GET /companies/{cid}/imports/{iid}/results | Per-row results (filterable) |

Tool names shortened from `company_settings_get` → `settings_get` and `entity_fields_get` → `fields_get` — the company context is already scoped by `companyId` arg, and MCP namespaces tools by server (`gl-importer.settings_get`) which is already long.

### Composite (happy-path)

| Tool | Composition |
|---|---|
| `import_wait` | Polls `import_status` with exp backoff (2s → 1.5x → cap 30s). Accepts `timeoutSeconds?: number` (default 600). Returns terminal status + `import_results` summary (counts of INFO/WARNING/ERROR). At timeout returns `{status: "POLLING", importId, lastSeen}` so LLM can re-call — never blocks indefinitely. |
| `import_csv` | `companies_list` → pick ACTIVE → `import_auto(dryRun=true)` → returns proposed mapping + `missingRequired` for LLM to present to user → if LLM re-calls with `confirmed: true` → `import_auto(dryRun=false)` → `import_wait`. Two calls minimum (dry-run + confirm), full pipeline. Returns `{importId, status, summary, missingRequired?, proposedMapping?}`. |

Composites are convenience wrappers; the LLM can always fall back to low-level tools for control.

Renamed `import_csv_smart` → `import_csv` — "smart" is marketing, not descriptive. The description already conveys the auto-mapping behavior.

`import_csv` returns the dry-run mapping before importing, giving the LLM a natural place to ask the user "Does this mapping look right?" before proceeding. This isn't a confirm gate — it's a tool that returns data and the LLM decides what to do with it.

### File upload mechanics

Tools that accept a file (`import_execute`, `import_auto`, `import_csv`) take a **`filePath: string`** argument — absolute or relative path on the user's machine. The MCP server runs locally (stdio) so it has FS access. The client reads the file, builds the multipart form, posts to the API. No base64 round-trip; no size duplication in tool arg JSON.

**Client-side validation before upload:** check file extension (`.csv`, `.xlsx`, `.xls` only) and size (max 50MB). Reject with a clear error message before hitting the network.

### Error surface

Every tool error returns an MCP `isError: true` with structured content:

```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "VALIDATION_ERROR (422): Map all required fields. Missing: [DocNumber, TxnDate]. Call fields_get to see schema."
  }]
}
```

This pattern: `{code} ({httpStatus}): {message}. {hint for next step}`. Hints come from the existing skill doc's error table — the LLM already knows what to do.

**HTTP → error code mapping:**

| HTTP | Code | Notes |
|---|---|---|
| 400 | VALIDATION_ERROR | Bad request body |
| 401 | UNAUTHORIZED | Missing/expired token |
| 403 | FORBIDDEN | Token lacks scope |
| 404 | NOT_FOUND | Company/import/mapping not found |
| 409 | CONFLICT | Concurrent modification |
| 422 | VALIDATION_ERROR | Semantic validation (missing fields, etc.) |
| 429 | RATE_LIMITED | Auto-retried, see below |
| 5xx | SERVER_ERROR | Importer API down |

**Rate-limit retry:** respects `Retry-After` header if present, else exponential backoff starting at 2s. Cap total retry wait at 60s, max 3 attempts. Each retry logged to stderr. If still rate-limited after 3 attempts, surfaces to the LLM.

### Observability

The MCP server logs to **stderr** (stdout is reserved for MCP protocol). Logged on every API call:
- `[gl-importer] GET /companies → 200 (142ms)`
- `[gl-importer] POST /companies/9/imports/auto → 429 (retry 1/3, waiting 2s)`
- `[gl-importer] ERROR: IMPORTER_API_TOKEN not set — all tool calls will fail`

On startup, calls `GET /account` to validate the token. If it fails: logs error to stderr, does NOT crash — but every subsequent tool call returns `UNAUTHORIZED: Set IMPORTER_API_TOKEN env var. Generate at importer.synder.com → Account → API Keys.`

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

No sandbox environment exists for the Importer API — Michael confirmed 2026-06-18 — so live-API integration tests are out. Revised plan:

- **Unit (vitest + nock):** every tool's happy path + each documented error code (`UNAUTHORIZED`, `NOT_FOUND`, `VALIDATION_ERROR`, `DUPLICATE_REQUEST`, `CONFLICT`, `RATE_LIMITED`, etc.). Target 80% line coverage. Runs on every PR in CI.
- **MCP protocol test:** spawn the server as subprocess, send `tools/list` + `tools/call` over stdio, assert response shapes match SDK expectations. Pure protocol-level — no live API.
- **Smoke test = manual dogfood on prod.** Vasily runs `claude --plugin-dir .` against a real Importer account during development. Each PR description includes a "smoke run" entry: which tools were exercised, which company, what was imported (and reverted, if write paths touched).
- **Plugin validation:** `claude plugin validate` in CI pre-publish — mandatory for marketplace submission.
- **No CI integration tests against the live API.** Submitting `IMPORTER_API_TOKEN` to GitHub Actions and creating real entities in QBO/Xero on every PR is not acceptable risk.

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

## 11. Resolved decisions (Michael, 2026-06-18 follow-up)

- **npm scope.** Synder owns nothing on npmjs.com yet. Action items for Michael:
  1. Create npm org (free tier, public). Try names in order: `synder` → `synderaccounting` → `synder-io` → `synder-tech`.
  2. Generate an automation token, save as GitHub secret `NPM_TOKEN`.
  3. Add VasilySynderBot (or shared bot account) as Developer.
  4. Create empty GitHub repo `SynderAccounting/gl-importer-plugin`.
  Once scope is registered, update `package.json#name` → `@<scope>/importer-mcp` and `plugin.json#repository`.
- **Test account.** Not happening — no sandbox of prod. Live-API integration tests dropped; replaced with mock-only CI tests + manual dogfood smoke tests. See §9.
- **`import_wait` long-imports.** Confirmed: default 600s timeout, return `{status: "POLLING", importId, lastSeen}` so LLM re-calls.

## 12. Still open

1. **License.** MIT assumed (standard for SDKs); confirm with legal if anyone files an issue requesting Apache-2.0 patent grant.
2. ~~**Two skills, one plugin.**~~ **RESOLVED:** Merged into one skill. synder-importer dropped (95% duplicate of gl-importer); kept `gl-importer` per Michael 2026-06-18.
3. ~~**Composite tools — too magical?**~~ **RESOLVED:** `import_csv` (renamed from `import_csv_smart`) now returns dry-run mapping first, requires re-call with `confirmed: true` to proceed. Natural pause point for user confirmation without being a gate. Progress markers still included (`stage` field).
4. **Idempotency keys.** Server-generated UUID per `import_execute` call. Means re-running the same MCP tool call creates a new import. If we want true idempotency from the LLM's POV, expose `idempotencyKey?: string` arg.
5. **Marketplace co-hosting.** Plugin lives in `gl-importer-plugin` repo. Does the marketplace.json live there too (single-plugin marketplace) or in a separate `synder-marketplace` for future multi-plugin growth? Recommend single-plugin marketplace co-located for v0.1; split if/when we ship a second plugin.

## 13. Launch plan

Plugin in marketplace is necessary but not sufficient for adoption. Three launch activities:

1. **Existing Importer users** — announce to API key holders via in-app banner or email ("You can now import accounting data by talking to Claude Code").
2. **Claude Code community** — post in Claude Code Discord / community forums with a demo GIF showing end-to-end import.
3. **Content** — "How to import accounting data into QuickBooks with Claude Code" blog post on synder.com/blog.

Target: 10 users in first 2 weeks post-marketplace-approval.

## 14. /autoplan review log

Review run 2026-06-18 (inline, CEO + Eng + DX phases, design skipped — no UI scope).

### CEO review — verdict: REVISE (4 items)
- **C1** `import_csv` now returns dry-run before importing → applied to §6
- **C2** synder-importer dropped (Michael picked `gl-importer` as canonical) → applied to §2, §3, §12
- **C3** Launch plan added → new §13
- **C4** Observability (stderr logging + startup token validation) → applied to §6

### Eng review — 6 items
- **E1** Token validation at startup → applied to §6 Observability
- **E2** Rate-limit retry fully specified (Retry-After / 2s backoff / 60s cap / 3 attempts) → applied to §6
- **E3** HTTP→error code mapping table → applied to §6
- **E4** `import_wait` timeout returns POLLING, never blocks → applied to §6
- **E5** vitest coverage config + CI enforcement at 80% lines → add to PR 1 scope
- **E6** File extension + size validation before upload → applied to §6

### DX review — 4 items
- **DX1** Quick-start with time estimates + troubleshooting → add to README in PR 6
- **DX2** Tool names shortened (`settings_get`, `fields_get`) → applied to §6
- **DX3** Example prompts in README → add to PR 6
- **DX4** `import_csv_smart` renamed to `import_csv` → applied to §6

## 15. Next session

```
Session goal: implement PR 1 (HTTP client + auth) and PR 2 (read-only tools — account_get, companies_list, entities_list, entity_fields_get, mappings_list, imports_list, import_status, import_results).
Repo: ~/Documents/projects/gl-importer-plugin/
Branch: feat/http-client-and-read-tools
Done definition:
  - npm test passes
  - claude --plugin-dir . "list my Synder companies" works end-to-end against prod with real IMPORTER_API_TOKEN
  - PR opened against main
```
