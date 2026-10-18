#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/scripts/runtime.sh"
if ! command -v node >/dev/null; then
  uv run --frozen python scripts/install_node.py
  export PATH="$UTILITIES_ROOT/.tools/node/bin:$PATH"
fi
npm ci
uv sync --frozen
echo 'Dependencies ready. Run ./dev.sh for the local dashboard.'
