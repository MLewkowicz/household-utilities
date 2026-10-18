#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/scripts/runtime.sh"
if ! command -v node >/dev/null; then echo 'Run ./setup.sh first.' >&2; exit 1; fi
npm run dev
