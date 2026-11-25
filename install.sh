#!/bin/sh
set -e
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [ -x "$HOME/.gemini/antigravity/bin/node" ]; then
  NODE_BIN="$HOME/.gemini/antigravity/bin/node"
fi
if [ -z "$NODE_BIN" ]; then
  echo "未找到可用的 Node.js，请先安装 Node.js (>=20)。" >&2
  exit 1
fi
exec "$NODE_BIN" "$SCRIPT_DIR/scripts/install.mjs" "$@"
