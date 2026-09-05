#!/usr/bin/env bash
set -euo pipefail
set +x
project_root="$(git rev-parse --show-toplevel)"
if ! git ls-files --error-unmatch .nvmrc >/dev/null 2>&1; then
  printf '24.19.0\n' > .nvmrc
fi
chown -R ernie:ernie "$project_root"
timeout 300 runuser -u ernie -- env HOME=/home/ernie PATH=/opt/ernie-toolchain/bin:/usr/local/bin:/usr/bin:/bin CI=1 nub install --frozen-lockfile --reporter append-only
runuser -u ernie -- env HOME=/home/ernie PATH=/opt/ernie-toolchain/bin:/usr/local/bin:/usr/bin:/bin nub --node -e "void require('electron')"
runuser -u ernie -- env HOME=/home/ernie PATH=/opt/ernie-toolchain/bin:/usr/local/bin:/usr/bin:/bin nub run link
