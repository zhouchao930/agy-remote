#!/bin/sh
set -e
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
NODE_BIN="$(command -v node || echo node)"
exec "$NODE_BIN" "$SCRIPT_DIR/scripts/uninstall.mjs" "$@"
