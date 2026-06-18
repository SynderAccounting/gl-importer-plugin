# gl-importer (Claude Code plugin)

Import CSV/XLSX accounting data into QuickBooks Online or Xero via the
[Synder Importer API](https://importer.synder.com/apidocs).

This plugin bundles:

- An **MCP server** wrapping the Synder Importer REST API (`/api/v1`) — full read + write.
- The `gl-importer` **agent skill** with natural-language guidance.

## Status

**v0.1.0 — scaffold.** Plugin layout, manifest, skill, and a no-op MCP server.
Tool implementation lands in `feat/http-client-and-read-tools` (see
[plans/gl-importer-mcp-plan-2026-06-18.md](plans/gl-importer-mcp-plan-2026-06-18.md)).

## Requirements

- Node.js 18 or newer
- Claude Code with plugin support
- Synder Importer API token — set as `IMPORTER_API_TOKEN` in your shell env.
  Generate at [importer.synder.com](https://importer.synder.com) → Account → API Keys.

## Local install (development)

```bash
git clone https://github.com/SynderAccounting/gl-importer-plugin
cd gl-importer-plugin
npm install
npm run build
claude --plugin-dir .
```

## Marketplace install (once published)

```
/plugin marketplace add SynderAccounting/gl-importer-plugin
/plugin install gl-importer
```

## Configuration

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `IMPORTER_API_TOKEN` | yes | — | Bearer token for the Synder Importer API |
| `IMPORTER_BASE_URL` | no | `https://importer.synder.com/api/v1` | Override for staging/test |

## License

MIT — see [LICENSE](LICENSE).

## Support

- Issues: https://github.com/SynderAccounting/gl-importer-plugin/issues
- Email: support@synder.com
