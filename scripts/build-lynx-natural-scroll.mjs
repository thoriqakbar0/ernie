import { spawnSync } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const nodeRoot = path.dirname(path.dirname(process.execPath));
const nodeHeaders = path.join(nodeRoot, 'include/node');
const sourcePath = path.join(repositoryRoot, 'src/native/lynx-natural-scroll.m');
const outputDirectory = path.join(repositoryRoot, '.build/native');
const outputPath = path.join(outputDirectory, 'lynx-natural-scroll.node');

await access(path.join(nodeHeaders, 'node_api.h'));
await mkdir(outputDirectory, { recursive: true });

const compilation = spawnSync(
  'xcrun',
  [
    'clang',
    '-fobjc-arc',
    '-bundle',
    '-undefined',
    'dynamic_lookup',
    '-framework',
    'AppKit',
    '-I',
    nodeHeaders,
    sourcePath,
    '-o',
    outputPath,
  ],
  { encoding: 'utf8' },
);

if (compilation.error !== undefined) throw compilation.error;
if (compilation.status !== 0) {
  throw new Error(compilation.stderr.trim() || 'natural scrolling adapter compilation failed');
}
