#!/usr/bin/env bash
set -euo pipefail
UTILITIES_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$UTILITIES_ROOT"
if [[ -x "$UTILITIES_ROOT/.tools/node/bin/node" ]]; then
  export PATH="$UTILITIES_ROOT/.tools/node/bin:$PATH"
fi
if ! command -v uv >/dev/null; then
  if [[ -x "$HOME/.local/bin/uv" ]]; then export PATH="$HOME/.local/bin:$PATH"; else
    echo 'Install uv first: https://docs.astral.sh/uv/getting-started/installation/' >&2; exit 1
  fi
fi
