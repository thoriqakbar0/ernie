#!/usr/bin/env bash
set -euo pipefail
set +x

export DEBIAN_FRONTEND=noninteractive
printf 'Installing Linux display and recording dependencies\n'
printf '%s\n' \
  'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] http://archive.ubuntu.com/ubuntu noble main universe' \
  'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] http://archive.ubuntu.com/ubuntu noble-updates main universe' \
  'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] http://security.ubuntu.com/ubuntu noble-security main universe' > /tmp/ernie-ubuntu.list
# The universal image can include unrelated package sources that are unavailable through its proxy.
timeout 180 apt-get -o Dir::Etc::sourcelist=/tmp/ernie-ubuntu.list -o Dir::Etc::sourceparts=- -o Acquire::http::Timeout=30 update -qq
timeout 180 apt-get install -y --no-install-recommends xvfb xauth ffmpeg libgtk-3-0t64 libnss3 libgbm1 libasound2t64 > /tmp/ernie-apt.log 2>&1 || { tail -40 /tmp/ernie-apt.log; exit 1; }

mkdir -p /opt/ernie-toolchain/bin
printf 'Installing Node 24.19.0 and Nub 0.7.5\n'
timeout 300 npm install --global --prefix /opt/ernie-toolchain --no-audit --no-fund --foreground-scripts --loglevel warn node@24.19.0 @nubjs/nub@0.7.5
export PATH="/opt/ernie-toolchain/bin:$PATH"
ln -sf /opt/ernie-toolchain/bin/nub /usr/local/bin/nub
if ! id ernie >/dev/null 2>&1; then useradd --create-home --shell /bin/bash ernie; fi
project_root="$(git rev-parse --show-toplevel)"
git config --global --add safe.directory "$project_root"
if ! git ls-files --error-unmatch .nvmrc >/dev/null 2>&1; then
  printf '24.19.0\n' > .nvmrc
fi
exclude_file="$(git rev-parse --git-path info/exclude)"
if ! grep -qxF '/artifacts/interactions/' "$exclude_file" 2>/dev/null; then
  printf '\n/artifacts/interactions/\n' >> "$exclude_file"
fi
if ! grep -qxF '/.nvmrc' "$exclude_file" 2>/dev/null; then
  printf '/.nvmrc\n' >> "$exclude_file"
fi
chown -R ernie:ernie "$project_root"
printf 'Installing Ernie dependencies\n'
timeout 300 runuser -u ernie -- env HOME=/home/ernie PATH=/opt/ernie-toolchain/bin:/usr/local/bin:/usr/bin:/bin CI=1 nub install --frozen-lockfile --reporter append-only > /tmp/ernie-install.log 2>&1 || { tail -60 /tmp/ernie-install.log; exit 1; }
# Electron 42 downloads its executable on first import. Cache it while setup has network access.
runuser -u ernie -- env HOME=/home/ernie PATH=/opt/ernie-toolchain/bin:/usr/local/bin:/usr/bin:/bin nub --node -e "void require('electron')"
runuser -u ernie -- env HOME=/home/ernie PATH=/opt/ernie-toolchain/bin:/usr/local/bin:/usr/bin:/bin nub run link

source_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p /opt/ernie-cloud
if [ "$source_directory" != /opt/ernie-cloud ]; then
  cp "$source_directory"/{package.json,record.mjs,frames.mjs,example.mjs,run-as-dev.sh,dev.sh,README.md,maintenance.sh} /opt/ernie-cloud/
fi
chown -R ernie:ernie /opt/ernie-cloud
printf 'Installing recording tools\n'
(cd /opt/ernie-cloud && timeout 240 runuser -u ernie -- env HOME=/home/ernie PATH=/opt/ernie-toolchain/bin:/usr/local/bin:/usr/bin:/bin CI=1 nub install --no-frozen-lockfile --reporter append-only) > /tmp/ernie-tools.log 2>&1 || { tail -40 /tmp/ernie-tools.log; exit 1; }
runuser -u ernie -- env HOME=/home/ernie PATH=/opt/ernie-toolchain/bin:/usr/local/bin:/usr/bin:/bin nub --node /opt/ernie-cloud/node_modules/playwright/cli.js install chromium
chmod 755 /opt/ernie-cloud/{run-as-dev.sh,dev.sh,maintenance.sh}
ln -sf /opt/ernie-cloud/dev.sh /usr/local/bin/ernie-dev
for command_name in lat frog; do
  printf '#!/usr/bin/env bash\nexec /opt/ernie-cloud/node_modules/.bin/%s "$@"\n' "$command_name" > "/opt/ernie-cloud/$command_name.sh"
  chmod 755 "/opt/ernie-cloud/$command_name.sh"
  ln -sf "/opt/ernie-cloud/$command_name.sh" "/usr/local/bin/$command_name"
done
cat > /usr/local/bin/ernie-record <<'RECORD'
#!/usr/bin/env bash
set -euo pipefail
exec /opt/ernie-cloud/run-as-dev.sh nub --node /opt/ernie-cloud/record.mjs "$@"
RECORD
cat > /usr/local/bin/ernie-frames <<'FRAMES'
#!/usr/bin/env bash
set -euo pipefail
exec /opt/ernie-toolchain/bin/node /opt/ernie-cloud/frames.mjs "$@"
FRAMES
chmod 755 /usr/local/bin/{ernie-record,ernie-frames}
lat check
nub --version
printf 'Ernie cloud setup complete. Read /opt/ernie-cloud/README.md; start browser development with ernie-dev.\n'
