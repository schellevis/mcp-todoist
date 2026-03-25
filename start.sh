#!/bin/bash
# Geïsoleerde startup voor mcp-todoist
# - Strip alle env vars behalve TODOIST_API_TOKEN
# - Activeer Node.js security flags
# - Laad network-guard voor netwerkirsolatie

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec env -i \
  TODOIST_API_TOKEN="${TODOIST_API_TOKEN}" \
  TODOIST_UNIFIED_TOOLS="${TODOIST_UNIFIED_TOOLS:-}" \
  PATH="/opt/node22/bin:/usr/local/bin:/usr/bin:/bin" \
  node \
    --permission \
    --allow-fs-read="${SCRIPT_DIR}/" \
    --disable-proto=throw \
    --no-addons \
    --max-old-space-size=256 \
    --require "${SCRIPT_DIR}/network-guard.cjs" \
    "${SCRIPT_DIR}/dist/index.js"
