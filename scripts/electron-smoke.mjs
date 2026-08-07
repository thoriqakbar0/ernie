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
let primaryClosed = false;

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
  await window.getByRole("dialog", { name: "Open agent tab" }).locator("button").filter({ hasText: "Child" }).click();
  await window.getByRole("tabpanel").getByRole("heading", { name: "Child" }).waitFor();
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
  await window.evaluate(() => { document.documentElement.dir = "rtl"; });
  await window.getByRole("tab", { selected: true }).focus();
  await window.keyboard.press("ArrowLeft");
  assert.equal(await window.getByRole("tab", { selected: true }).getAttribute("id"), "workspace-tab-root");
  await window.evaluate(() => { document.documentElement.dir = "ltr"; });
  for (let index = 1; index <= 8; index += 1) {
    await window.getByRole("button", { name: "Open agent tab" }).click();
    await window.getByRole("dialog", { name: "Open agent tab" }).getByRole("button", { name: new RegExp(`^Review agent ${index},`) }).click();
  }
  assert.equal(await window.locator(".workspace-tab-shell").count(), 10);
  assert.equal(await window.locator(".workspace-tab-viewport").evaluate((element) => element.scrollWidth > element.clientWidth), true);
  const addTabBox = await window.getByRole("button", { name: "Open agent tab" }).boundingBox();
  assert.ok(addTabBox && addTabBox.x + addTabBox.width <= await window.evaluate(() => innerWidth));
  await window.locator("#workspace-tab-root").click();
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

  await electronApp.evaluate(({ BrowserWindow }) => {
    const browserWindow = BrowserWindow.getAllWindows()[0];
    browserWindow.setSize(820, 520);
    browserWindow.webContents.setZoomFactor(2);
  });
  await window.waitForTimeout(200);
  const railToggle = window.getByRole("button", { name: "Toggle workspace navigation" });
  await railToggle.waitFor({ state: "visible" });
  assert.equal(await window.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await railToggle.click();
  await window.locator(".project-rail.is-open").waitFor();
  await window.waitForTimeout(50);
  assert.equal(await window.evaluate(() => document.activeElement?.closest("#workspace-rail") !== null), true);
  assert.equal(await window.locator("#workspace-main").evaluate((element) => element.inert), true);
  const backdropBox = await window.getByRole("button", { name: "Close workspace navigation" }).boundingBox();
  assert.ok(backdropBox);
  await window.mouse.move(backdropBox.x + backdropBox.width - 4, backdropBox.y + 8);
  await window.mouse.down();
  assert.equal(await window.getByRole("button", { name: "Close workspace navigation" }).evaluate((element) => getComputedStyle(element).transform), "none");
  await window.mouse.move(4, 8);
  await window.mouse.up();
  for (let index = 0; index < 12; index += 1) {
    await window.keyboard.press(index % 3 === 0 ? "Shift+Tab" : "Tab");
    assert.equal(await window.evaluate(() => document.activeElement?.closest("#workspace-rail") !== null), true);
  }
  await window.keyboard.press("Escape");
  await window.waitForTimeout(50);
  assert.equal(await railToggle.evaluate((element) => element === document.activeElement), true);
  for (const key of ["Shift+Tab", "Tab", "Tab", "Tab"]) {
    await window.keyboard.press(key);
    assert.equal(await window.evaluate(() => document.activeElement?.closest("#workspace-rail") === null), true);
  }
  await railToggle.focus();
  const targetBox = await window.getByLabel("Send message").boundingBox();
  const twoXViewport = await window.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(targetBox && targetBox.width >= 40 && targetBox.height >= 40 && targetBox.y < twoXViewport.height && targetBox.y + targetBox.height > 0);
  const panelBox = await window.locator(".workspace-panel").boundingBox();
  assert.ok(panelBox && panelBox.y + panelBox.height <= twoXViewport.height);

  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(4));
  await window.waitForTimeout(200);
  assert.equal(await window.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  const fourXTarget = await window.getByLabel("Send message").boundingBox();
  const fourXComposer = await window.getByLabel("Message Prime Agent").boundingBox();
  const fourXPanel = await window.locator(".workspace-panel").boundingBox();
  const fourXViewport = await window.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.ok(fourXPanel && fourXComposer && fourXComposer.y >= fourXPanel.y && fourXComposer.y + fourXComposer.height <= fourXPanel.y + fourXPanel.height, JSON.stringify({ fourXPanel, fourXComposer, fourXTarget, fourXViewport }));
  assert.ok(fourXTarget && fourXTarget.width >= 40 && fourXTarget.height >= 40 && fourXTarget.y >= fourXPanel.y && fourXTarget.y + fourXTarget.height <= fourXViewport.height);
  await railToggle.click();
  await window.getByRole("button", { name: "New thread" }).click();
  const compactDialog = window.getByRole("dialog", { name: "New thread" });
  await compactDialog.waitFor();
  const compactBox = await compactDialog.boundingBox();
  assert.ok(compactBox && compactBox.width <= fourXViewport.width && compactBox.height <= fourXViewport.height);
  assert.equal(await compactDialog.evaluate((element) => element.scrollHeight > element.clientHeight), true);
  await window.keyboard.press("Escape");
  await compactDialog.waitFor({ state: "hidden" });
  await window.waitForTimeout(50);
  assert.equal(await railToggle.evaluate((element) => element === document.activeElement), true);
  await electronApp.evaluate(({ BrowserWindow }) => {
    const browserWindow = BrowserWindow.getAllWindows()[0];
    browserWindow.webContents.setZoomFactor(1);
    browserWindow.setSize(1040, 720);
  });
  await window.waitForTimeout(200);
  await window.setViewportSize({ width: 700, height: 700 });
  await railToggle.click();
  await window.locator(".project-rail.is-open").waitFor();
  await window.setViewportSize({ width: 900, height: 700 });
  await window.waitForTimeout(100);
  assert.equal(await window.locator(".project-rail.is-open").count(), 0);
  await window.setViewportSize({ width: 700, height: 700 });
  assert.equal(await window.locator(".project-rail.is-open").count(), 0);
  await window.setViewportSize({ width: 1040, height: 720 });
  await window.emulateMedia({ forcedColors: "active" });
  assert.equal(await window.getByText("Ready", { exact: true }).isVisible(), true);
  assert.equal(await window.getByLabel("Send message").isVisible(), true);
  const forcedColorSignatures = await window.evaluate(() => {
    const host = document.createElement("div");
    document.body.append(host);
    const signatures = ["idle", "working", "waiting", "completed", "failed"].map((status) => {
      const indicator = document.createElement("span");
      indicator.className = `tab-state ${status}`;
      host.append(indicator);
      const style = getComputedStyle(indicator);
      const after = getComputedStyle(indicator, "::after");
      const signature = [style.backgroundColor, style.borderWidth, style.borderRadius, style.transform, after.content, after.transform, after.borderWidth].join("|");
      indicator.remove();
      return signature;
    });
    host.remove();
    return signatures;
  });
  assert.equal(new Set(forcedColorSignatures).size, forcedColorSignatures.length);
  await window.emulateMedia({ forcedColors: "none" });

  await window.getByRole("button", { name: "New thread" }).click();
  await window.getByRole("dialog", { name: "New thread" }).waitFor({ timeout: 5_000 });
  await window.getByRole("button", { name: "Create blank thread" }).click();
  await window.getByText("What would you like to work on?", { exact: true }).waitFor({ timeout: 10_000 });

  await electronApp.close();
  primaryClosed = true;
  const emptyUserData = fs.mkdtempSync(path.join(os.tmpdir(), "ernie-empty-smoke-"));
  const emptyApp = await electron.launch({
    executablePath,
    args: [root, `--user-data-dir=${emptyUserData}`],
    env: {
      ...process.env,
      ERNIE_PROJECT_PATH: root,
      ERNIE_AGENT_CLI_PATH: path.join(root, "tests/fake-prime-agent.mjs"),
      ERNIE_CATALOG_CLI_PATH: path.join(root, "tests/fixtures/workspace-prime-agent.mjs"),
      ERNIE_CATALOG_GIT_PATH: path.join(root, "tests/fixtures/workspace-git.mjs"),
      ERNIE_FIXTURE_ROOT: root,
      ERNIE_FIXTURE_EMPTY: "1",
      ERNIE_FAKE_MODE: "lifecycle",
    },
  });
  try {
    const emptyWindow = await emptyApp.firstWindow();
    await emptyWindow.getByText("Ready", { exact: true }).waitFor({ timeout: 15_000 });
    await emptyWindow.getByRole("navigation", { name: "Worktrees and agents" }).getByText("No worktrees found in this repository.", { exact: true }).waitFor();
    await emptyWindow.getByRole("button", { name: "Open agent tab" }).click();
    await emptyWindow.getByText("No agents yet. Start a new thread or delegate a task to create one.", { exact: true }).waitFor();
    await emptyWindow.getByRole("button", { name: "Close tab chooser" }).click();
    await emptyWindow.getByRole("button", { name: /Worktree manager/ }).click();
    await emptyWindow.getByRole("dialog", { name: "Worktree manager" }).getByText("No worktrees found in this repository.", { exact: true }).waitFor();
  } finally {
    await emptyApp.close();
    fs.rmSync(emptyUserData, { recursive: true, force: true });
  }
  process.stdout.write("Electron smoke test passed.\n");
} finally {
  if (!primaryClosed) await electronApp.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
