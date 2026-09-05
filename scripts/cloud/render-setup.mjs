import { readFile } from 'node:fs/promises';

// Emit a self-contained setup command for the Codex environment editor.
const files = ['setup.sh', 'maintenance.sh', 'package.json', 'record.mjs', 'frames.mjs', 'example.mjs', 'run-as-dev.sh', 'dev.sh', 'README.md'];
const output = ['#!/usr/bin/env bash', 'set -euo pipefail', 'set +x', 'mkdir -p /opt/ernie-cloud'];
for (const [index, name] of files.entries()) {
  const delimiter = `ERNIE_CLOUD_FILE_${index}`;
  const body = await readFile(new URL(name, import.meta.url), 'utf8');
  if (body.includes(delimiter)) throw new Error(`Heredoc delimiter conflicts with ${name}`);
  output.push(`cat > /opt/ernie-cloud/${name} <<'${delimiter}'`, body.trimEnd(), delimiter);
}
output.push('bash /opt/ernie-cloud/setup.sh');
process.stdout.write(output.join('\n') + '\n');
