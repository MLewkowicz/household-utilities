#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${BASH_VERSION:-}" ]]; then
  UTILITIES_RUNTIME_SOURCE="${BASH_SOURCE[0]}"
elif [[ -n "${ZSH_VERSION:-}" ]]; then
  UTILITIES_RUNTIME_SOURCE="${(%):-%x}"
else
  echo 'Use bash or zsh to load scripts/runtime.sh.' >&2
  return 1
fi
UTILITIES_ROOT="$(cd -- "$(dirname -- "$UTILITIES_RUNTIME_SOURCE")/.." && pwd)"
cd "$UTILITIES_ROOT"
if [[ -x "$UTILITIES_ROOT/.tools/node/bin/node" ]]; then
  export PATH="$UTILITIES_ROOT/.tools/node/bin:$PATH"
fi
if ! command -v uv >/dev/null; then
  if [[ -x "$HOME/.local/bin/uv" ]]; then export PATH="$HOME/.local/bin:$PATH"; else
    echo 'Install uv first: https://docs.astral.sh/uv/getting-started/installation/' >&2; exit 1
  fi
fi
