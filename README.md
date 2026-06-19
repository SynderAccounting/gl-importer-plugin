# gl-importer (Claude Code plugin)

Import CSV/XLSX accounting data into QuickBooks Online or Xero from inside Claude Code,
using the [Synder Importer API](https://importer.synder.com/apidocs).

This plugin bundles:

- An **MCP server** wrapping the Synder Importer REST API (`/api/v1`) — full read + write,
  19 tools covering account, companies, settings, entities, fields, mappings, imports,
  status polling, results, cancel, revert, plus two composite "happy path" tools.
- The `gl-importer` **agent skill** with natural-language guidance for the two-step
  import flow (dry-run → confirm).

## Requirements

- Node.js 18 or newer
- Claude Code with plugin support (`/plugin` command available)
- A Synder Importer API token — set as `IMPORTER_API_TOKEN` in your shell env.
  Generate at [importer.synder.com](https://importer.synder.com) → **Account → API Keys**.

## Install

### From the Claude Code marketplace (recommended)

```
/plugin marketplace add SynderAccounting/gl-importer-plugin
/plugin install gl-importer
```

Then set your token in the shell that launches Claude Code:

```bash
export IMPORTER_API_TOKEN="your_token_here"
```

### From source (development)

```bash
git clone https://github.com/SynderAccounting/gl-importer-plugin
cd gl-importer-plugin
npm install
npm run build
# Point Claude Code at this directory:
claude --plugin-dir .
```

## Configuration

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `IMPORTER_API_TOKEN` | yes | — | Bearer token for the Synder Importer API |
| `IMPORTER_BASE_URL` | no | `https://importer.synder.com/api/v1` | Override for staging/test |

## Example prompts

Once installed, talk to Claude Code naturally:

- *"Import `~/Downloads/march-bills.csv` as Bills into my QuickBooks company."*
- *"What entities can I import into Xero?"*
- *"Show me the saved mapping called 'Stripe payouts' and update it to map Date → TxnDate."*
- *"List my last 10 imports and tell me which ones failed."*
- *"Revert import 12345 — I uploaded the wrong file."*
- *"What's the status of import 12345? Wait for it to finish and tell me how many warnings."*

The skill will walk Claude Code through a safe two-step flow: a **dry-run** that
shows the proposed field mapping, then a **confirmed** call that actually creates
the import and polls until it terminates.

## Tools

The MCP server exposes 19 tools. The ones an LLM will hit most often:

| Tool | Purpose |
|---|---|
| `import_csv` | **Happy path.** Auto-resolves company, uploads file, runs dry-run, then (on confirm) executes + waits. |
| `import_wait` | Polls a running import to a terminal state with exponential backoff (2s → 1.5× → 30s cap). |
| `companies_list` / `entities_list` / `fields_get` | Discover what you can import where. |
| `mappings_list` / `mapping_create` / `mapping_update` / `mapping_delete` | Saved-mapping CRUD. |
| `import_auto` / `import_execute` | Lower-level: create an import with auto-mapping or an explicit mapping. |
| `import_status` / `import_results` / `import_cancel` / `import_revert` | Lifecycle. |
| `settings_get` / `settings_update` | Per-company import settings. |
| `account_get` | Whoami / token check. |

Full schemas are emitted at MCP startup — the agent skill (`skills/gl-importer/SKILL.md`)
also documents the conventions.

## Development

```bash
npm install
npm run build       # tsc → dist/
npm test            # vitest, 60+ unit tests, virtual-clock polling tests
npm run watch       # tsc --watch for iterative dev
```

CI runs on every push and PR (`.github/workflows/ci.yml`).

## Release process

1. Bump `version` in `package.json` and `.claude-plugin/plugin.json` (keep them in sync).
2. Commit and tag: `git tag v0.x.y && git push --tags`.
3. The `publish.yml` workflow publishes to npm on the tag push (uses `NPM_TOKEN` secret).
4. The marketplace install path resolves through this GitHub repo, so the tag is the release.

## License

MIT — see [LICENSE](LICENSE).

## Support

- Issues: https://github.com/SynderAccounting/gl-importer-plugin/issues
- Email: support@synder.com
