#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
export ERNIE_DEV_PROFILE=codex-cloud
export ERNIE_DEV_OPEN_BROWSER=0
exec /opt/ernie-cloud/run-as-dev.sh xvfb-run -a nub run dev
