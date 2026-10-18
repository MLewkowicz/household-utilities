#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/scripts/runtime.sh"
exec uv run --frozen python scripts/import_bills.py "$@"
