#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEST="$ROOT/assets/runtime"
NODE_BIN=${NODE_BIN:-$(node -p 'process.execPath')}
PRIME_AGENT_BIN=${PRIME_AGENT_BIN:-$(command -v prime-agent)}
PRIME_AGENT_ENTRY=$("$NODE_BIN" -e 'console.log(require("fs").realpathSync(process.argv[1]))' "$PRIME_AGENT_BIN")
PRIME_AGENT_ROOT=$(CDPATH= cd -- "$(dirname -- "$PRIME_AGENT_ENTRY")/../.." && pwd)

mkdir -p "$DEST"
rm -rf "$DEST/node" "$DEST/prime-agent"
cp "$NODE_BIN" "$DEST/node"
"$NODE_BIN" -e 'require("fs").cpSync(process.argv[1], process.argv[2], { recursive: true })' \
  "$PRIME_AGENT_ROOT" "$DEST/prime-agent"
"$NODE_BIN" "$ROOT/scripts/dereference-runtime.mjs" "$DEST/prime-agent"
chmod 755 "$DEST/node"

NODE_VERSION=$("$DEST/node" --version)
PRIME_AGENT_VERSION=$("$DEST/node" -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version)' "$DEST/prime-agent/package.json")
printf 'node=%s
prime-agent=%s
platform=%s
arch=%s
'   "$NODE_VERSION" "$PRIME_AGENT_VERSION" "$(uname -s)" "$(uname -m)" > "$DEST/VERSIONS"

echo "Vendored Node $NODE_VERSION and Prime Agent $PRIME_AGENT_VERSION into $DEST"
