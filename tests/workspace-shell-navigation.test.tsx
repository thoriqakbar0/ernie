// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { sessionTabTitle, WorkspaceShell } from "../src/renderer/src/components/workspace-shell/workspace-shell";
import type { WorkspaceSnapshot } from "../src/shared/workspace";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

const emptyWorkspace: WorkspaceSnapshot = { projects: [], worktrees: [], agents: [], updatedAt: "2026-08-09T00:00:00.000Z" };

describe("WorkspaceShell navigation shortcut", () => {
  it("uses a parent and child breadcrumb for child transcript tabs", () => {
    const workspace: WorkspaceSnapshot = {
      projects: [{ id: "/repo", path: "/repo", label: "repo", worktreeIds: ["/repo"] }],
      worktrees: [{ id: "/repo", path: "/repo", label: "main" }],
      agents: [
        { id: "root", sessionId: "root-session", worktreeId: "/repo", name: "Auth audit", summary: "", status: "working", runtimeKind: "root" },
        { id: "child", sessionId: "child-session", worktreeId: "/repo", parentAgentId: "root", name: "test-reviewer", summary: "", status: "working", runtimeKind: "subagent" },
      ],
      updatedAt: "2026-08-10T00:00:00.000Z",
    };

    expect(sessionTabTitle(workspace, "root")).toBe("Auth audit");
    expect(sessionTabTitle(workspace, "child")).toBe("Auth audit / test-reviewer");
  });

  it("keeps the desktop Space index persistent when Command-B is pressed", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<WorkspaceShell
      snapshot={emptyWorkspace}
      runtimeStates={new Map()}
      liveItemsBySpace={new Map()}
      onAppendLiveUser={vi.fn()}
      onRuntimeState={vi.fn()}
      failed={false}
      loading={false}
      onSnapshot={vi.fn()}
    />));

    expect(container.querySelector('[aria-label="Open workspace navigation"]')).toBeNull();
    expect(container.querySelector("#workspace-navigation")?.getAttribute("data-open")).toBe("true");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", metaKey: true })));
    expect(container.querySelector("#workspace-navigation")?.getAttribute("data-open")).toBe("true");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "B", metaKey: true })));
    expect(container.querySelector("#workspace-navigation")?.getAttribute("data-open")).toBe("true");

    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("shows a safe error when an archive IPC invocation rejects", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    vi.stubGlobal("confirm", vi.fn(() => true));
    const archiveProject = vi.fn().mockRejectedValue(new Error("transport closed"));
    Object.defineProperty(window, "ernie", { configurable: true, value: {
      archiveProject,
      getSpaceModels: vi.fn().mockResolvedValue([]),
      getSpaceState: vi.fn().mockRejectedValue(new Error("not resident")),
    } });
    const workspace: WorkspaceSnapshot = {
      projects: [
        { id: "/repo", path: "/repo", label: "repo", worktreeIds: ["/repo"] },
        { id: "/garden", path: "/garden", label: "garden", worktreeIds: ["/garden"] },
      ],
      worktrees: [
        { id: "/repo", path: "/repo", label: "main" },
        { id: "/garden", path: "/garden", label: "main" },
      ],
      agents: [],
      updatedAt: "2026-08-09T00:00:00.000Z",
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<WorkspaceShell
      snapshot={workspace}
      runtimeStates={new Map()}
      liveItemsBySpace={new Map()}
      onAppendLiveUser={vi.fn()}
      onRuntimeState={vi.fn()}
      failed={false}
      loading={false}
      onSnapshot={vi.fn()}
    />));

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open garden repository"]')?.click());
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Archive garden"]')?.click());
    expect(archiveProject).toHaveBeenCalledWith("/garden");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to archive garden");

    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "ernie");
  });

});
