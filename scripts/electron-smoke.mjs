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
    ERNIE_CATALOG_CLI_PATH: path.join(root, "tests/fixtures/workspace-prime-agent.mjs"),
    ERNIE_CATALOG_GIT_PATH: path.join(root, "tests/fixtures/workspace-git.mjs"),
    ERNIE_FIXTURE_ROOT: root,
    ERNIE_FAKE_MODE: "lifecycle",
    ERNIE_FAKE_STARTUP_DELAY_MS: "700",
  },
});

try {
  const window = await electronApp.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  const startup = window.locator('[data-startup-experience="composer"]');
  await startup.waitFor({ state: "visible", timeout: 5_000 });
  assert.match((await startup.textContent()) ?? "", /Getting your workspace ready/);
  await window.getByText("Ready", { exact: true }).waitFor({ timeout: 15_000 });
  assert.equal(await window.getByText("Test Model", { exact: true }).first().textContent(), "Test Model");
  await window.locator(".agent-tree-row").filter({ hasText: "Child" }).waitFor({ timeout: 10_000 });
  await window.locator(".agent-tree-row").filter({ hasText: "Child" }).click();
  await window.locator(".agent-overview").getByRole("heading", { name: "Child" }).waitFor();
  assert.equal(await window.locator(".workspace-tab-shell").count(), 2);
  await window.getByRole("button", { name: "Close Child" }).click();
  assert.equal(await window.locator(".agent-overview").count(), 0);
  await window.getByRole("button", { name: "Open agent tab" }).click();
  assert.match((await window.locator(".tab-chooser").textContent()) ?? "", /Root.*Child/s);
  await window.getByRole("button", { name: "Close tab chooser" }).click();
  await window.getByRole("button", { name: /Worktree manager/ }).click();
  await window.getByRole("dialog", { name: "Worktree manager" }).waitFor();
  assert.match((await window.locator(".manager-footer").textContent()) ?? "", /require the daemon adapter/);
  await window.getByRole("button", { name: "Close worktree manager" }).click();
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
  await composer.fill("/res");
  await window.getByRole("option", { name: /skill:research/ }).waitFor({ timeout: 5_000 });
  await composer.press("Enter");
  assert.equal(await composer.inputValue(), "/skill:research ");
  await composer.fill("smoke test");
  await window.getByLabel("Send message").click();
  await window.getByText("A".repeat(5_000), { exact: true }).waitFor({ timeout: 10_000 });
  await window.locator(".tool-item").waitFor({ state: "attached", timeout: 10_000 });
  assert.match((await window.locator(".tool-item").textContent()) ?? "", /readdone.*final output/);
  assert.match((await window.locator(".delegation-item").textContent()) ?? "", /api-reviewer.*Review the API.*done/);
  assert.match((await window.locator(".usage").textContent()) ?? "", /2k tokens/);

  await window.getByRole("button", { name: "New thread" }).click();
  await window.getByRole("dialog", { name: "New agent thread" }).waitFor({ timeout: 5_000 });
  await window.getByRole("button", { name: "Start blank" }).click();
  await window.getByText("What should we build?", { exact: true }).waitFor({ timeout: 10_000 });
  process.stdout.write("Electron smoke test passed.\n");
} finally {
  await electronApp.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
