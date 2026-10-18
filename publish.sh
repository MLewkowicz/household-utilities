#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/scripts/runtime.sh"
exec node scripts/publish.mjs
