#!/usr/bin/env bash
set -euo pipefail
export PATH="/opt/ernie-toolchain/bin:/usr/local/bin:/usr/bin:/bin"
if [ "$(id -u)" -eq 0 ]; then
  project_root="$(git rev-parse --show-toplevel)"
  chown -R ernie:ernie "$project_root"
  exec runuser -u ernie -- env HOME=/home/ernie PATH="$PATH" "$@"
fi
exec "$@"
