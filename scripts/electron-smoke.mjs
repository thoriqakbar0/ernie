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
    ERNIE_FIXTURE_MANY_WORKTREES: "1",
    ERNIE_FIXTURE_MANY_AGENTS: "1",
  },
});

try {
  const window = await electronApp.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  const startup = window.locator('[data-startup-experience="composer"]');
  await startup.waitFor({ state: "visible", timeout: 5_000 });
  assert.match((await startup.textContent()) ?? "", /Starting Prime Agent/);
  await window.getByText("Ready", { exact: true }).waitFor({ timeout: 15_000 });
  assert.equal(await window.getByText("Test Model", { exact: true }).first().textContent(), "Test Model");
  await window.locator(".agent-tree-row").filter({ hasText: "Child" }).waitFor({ timeout: 10_000 });
  await window.locator(".agent-tree-row").filter({ hasText: "Child" }).click();
  await window.locator(".agent-overview").getByRole("heading", { name: "Child" }).waitFor();
  assert.equal(await window.locator(".workspace-tab-shell").count(), 2);
  const selectedTab = window.getByRole("tab", { selected: true });
  assert.equal(await selectedTab.getAttribute("aria-controls"), await window.getByRole("tabpanel").getAttribute("id"));
  assert.equal(await selectedTab.getAttribute("tabindex"), "0");
  await window.getByRole("button", { name: "Close Child" }).click();
  assert.equal(await window.locator(".agent-overview").count(), 0);
  await window.getByRole("button", { name: "Open agent tab" }).click();
  assert.match((await window.getByRole("dialog", { name: "Open agent tab" }).textContent()) ?? "", /Root.*Child/s);
  await window.getByRole("button", { name: "Close tab chooser" }).click();
  const managerTrigger = window.getByRole("button", { name: /Worktree manager/ });
  await managerTrigger.click();
  const managerDialog = window.getByRole("dialog", { name: "Worktree manager" });
  await managerDialog.waitFor();
  assert.match((await window.locator(".manager-footer").textContent()) ?? "", /New thread in current worktree/);
  assert.ok(await window.locator(".manager-worktree-list").evaluate((element) => element.scrollHeight > element.clientHeight));
  for (let index = 0; index < 4; index += 1) await window.keyboard.press("Tab");
  assert.equal(await window.evaluate(() => document.activeElement?.closest("dialog")?.getAttribute("aria-labelledby")), "manager-title");
  await window.keyboard.press("Escape");
  await managerDialog.waitFor({ state: "hidden" });
  assert.equal(await managerTrigger.evaluate((element) => element === document.activeElement), true);
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
  assert.equal(await window.locator(".tool-item .tool-indicator").evaluate((element) => getComputedStyle(element).animationName), "none");
  assert.match((await window.locator(".delegation-item").textContent()) ?? "", /api-reviewer.*Review the API.*done/);
  assert.match((await window.locator(".usage").textContent()) ?? "", /2k tokens/);

  // 410 × 260 CSS pixels models the supported 820 × 520 window at 200% zoom.
  await window.setViewportSize({ width: 410, height: 260 });
  await window.waitForTimeout(150);
  const railToggle = window.getByRole("button", { name: "Toggle workspace navigation" });
  await railToggle.waitFor({ state: "visible" });
  assert.equal(await window.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await railToggle.click();
  await window.locator(".project-rail.is-open").waitFor();
  await window.keyboard.press("Escape");
  assert.equal(await railToggle.evaluate((element) => element === document.activeElement), true);
  const targetBox = await window.getByLabel("Send message").boundingBox();
  assert.ok(targetBox && targetBox.width >= 40 && targetBox.height >= 40);
  await window.setViewportSize({ width: 1040, height: 720 });
  await window.waitForTimeout(150);

  await window.getByRole("button", { name: "New thread" }).click();
  await window.getByRole("dialog", { name: "New thread" }).waitFor({ timeout: 5_000 });
  await window.getByRole("button", { name: "Create blank thread" }).click();
  await window.getByText("What would you like to work on?", { exact: true }).waitFor({ timeout: 10_000 });
  process.stdout.write("Electron smoke test passed.\n");
} finally {
  await electronApp.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
