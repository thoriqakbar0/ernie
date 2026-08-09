import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";
import { ensureElectronRuntime } from "./ensure-electron-runtime.mjs";

const root = path.resolve(import.meta.dirname, "..");
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ernie-sidebar-smoke-"));
const electronApp = await electron.launch({
  executablePath: ensureElectronRuntime(),
  args: [root, `--user-data-dir=${userData}`],
  env: {
    ...process.env,
    ERNIE_PROJECT_PATH: root,
    ERNIE_AGENT_CLI_PATH: path.join(root, "tests/fake-prime-agent.mjs"),
    ERNIE_CATALOG_CLI_PATH: path.join(root, "tests/fixtures/workspace-prime-agent.mjs"),
    ERNIE_CATALOG_GIT_PATH: path.join(root, "tests/fixtures/workspace-git.mjs"),
    ERNIE_FIXTURE_ROOT: root,
    ERNIE_FAKE_MODE: "lifecycle",
  },
});

try {
  const window = await electronApp.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1470, 923));
  await window.waitForTimeout(100);
  const canvas = window.getByRole("main", { name: "Ernie workspace" });
  const sidebar = window.getByRole("complementary", { name: "Workspace navigation" });
  await canvas.waitFor({ state: "visible" });
  await sidebar.waitFor({ state: "visible" });
  assert.equal(await window.locator("dialog, webview").count(), 0);
  assert.equal(await window.getByRole("button", { name: "Close workspace navigation" }).count(), 1);
  assert.equal(await window.getByRole("button", { name: "Open workspace navigation" }).isVisible(), false);
  assert.deepEqual(await window.evaluate(() => ({
    processType: typeof globalThis.process,
    requireType: typeof globalThis.require,
    nodeIntegration: typeof globalThis.Buffer,
  })), { processType: "undefined", requireType: "undefined", nodeIntegration: "undefined" });
  assert.deepEqual((await window.evaluate(() => Object.keys(window.ernie).sort())), [
    "archiveProject", "archiveWorktree", "copyText", "createWorktree", "detachSessionTranscript",
    "getRendererPerformance", "getSpaceCommands", "getSpaceModels", "getSpaceRlmMaxDepth", "getSpaceState",
    "getWorkspace", "onSessionTranscriptEvent", "onSpaceEvent", "onWorkspaceEvent", "openDevServer",
    "openProjectDirectory", "platform", "refreshDevServers", "removeWorktreeCheckout", "restoreWorktree",
    "selectSessionTranscript", "spaceCommand", "startSpace",
  ]);
  const copyResult = await window.evaluate(() => window.ernie.copyText("Ernie clipboard smoke"));
  assert.equal(copyResult.ok, true);
  assert.equal(await electronApp.evaluate(({ clipboard }) => clipboard.readText()), "Ernie clipboard smoke");
  const oversizedCopy = await window.evaluate(() => window.ernie.copyText("x".repeat(524_289)));
  assert.equal(oversizedCopy.ok, false);
  assert.match(oversizedCopy.error ?? "", /too large/);
  assert.equal(await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.x === 0 && rect.y === 0 && rect.width === innerWidth && rect.height === innerHeight;
  }), true);
  const sidebarBox = await sidebar.boundingBox();
  assert.ok(sidebarBox && Math.abs(sidebarBox.x) <= 1 && Math.abs(sidebarBox.y) <= 1 && Math.abs(sidebarBox.width - 268) <= 1 && Math.abs(sidebarBox.height - 923) <= 1);
  const worktrees = window.getByRole("button", { name: "Hide linked worktrees for ernie" });
  await worktrees.waitFor({ state: "visible" });
  assert.equal(await worktrees.getAttribute("aria-expanded"), "true");
  await worktrees.click();
  const collapsedWorktrees = window.getByRole("button", { name: "Show linked worktrees for ernie" });
  assert.equal(await collapsedWorktrees.getAttribute("aria-expanded"), "false");
  await collapsedWorktrees.click();
  assert.equal(await worktrees.getAttribute("aria-expanded"), "true");

  await window.getByRole("button", { name: "Close workspace navigation" }).click();
  await sidebar.waitFor({ state: "hidden" });
  assert.match(await window.locator(".focused-workspace").getAttribute("class") ?? "", /sidebar-collapsed/u);
  await window.keyboard.press("Meta+b");
  await sidebar.waitFor({ state: "visible" });
  assert.doesNotMatch(await window.locator(".focused-workspace").getAttribute("class") ?? "", /sidebar-collapsed/u);

  await window.setViewportSize({ width: 820, height: 520 });
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(4));
  await window.waitForTimeout(100);
  assert.equal(await window.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.equal(await window.locator("dialog, webview").count(), 0);
  process.stdout.write("Electron sidebar-shell smoke test passed.\n");
} finally {
  await electronApp.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
