import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";
import { ensureElectronRuntime } from "./ensure-electron-runtime.mjs";

const root = path.resolve(import.meta.dirname, "..");
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ernie-smoke-"));
const executablePath = ensureElectronRuntime();
const electronApp = await electron.launch({
  executablePath,
  args: [root, `--user-data-dir=${userData}`],
  env: {
    ...process.env,
    ERNIE_PROJECT_PATH: root,
    ERNIE_AGENT_CLI_PATH: path.join(root, "tests/fake-prime-agent.mjs"),
    ERNIE_FAKE_MODE: "lifecycle",
  },
});

try {
  const window = await electronApp.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.getByText("Ready", { exact: true }).waitFor({ timeout: 15_000 });
  assert.equal(await window.getByText("Test Model", { exact: true }).first().textContent(), "Test Model");
  assert.equal(await window.locator("[data-agentation-toolbar]").count(), 0);
  assert.deepEqual(await window.evaluate(() => ({ require: typeof globalThis.require, electron: typeof globalThis.process })), { require: "undefined", electron: "undefined" });

  const originalClipboard = await electronApp.evaluate(({ clipboard }) => clipboard.readText());
  const clipboardProbe = `ernie-clipboard-${Date.now()}`;
  try {
    const clipboardWrite = await window.evaluate(async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
      }
    }, clipboardProbe);
    assert.deepEqual(clipboardWrite, { ok: true });
    assert.equal(await electronApp.evaluate(({ clipboard }) => clipboard.readText()), clipboardProbe);
  } finally {
    await electronApp.evaluate(({ clipboard }, text) => clipboard.writeText(text), originalClipboard);
  }

  const composer = window.getByLabel("Message Prime Agent");
  await composer.fill("smoke test");
  await window.getByLabel("Send message").click();
  await window.getByText("A".repeat(5_000), { exact: true }).waitFor({ timeout: 10_000 });
  await window.locator(".tool-item").waitFor({ state: "attached", timeout: 10_000 });
  assert.match((await window.locator(".tool-item").textContent()) ?? "", /readdone.*final output/);
  assert.match((await window.locator(".usage").textContent()) ?? "", /2k tokens/);

  await window.getByRole("button", { name: "New thread" }).click();
  await window.getByText("What should we build?", { exact: true }).waitFor({ timeout: 10_000 });
  process.stdout.write("Electron smoke test passed.\n");
} finally {
  await electronApp.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
