import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

// Run one explicit interaction scenario against an already-running development server.
const scenarioPath = process.argv[2];
if (!scenarioPath) throw new Error('Usage: ernie-record scenario.mjs [output-parent]');
const scenario = await import(pathToFileURL(resolve(scenarioPath)).href);
if (typeof scenario.default !== 'function') throw new Error('Scenario must export a default async function');
const parent = resolve(process.argv[3] ?? 'artifacts/interactions');
await mkdir(parent, { recursive: true });
const output = await mkdtemp(join(parent, 'recording-'));
const viewport = { width: 1440, height: 900 };
const browser = await chromium.launch({ chromiumSandbox: true });
let context;
let failed = false;
try {
  context = await browser.newContext({ viewport, recordVideo: { dir: output, size: viewport } });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const steps = [];
  const start = performance.now();
  const step = async (label, action) => {
    const index = steps.length + 1;
    const record = { index, label, startMs: performance.now() - start, status: 'running' };
    steps.push(record);
    await context.tracing.group(label);
    try {
      await action();
      record.status = 'completed';
    } catch (error) {
      record.status = 'failed';
      throw error;
    } finally {
      record.endMs = performance.now() - start;
      await page.screenshot({ path: join(output, `step-${String(index).padStart(3, '0')}.png`) });
      await context.tracing.groupEnd();
    }
  };
  try {
    await scenario.default({ page, context, step, url: process.env.ERNIE_RECORD_URL ?? 'http://127.0.0.1:4310/?browser=1' });
  } catch (error) {
    failed = true;
    console.error(error);
  } finally {
    await writeFile(join(output, 'steps.json'), JSON.stringify({ viewport, failed, steps }, null, 2));
    await context.tracing.stop({ path: join(output, 'trace.zip') });
  }
} finally {
  try { await context?.close(); } finally { await browser.close(); }
  console.log(`Recording: ${output}`);
}
if (failed) process.exitCode = 1;
