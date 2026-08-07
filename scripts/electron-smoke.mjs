import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { _electron as electron } from "playwright-core";
import { ensureElectronRuntime } from "./ensure-electron-runtime.mjs";

const root = path.resolve(import.meta.dirname, "..");
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "ernie-smoke-"));
const executablePath = ensureElectronRuntime();
const daemonSocketPath = path.join(userData, "daemon.sock");
let daemonSequence = 0;
const fakeDaemon = net.createServer((socket) => {
  socket.setEncoding("utf8");
  socket.write(`${JSON.stringify({
    type: "daemon_hello",
    protocol: { name: "prime-agent.daemon", version: 7 },
    serverCapabilities: ["attach_snapshot", "event_sequence"],
  })}\n`);
  let carry = "";
  socket.on("data", (chunk) => {
    carry += chunk;
    for (;;) {
      const newline = carry.indexOf("\n");
      if (newline < 0) break;
      const line = carry.slice(0, newline); carry = carry.slice(newline + 1);
      if (!line) continue;
      const envelope = JSON.parse(line);
      const command = envelope.command;
      if (command.type === "detach") {
        socket.write(`${JSON.stringify({ id: command.id, type: "response", command: "detach", success: true })}\n`);
        continue;
      }
      if (command.type !== "attach") continue;
      const activeSessionId = command.activeSessionId;
      socket.write(`${JSON.stringify({
        id: command.id, type: "response", command: "attach", success: true,
        data: {
          activeSessionId,
          snapshot: {
            activeSessionId,
            messages: [
              { id: "child-user", role: "user", content: [{ type: "text", text: "Review the selected worktree" }] },
              { id: "child-assistant", role: "assistant", content: [{ type: "text", text: "Initial child result" }] },
              ...Array.from({ length: 42 }, (_, index) => ({ id: `child-history-${index}`, role: "assistant", content: [{ type: "text", text: `Historical child item ${index}: ${"bounded readable content ".repeat(8)}` }] })),
            ],
          },
        },
      })}\n`);
      const emit = (event) => socket.write(`${JSON.stringify({ type: "session_event", activeSessionId, event, meta: { activeSessionId, sequence: ++daemonSequence } })}\n`);
      setTimeout(() => {
        emit({ type: "message_start", message: { id: "child-live", role: "assistant", content: [] } });
        emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Streaming child update" } });
        emit({ type: "message_end", message: { id: "child-live", role: "assistant", content: [{ type: "text", text: "Streaming child update" }] } });
        emit({ type: "tool_execution_start", toolCallId: "child-ipython", toolName: "ipython", args: { code: "print('child')" } });
        emit({ type: "tool_execution_end", toolCallId: "child-ipython", toolName: "ipython", result: { content: [{ type: "text", text: "child" }], details: { status: "ok", durationMs: 4 } }, isError: false });
      }, 20);
    }
  });
});
await new Promise((resolveListen, rejectListen) => {
  fakeDaemon.once("error", rejectListen);
  fakeDaemon.listen(daemonSocketPath, () => { fakeDaemon.off("error", rejectListen); resolveListen(); });
});
const electronApp = await electron.launch({
  executablePath,
  args: [root, `--user-data-dir=${userData}`],
  env: {
    ...process.env,
    ERNIE_PROJECT_PATH: root,
    ERNIE_AGENT_CLI_PATH: path.join(root, "tests/fake-prime-agent.mjs"),
    ERNIE_CATALOG_CLI_PATH: path.join(root, "tests/fixtures/workspace-prime-agent.mjs"),
    ERNIE_CATALOG_GIT_PATH: path.join(root, "tests/fixtures/workspace-git.mjs"),
    ERNIE_DEV_SERVER_LSOF_PATH: path.join(root, "tests/fixtures/dev-server-lsof.mjs"),
    ERNIE_DAEMON_SOCKET_PATH: daemonSocketPath,
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
  await window.getByLabel("IPython runtime: Local").waitFor();
  assert.equal(await window.getByRole("button", { name: /IPython ·/ }).count(), 0);
  await window.getByRole("button", { name: "Browser" }).click();
  const browserPanel = window.getByRole("complementary", { name: "Browser and local development servers" });
  await browserPanel.getByText("127.0.0.1:5173", { exact: true }).waitFor({ timeout: 10_000 });
  assert.equal(await browserPanel.getByRole("button", { name: "Open" }).count(), 3);
  await electronApp.evaluate(({ shell }) => {
    globalThis.__ernieOpenedExternal = "";
    shell.openExternal = async (url) => { globalThis.__ernieOpenedExternal = url; };
  });
  await browserPanel.locator(".dev-server-card").filter({ hasText: "127.0.0.1:5173" }).getByRole("button", { name: "Open" }).click();
  let openedExternal = "";
  for (let attempt = 0; attempt < 50 && openedExternal === ""; attempt += 1) {
    await window.waitForTimeout(50);
    openedExternal = await electronApp.evaluate(() => globalThis.__ernieOpenedExternal);
  }
  assert.equal(openedExternal, "http://127.0.0.1:5173");
  await browserPanel.getByRole("button", { name: "Close browser panel" }).click();
  await browserPanel.waitFor({ state: "hidden" });
  assert.equal(await window.getByRole("button", { name: "Browser" }).evaluate((element) => element === document.activeElement), true);
  await window.getByRole("button", { name: "Browser" }).click();
  await browserPanel.waitFor({ state: "visible" });
  await window.keyboard.press("Escape");
  await browserPanel.waitFor({ state: "hidden" });
  const virtualExplorer = window.locator(".virtual-agent-explorer");
  await virtualExplorer.waitFor({ timeout: 10_000 });
  assert.ok(await virtualExplorer.evaluate((element) => element.scrollHeight > element.clientHeight));
  const firstTreeItem = virtualExplorer.getByRole("button").first();
  await firstTreeItem.focus();
  await window.keyboard.press("End");
  await window.locator(".agent-tree-row:focus").waitFor({ timeout: 2_000 });
  assert.match((await window.evaluate(() => document.activeElement?.getAttribute("aria-keyshortcuts"))) ?? "", /ArrowDown/);
  assert.equal(await window.evaluate(() => document.activeElement?.getAttribute("data-explorer-index")), await virtualExplorer.getAttribute("data-last-agent-index"));
  assert.ok(await virtualExplorer.evaluate((element) => element.scrollTop > 0));
  await window.getByRole("button", { name: "Open worktree view" }).click();
  await window.getByRole("dialog", { name: "Open worktree view" }).getByRole("button", { name: /^Child,/ }).click();
  const childSessionView = window.locator(".session-transcript-view");
  await childSessionView.getByRole("heading", { name: "Child" }).waitFor();
  await childSessionView.getByText("Streaming child update", { exact: true }).waitFor({ timeout: 10_000 });
  assert.match((await childSessionView.locator(".ipython-execution-card").textContent()) ?? "", /IPython execution.*Runtime unavailable.*Completed.*print\('child'\).*child/s);
  await childSessionView.getByRole("button", { name: "Browse full transcript" }).click();
  const accessibleTranscript = window.getByRole("dialog", { name: "Full transcript" });
  assert.match((await accessibleTranscript.textContent()) ?? "", /Historical child item 41/);
  const transcriptPager = accessibleTranscript.locator(".accessible-transcript-pager");
  assert.equal(await transcriptPager.isVisible(), true);
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(4));
  await window.waitForTimeout(100);
  assert.equal(await transcriptPager.isVisible(), true);
  const pagerBox = await transcriptPager.boundingBox();
  const dialogBox = await accessibleTranscript.boundingBox();
  assert.ok(pagerBox && dialogBox && pagerBox.y + pagerBox.height <= dialogBox.y + dialogBox.height + 1);
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1));
  await accessibleTranscript.getByRole("button", { name: "Previous page" }).click();
  assert.match((await accessibleTranscript.textContent()) ?? "", /Prompt: Review the selected worktree.*Child: Initial child result/s);
  await accessibleTranscript.getByRole("button", { name: "Close full transcript" }).click();
  assert.equal(await window.locator(".workspace-tab-shell").count(), 2, JSON.stringify(await window.locator(".workspace-tab").allTextContents()));
  const selectedTab = window.getByRole("tab", { selected: true });
  assert.equal(await selectedTab.getAttribute("aria-controls"), await window.getByRole("tabpanel").getAttribute("id"));
  assert.equal(await selectedTab.getAttribute("tabindex"), "0");
  await window.locator(".workspace-tab-shell.active .tab-close").click();
  assert.equal(await window.locator(".session-transcript-view").count(), 0);
  await window.getByRole("button", { name: "Open worktree view" }).click();
  assert.match((await window.getByRole("dialog", { name: "Open worktree view" }).textContent()) ?? "", /Root.*Child/s);
  await window.getByRole("dialog", { name: "Open worktree view" }).getByRole("button", { name: /^Child,/ }).click();
  await window.getByRole("tabpanel").getByRole("heading", { name: "Child" }).waitFor();
  const managerTrigger = window.getByRole("button", { name: /Worktree manager/ });
  await managerTrigger.click();
  const managerDialog = window.getByRole("dialog", { name: "Worktree manager" });
  await managerDialog.waitFor();
  assert.match((await window.locator(".manager-footer").textContent()) ?? "", /New thread in root worktree/);
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
    await window.getByRole("button", { name: "Open worktree view" }).click();
    await window.getByRole("dialog", { name: "Open worktree view" }).getByRole("button", { name: new RegExp(`^Review agent ${index},`) }).click();
  }
  assert.equal(await window.locator(".workspace-tab-shell").count(), 10);
  assert.equal(await window.locator(".workspace-tab-viewport").evaluate((element) => element.scrollWidth > element.clientWidth), true);
  const addTabBox = await window.getByRole("button", { name: "Open worktree view" }).boundingBox();
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
  const ipythonCard = window.locator(".ipython-execution-card");
  await ipythonCard.waitFor({ state: "attached" });
  assert.match((await ipythonCard.textContent()) ?? "", /IPython execution.*Local.*Completed.*servers = discover_ports\(\).*\[3000, 5173\]/s);
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
  await window.getByRole("button", { name: "New root thread" }).click();
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
  await window.getByRole("button", { name: /Worktree manager/ }).click();
  const mobileManager = window.getByRole("dialog", { name: "Worktree manager" });
  await mobileManager.waitFor();
  await mobileManager.getByRole("button", { name: "Close worktree manager" }).click();
  await mobileManager.waitFor({ state: "hidden" });
  assert.equal(await railToggle.evaluate((element) => element === document.activeElement), true);
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

  await window.getByRole("button", { name: "New root thread" }).click();
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
    ERNIE_DEV_SERVER_LSOF_PATH: path.join(root, "tests/fixtures/dev-server-lsof.mjs"),
    ERNIE_DAEMON_SOCKET_PATH: daemonSocketPath,
      ERNIE_FIXTURE_ROOT: root,
      ERNIE_FIXTURE_EMPTY: "1",
      ERNIE_FAKE_MODE: "lifecycle",
    },
  });
  try {
    const emptyWindow = await emptyApp.firstWindow();
    await emptyWindow.getByText("Ready", { exact: true }).waitFor({ timeout: 15_000 });
    await emptyWindow.getByRole("navigation", { name: "Worktrees and agents" }).getByText("No worktrees found in this repository.", { exact: true }).waitFor();
    await emptyWindow.getByRole("button", { name: "Open worktree view" }).click();
    await emptyWindow.getByText("No worktrees found in this repository.", { exact: true }).last().waitFor();
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
  await new Promise((resolveClose) => fakeDaemon.close(() => resolveClose()));
  fs.rmSync(userData, { recursive: true, force: true });
}
