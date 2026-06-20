#!/usr/bin/env bash
# Build an MCPB bundle from the current dist/ + production dependencies.
# Output: mcpb/gl-importer-mcp-<version>.mcpb
#
# Usage: ./mcpb/build.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
STAGE="$(mktemp -d)/gl-importer-mcpb-build"
OUT="$ROOT/mcpb/gl-importer-mcp-$VERSION.mcpb"

trap 'rm -rf "$(dirname "$STAGE")"' EXIT

echo "==> Staging at $STAGE"
mkdir -p "$STAGE/assets"
cp -r "$ROOT/dist" "$STAGE/dist"
cp "$ROOT/package.json" "$STAGE/package.json"
cp "$ROOT/README.md" "$STAGE/README.md"
cp "$ROOT/LICENSE" "$STAGE/LICENSE"
cp "$ROOT/assets/logo.png" "$STAGE/assets/logo.png"
cp "$ROOT/mcpb/manifest.json" "$STAGE/manifest.json"

echo "==> Installing production deps"
(cd "$STAGE" && npm install --production --no-save --no-audit --no-fund --silent)

# Drop empty phantom dev-tool dirs the SDK's transitive graph leaks
for d in @vitest @jest @rollup @esbuild; do
  rm -rf "$STAGE/node_modules/$d"
done

echo "==> Packing (raw zip; bypasses MCPB strict schema so tools[].inputSchema survives)"
rm -f "$OUT"
(cd "$STAGE" && zip -r -q "$OUT" .)

echo "==> Done: $OUT"
ls -lh "$OUT"
