import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright-core";
import { ensureElectronRuntime } from "./ensure-electron-runtime.mjs";

const root = path.resolve(import.meta.dirname, "..");
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ernie-empty-ui-smoke-"));
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
  const canvas = window.getByRole("main", { name: "Ernie interface canvas" });
  const sidebar = window.getByRole("complementary", { name: /project$/ });
  const composer = window.locator(".prompt-composer");
  const draftCopy = window.locator(".draft-copy");
  await canvas.waitFor({ state: "visible" });
  await sidebar.waitFor({ state: "visible" });
  await composer.waitFor({ state: "visible" });
  assert.equal(await window.locator("dialog, webview").count(), 0);
  assert.deepEqual(await window.evaluate(() => ({
    processType: typeof globalThis.process,
    requireType: typeof globalThis.require,
    nodeIntegration: typeof globalThis.Buffer,
  })), { processType: "undefined", requireType: "undefined", nodeIntegration: "undefined" });
  assert.deepEqual((await window.evaluate(() => Object.keys(window.ernie).sort())), [
    "command", "copyText", "detachSessionTranscript", "getCommands", "getState", "getWorkspace",
    "onAgentEvent", "onSessionTranscriptEvent", "openDevServer", "platform", "refreshDevServers", "selectSessionTranscript",
  ]);
  const copyResult = await window.evaluate(() => window.ernie.copyText("Agentation clipboard smoke"));
  assert.equal(copyResult.ok, true);
  assert.equal(await electronApp.evaluate(({ clipboard }) => clipboard.readText()), "Agentation clipboard smoke");
  const oversizedCopy = await window.evaluate(() => window.ernie.copyText("x".repeat(524_289)));
  assert.equal(oversizedCopy.ok, false);
  assert.match(oversizedCopy.error ?? "", /too large/);
  const fillsViewport = await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.x === 0 && rect.y === 0 && rect.width === innerWidth && rect.height === innerHeight;
  });
  assert.equal(fillsViewport, true);
  const sidebarBox = await sidebar.boundingBox();
  const copyBox = await draftCopy.boundingBox();
  const composerBox = await composer.boundingBox();
  assert.ok(sidebarBox && Math.abs(sidebarBox.x - 13) <= 1 && Math.abs(sidebarBox.y - 18) <= 1 && Math.abs(sidebarBox.width - 271) <= 1 && Math.abs(sidebarBox.height - 858) <= 1);
  assert.ok(copyBox && Math.abs(copyBox.x - 408) <= 1 && Math.abs(copyBox.width - 211) <= 1 && copyBox.height >= 104);
  assert.ok(composerBox && Math.abs(composerBox.x - 410) <= 1 && Math.abs(composerBox.width - 798) <= 1 && Math.abs(composerBox.height - 146) <= 1);
  await window.getByLabel("Message Prime Agent").fill("Inspect the project");
  assert.equal(await window.getByRole("button", { name: "Send message" }).isEnabled(), true);
  await window.setViewportSize({ width: 820, height: 520 });
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(4));
  await window.waitForTimeout(100);
  assert.equal(await window.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  process.stdout.write("Electron renderer smoke test passed.\n");
} finally {
  await electronApp.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
