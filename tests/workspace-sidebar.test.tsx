// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSidebar } from "../src/renderer/src/workspace-sidebar";
import type { WorkspaceSnapshot } from "../src/shared/workspace";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

const snapshot = {
  projects: [
    { id: "/repo", path: "/repo", label: "repo", worktreeIds: ["/repo"] },
    { id: "/other", path: "/other", label: "other", worktreeIds: ["/other"] },
  ],
  worktrees: [
    { id: "/repo", path: "/repo", label: "main" },
    { id: "/other", path: "/other", label: "main" },
  ],
  settledWorktrees: [],
  agents: [
    { id: "root", sessionId: "root-session", worktreeId: "/repo", name: "Root", summary: "", status: "idle", runtimeKind: "root" },
    { id: "child", sessionId: "child-session", worktreeId: "/repo", parentAgentId: "root", name: "Child", summary: "", status: "idle", runtimeKind: "subagent" },
    { id: "other", sessionId: "other-session", worktreeId: "/other", name: "Other", summary: "", status: "idle", runtimeKind: "root" },
  ],
  updatedAt: "2026-08-08T00:00:00.000Z",
} satisfies WorkspaceSnapshot;

describe("WorkspaceSidebar Agents disclosure", () => {
  it("starts open, consumes reveal requests once, and gives collapsed space back to Spaces", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(<WorkspaceSidebar
      snapshot={snapshot}
      activeProjectId={undefined}
      activeWorktreeId={undefined}
      activeAgentId={undefined}
      loading={false}
      failed={false}
      opening={false}
      archivingProjectId={undefined}
      openError={undefined}
      worktreeBusyOwner={undefined}
      worktreeError={undefined}
      compact={false}
      open
      revealAgent={{ agentId: "missing-agent", requestId: 1 }}
      performanceEnabled={false}
      onTogglePerformance={vi.fn()}
      onClose={vi.fn()}
      onSelectProject={vi.fn()}
      onSelectWorktree={vi.fn()}
      onArchiveProject={vi.fn()}
      onCreateWorktree={vi.fn()}
      onArchiveWorktree={vi.fn()}
      onRestoreWorktree={vi.fn()}
      onRemoveWorktree={vi.fn()}
      onOpenAgent={vi.fn()}
      onOpenDirectory={vi.fn()}
    />));

    const disclosure = container.querySelector<HTMLButtonElement>(".workspace-agents-disclosure");
    expect(container.querySelector("#agents-panel")?.firstElementChild?.classList.contains("agent-heading")).toBe(true);
    expect(disclosure?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("#agent-list-panel")).not.toBeNull();
    let rows = container.querySelectorAll<HTMLElement>(".workspace-agent-list .focused-session-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.style.animationDelay).toBe("calc(2 * var(--agent-row-stagger))");
    expect(rows[1]?.style.animationDelay).toBe("calc(0 * var(--agent-row-stagger))");
    const idleDisclosure = container.querySelector<HTMLButtonElement>(".workspace-idle-subagents-disclosure");
    expect(idleDisclosure?.textContent).toBe("1 idle subagent");
    expect(idleDisclosure?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => idleDisclosure?.click());
    rows = container.querySelectorAll<HTMLElement>(".workspace-agent-list .focused-session-row");
    expect(rows).toHaveLength(3);
    expect(rows[1]?.style.animationDelay).toBe("calc(1 * var(--agent-row-stagger))");
    expect(container.querySelector(".workspace-agent-pane")?.getAttribute("data-motion")).toBe("vertical");

    const priority = container.querySelector<HTMLButtonElement>("#priority-tab");
    await act(async () => priority?.click());
    expect(container.querySelector(".workspace-agent-pane")?.getAttribute("data-motion")).toBe("horizontal");
    expect(container.querySelector(".workspace-agent-pane")?.getAttribute("data-direction")).toBe("forward");
    const grouped = container.querySelector<HTMLButtonElement>("#all-agents-tab");
    await act(async () => grouped?.click());
    expect(container.querySelector(".workspace-agent-pane")?.getAttribute("data-direction")).toBe("backward");

    await act(async () => disclosure?.click());
    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("#agent-list-panel")).toBeNull();
    await act(async () => disclosure?.click());
    expect(container.querySelector(".workspace-agent-pane")?.getAttribute("data-motion")).toBe("vertical");
    await act(async () => disclosure?.click());
    expect(container.querySelector(".workspace-sidebar-body")?.getAttribute("data-agents-expanded")).toBe("false");
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("keeps active idle and working subagents visible while search opens idle groups", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const activeSnapshot = {
      ...snapshot,
      agents: [
        snapshot.agents[0],
        snapshot.agents[1],
        { ...snapshot.agents[1], id: "working-child", sessionId: "working-child-session", name: "Working child", status: "working" as const },
        snapshot.agents[2],
      ],
    } satisfies WorkspaceSnapshot;
    const props = sidebarProps(activeSnapshot);
    await act(async () => root.render(<WorkspaceSidebar {...props} activeWorktreeId="/repo" activeAgentId="child" />));

    expect(container.querySelector(".workspace-idle-subagents-disclosure")).toBeNull();
    expect([...container.querySelectorAll(".workspace-agent-group-heading")].map((heading) => heading.textContent)).toEqual(["repo · mainActive", "other · main"]);
    expect(container.querySelector(".workspace-agent-group")?.getAttribute("data-active")).toBe("true");
    expect([...container.querySelectorAll(".focused-session-row")].map((row) => row.textContent)).toEqual(["Root", "Child1", "Working child1", "Other"]);
    expect(container.querySelector(".focused-session-row.active .focused-status")?.classList.contains("idle")).toBe(true);
    expect(container.querySelector("[data-status='working'] .focused-status")?.classList.contains("working")).toBe(true);

    await act(async () => root.render(<WorkspaceSidebar {...props} activeWorktreeId="/repo" />));
    expect(container.querySelector(".workspace-idle-subagents-disclosure")?.textContent).toBe("1 idle subagent");
    expect([...container.querySelectorAll(".focused-session-row")].map((row) => row.textContent)).toEqual(["Root", "Working child1", "Other"]);
    const search = container.querySelector<HTMLInputElement>('[aria-label="Search Spaces, Settled worktrees, and Agents"]');
    await act(async () => {
      if (!search) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "child");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector(".workspace-idle-subagents-disclosure")?.getAttribute("aria-expanded")).toBe("true");
    expect([...container.querySelectorAll(".focused-session-row")].map((row) => row.textContent)).toEqual(["Root", "Working child1", "Child1"]);

    await act(async () => root.unmount());
  });

  it("keeps an empty active worktree first so the current context never disappears", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const emptyWorktreeSnapshot = {
      ...snapshot,
      projects: [{ ...snapshot.projects[0], worktreeIds: ["/repo-empty", "/repo"] }, snapshot.projects[1]],
      worktrees: [{ id: "/repo-empty", path: "/trees/empty", label: "empty" }, ...snapshot.worktrees],
    } satisfies WorkspaceSnapshot;
    await act(async () => root.render(<WorkspaceSidebar {...sidebarProps(emptyWorktreeSnapshot)} activeProjectId="/repo" activeWorktreeId="/repo-empty" />));

    const groups = [...container.querySelectorAll(".workspace-agent-group")];
    expect(groups[0]?.querySelector(".workspace-agent-group-heading")?.textContent).toBe("repo · emptyActive");
    expect(groups[0]?.textContent).toContain("No agents yet");
    expect(groups[1]?.querySelector(".workspace-agent-group-heading")?.textContent).toBe("repo · main");

    await act(async () => root.unmount());
  });

  it("does not repeat a worktree label that matches its project", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const duplicateLabelSnapshot = {
      projects: [{ id: "/same", path: "/same", label: "same", worktreeIds: ["/same"] }],
      worktrees: [{ id: "/same", path: "/same", label: "same" }],
      settledWorktrees: [],
      agents: [{ id: "same-agent", sessionId: "same-session", worktreeId: "/same", name: "Same", summary: "", status: "idle", runtimeKind: "root" }],
      updatedAt: "2026-08-08T00:00:00.000Z",
    } satisfies WorkspaceSnapshot;
    await act(async () => root.render(<WorkspaceSidebar {...sidebarProps(duplicateLabelSnapshot)} />));

    expect(container.querySelector(".workspace-agent-group-heading")?.textContent).toBe("same");

    await act(async () => root.unmount());
  });
});


const linkedSnapshot = {
  projects: [
    { id: "/repo", path: "/repo", label: "repo", worktreeIds: ["/repo-feature", "/repo", "/repo-fix"] },
    { id: "/fallback", path: "/fallback", label: "fallback", worktreeIds: ["/fallback-main"] },
  ],
  worktrees: [
    { id: "/repo-feature", path: "/trees/feature", label: "feature" },
    { id: "/repo", path: "/repo", label: "main" },
    { id: "/repo-fix", path: "/trees/fix", label: "fix" },
    { id: "/fallback-main", path: "/fallback", label: "trunk" },
  ],
  settledWorktrees: [],
  agents: [
    { id: "feature-agent", sessionId: "feature-session", worktreeId: "/repo-feature", name: "Feature", summary: "", status: "working", runtimeKind: "root" },
  ],
  updatedAt: "2026-08-08T00:00:00.000Z",
} satisfies WorkspaceSnapshot;

const settledSnapshot = {
  ...linkedSnapshot,
  settledWorktrees: [
    { id: "/trees/old", path: "/trees/old", label: "old", branch: "feature/old", managed: true, checkoutPresent: true, locked: false, projectId: "/repo", settledAt: "2026-08-07T00:00:00.000Z" },
    { id: "/trees/gone", path: "/trees/gone", label: "gone", branch: "feature/gone", managed: true, checkoutPresent: false, locked: false, projectId: "/fallback", settledAt: "2026-08-06T00:00:00.000Z" },
  ],
} satisfies WorkspaceSnapshot;

function sidebarProps(snapshotValue: WorkspaceSnapshot) {
  return {
    snapshot: snapshotValue,
    activeProjectId: undefined,
    activeWorktreeId: undefined,
    activeAgentId: undefined,
    loading: false,
    failed: false,
    opening: false,
    archivingProjectId: undefined,
    openError: undefined,
    worktreeBusyOwner: undefined,
    worktreeError: undefined,
    compact: false,
    open: true,
    revealAgent: undefined,
    performanceEnabled: false,
    onTogglePerformance: vi.fn(),
    onClose: vi.fn(),
    onSelectProject: vi.fn(),
    onSelectWorktree: vi.fn(),
    onArchiveProject: vi.fn(),
    onCreateWorktree: vi.fn(),
    onArchiveWorktree: vi.fn(),
    onRestoreWorktree: vi.fn(),
    onRemoveWorktree: vi.fn(),
    onOpenAgent: vi.fn(),
    onOpenDirectory: vi.fn(),
  } as const;
}

describe("WorkspaceSidebar Spaces", () => {
  it("uses a flat empty state with one direct folder action", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onOpenDirectory = vi.fn();
    await act(async () => root.render(<WorkspaceSidebar
      {...sidebarProps({ ...snapshot, projects: [], worktrees: [], agents: [] })}
      onOpenDirectory={onOpenDirectory}
    />));

    const emptyState = container.querySelector(".workspace-empty-state");
    expect(emptyState?.textContent).toContain("No spaces yet. Open a local folder to create one.");
    expect(emptyState?.querySelector("strong")).toBeNull();
    const action = emptyState?.querySelector<HTMLButtonElement>(".workspace-empty-action");
    await act(async () => action?.click());
    expect(onOpenDirectory).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("renders a checkout-only project as one selectable Space without a disclosure or duplicate row", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const props = sidebarProps(snapshot);
    await act(async () => root.render(<WorkspaceSidebar {...props} />));

    expect(container.querySelectorAll(".workspace-project-row")).toHaveLength(2);
    expect(container.querySelectorAll(".workspace-project-disclosure")).toHaveLength(0);
    expect(container.querySelectorAll(".workspace-worktree-button")).toHaveLength(0);
    const repo = container.querySelector<HTMLButtonElement>(".workspace-project-row");
    expect(repo?.getAttribute("aria-label")).toBe("repo, main");
    expect(repo?.title).toBe("/repo");
    await act(async () => repo?.click());
    expect(props.onSelectProject).toHaveBeenCalledWith("/repo");
    expect(props.onSelectWorktree).not.toHaveBeenCalled();
    const archive = container.querySelector<HTMLButtonElement>(".workspace-project-archive");
    expect(archive?.getAttribute("aria-label")).toBe("Archive other");
    await act(async () => archive?.click());
    expect(props.onArchiveProject).toHaveBeenCalledWith(snapshot.projects[1]);
    const spacesDisclosure = container.querySelector<HTMLButtonElement>(".workspace-spaces-disclosure");
    expect(spacesDisclosure?.getAttribute("aria-expanded")).toBe("true");
    await act(async () => spacesDisclosure?.click());
    expect(spacesDisclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("#spaces-list-panel")).toBeNull();
    await act(async () => spacesDisclosure?.click());

    await act(async () => root.unmount());
  });

  it("uses the project-id checkout as the root and gives linked worktrees selectable connector rows", async () => {
    const container = document.createElement("div");
    container.dir = "rtl";
    const root = createRoot(container);
    const props = sidebarProps(linkedSnapshot);
    await act(async () => root.render(<WorkspaceSidebar {...props} activeProjectId="/repo" activeWorktreeId="/repo-feature" />));

    const projectRows = container.querySelectorAll<HTMLButtonElement>(".workspace-project-row");
    expect(projectRows[0]?.getAttribute("aria-label")).toBe("repo, main");
    expect(projectRows[0]?.title).toBe("/repo");
    expect(projectRows[1]?.getAttribute("aria-label")).toBe("fallback, trunk");
    expect(container.querySelectorAll(".workspace-project-disclosure")).toHaveLength(1);
    const worktreeRows = container.querySelectorAll<HTMLButtonElement>(".workspace-worktree-button");
    expect(worktreeRows).toHaveLength(2);
    expect(worktreeRows[0]?.getAttribute("aria-label")).toBe("feature, working");
    expect(worktreeRows[0]?.getAttribute("aria-current")).toBe("page");
    expect(worktreeRows[0]?.title).toBe("/trees/feature");
    expect(container.querySelector(".workspace-project-mark")?.classList.contains("working")).toBe(false);
    expect(worktreeRows[0]?.querySelector(".workspace-worktree-mark")?.classList.contains("working")).toBe(true);
    await act(async () => worktreeRows[1]?.click());
    expect(props.onSelectWorktree).toHaveBeenCalledWith("/repo", "/repo-fix");
    const archiveActions = container.querySelectorAll<HTMLButtonElement>(".workspace-worktree-archive");
    expect(archiveActions).toHaveLength(2);
    expect(archiveActions[0]?.getAttribute("aria-label")).toBe("Archive feature");
    await act(async () => archiveActions[0]?.click());
    expect(props.onArchiveWorktree).toHaveBeenCalledWith("/repo", linkedSnapshot.worktrees[0]);

    await act(async () => root.unmount());
  });

  it("remembers a collapsed project while keeping only its active linked worktree visible", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const props = sidebarProps(linkedSnapshot);
    await act(async () => root.render(<WorkspaceSidebar {...props} activeProjectId="/repo" activeWorktreeId="/repo-feature" />));
    const disclosure = container.querySelector<HTMLButtonElement>(".workspace-project-disclosure");
    await act(async () => disclosure?.click());

    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
    let visibleRows = container.querySelectorAll<HTMLButtonElement>(".workspace-worktree-button");
    expect(visibleRows).toHaveLength(1);
    expect(visibleRows[0]?.textContent).toContain("feature");
    expect(container.querySelector(".workspace-linked-worktree-list")?.getAttribute("data-collapsed")).toBe("true");
    const controlledId = disclosure?.getAttribute("aria-controls");
    const controlledRegion = [...container.querySelectorAll<HTMLElement>("[hidden]")].find((element) => element.id === controlledId);
    expect(controlledRegion?.hidden).toBe(true);
    expect(controlledRegion?.querySelector(".workspace-worktree-button")).toBeNull();
    expect(container.querySelector(".workspace-active-worktree-context")?.contains(visibleRows[0] ?? null)).toBe(true);

    await act(async () => root.render(<WorkspaceSidebar {...props} activeProjectId="/repo" activeWorktreeId="/repo-fix" />));
    visibleRows = container.querySelectorAll<HTMLButtonElement>(".workspace-worktree-button");
    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
    expect(visibleRows).toHaveLength(1);
    expect(visibleRows[0]?.textContent).toContain("fix");

    await act(async () => root.render(<WorkspaceSidebar {...props} activeProjectId="/fallback" activeWorktreeId="/fallback-main" />));
    expect(container.querySelectorAll(".workspace-worktree-button")).toHaveLength(0);
    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");

    const search = container.querySelector<HTMLInputElement>('[aria-label="Search Spaces, Settled worktrees, and Agents"]');
    await act(async () => {
      if (!search) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "feature");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const matchingRows = container.querySelectorAll<HTMLButtonElement>(".workspace-worktree-button");
    expect(disclosure?.getAttribute("aria-expanded")).toBe("true");
    expect(matchingRows).toHaveLength(1);
    expect(matchingRows[0]?.textContent).toContain("feature");
    expect(matchingRows[0]?.textContent).not.toContain("fix");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Clear search"]')?.click());
    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => root.unmount());
  });
  it("filters Spaces and Agents from the titlebar search and clears with Escape", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const props = sidebarProps(snapshot);
    await act(async () => root.render(<WorkspaceSidebar {...props} />));

    expect(container.querySelector("#workspace-navigation-title")?.textContent).toBe("Ernie Dev");
    const search = container.querySelector<HTMLInputElement>('[aria-label="Search Spaces, Settled worktrees, and Agents"]');
    expect(search).not.toBeNull();
    const spacesDisclosure = container.querySelector<HTMLButtonElement>(".workspace-spaces-disclosure");
    await act(async () => spacesDisclosure?.click());
    expect(spacesDisclosure?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      if (!search) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "other");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(spacesDisclosure?.getAttribute("aria-expanded")).toBe("true");
    expect([...container.querySelectorAll(".workspace-project-row")].map((row) => row.textContent)).toEqual(["othermain"]);
    const agentRows = [...container.querySelectorAll(".focused-session-row")];
    expect(agentRows).toHaveLength(1);
    expect(agentRows[0]?.textContent).toContain("Other");
    search?.focus();
    await act(async () => search?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelectorAll(".workspace-project-row")).toHaveLength(2);
    expect(document.activeElement).toBe(search);

    await act(async () => {
      if (!search) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "child");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll(".focused-session-row")).toHaveLength(2);
    expect(container.querySelector(".workspace-agent-children .focused-session-row")?.textContent).toContain("Child");
    expect(container.querySelector(".workspace-sidebar>.sr-only[role='status']")?.textContent).toContain("1 Agent");
    await act(async () => container.querySelector<HTMLButtonElement>("#priority-tab")?.click());
    expect(container.querySelectorAll(".focused-session-row")).toHaveLength(0);
    expect(container.querySelector(".workspace-sidebar>.sr-only[role='status']")?.textContent).toContain("0 Agents");

    await act(async () => root.unmount());
    container.remove();
  });

  it("creates from the selected checkout, keeps failures inline, and restores trigger focus on cancel", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const props = sidebarProps(linkedSnapshot);
    await act(async () => root.render(<WorkspaceSidebar {...props} activeProjectId="/repo" activeWorktreeId="/repo-feature" />));

    const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Create worktree in repo"]');
    expect(trigger).not.toBeNull();
    await act(async () => trigger?.click());
    const form = container.querySelector<HTMLFormElement>('form[aria-label="Create worktree in repo"]');
    const input = form?.querySelector<HTMLInputElement>('input[name="branch"]');
    expect(form?.textContent).toContain("Starts from feature");
    expect(document.activeElement).toBe(input);

    await act(async () => input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[aria-label="Create worktree in repo"]:not(button)')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await act(async () => trigger?.click());
    const reopenedForm = container.querySelector<HTMLFormElement>('form[aria-label="Create worktree in repo"]');
    await act(async () => reopenedForm?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(reopenedForm?.querySelector('[role="alert"]')?.textContent).toBe("Enter a branch name.");
    const reopenedInput = reopenedForm?.querySelector<HTMLInputElement>('input[name="branch"]');
    await act(async () => {
      if (!reopenedInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(reopenedInput, " feature/new ");
      reopenedInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => reopenedForm?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(props.onCreateWorktree).toHaveBeenCalledWith("/repo", "/repo-feature", "feature/new");

    await act(async () => root.render(<WorkspaceSidebar {...props} activeProjectId="/repo" activeWorktreeId="/repo-feature" worktreeBusyOwner="/repo" />));
    expect(container.querySelector('form[aria-label="Create worktree in repo"]')?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector('form[aria-label="Create worktree in repo"]')?.textContent).toContain("Creating…");
    await act(async () => root.render(<WorkspaceSidebar {...props} activeProjectId="/repo" activeWorktreeId="/repo-feature" worktreeError="Branch already exists." />));
    expect(container.querySelector('form[aria-label="Create worktree in repo"] [role="alert"]')?.textContent).toBe("Branch already exists.");

    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("renders a searchable Settled shelf and moves focus after a restored row leaves", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const props = sidebarProps(settledSnapshot);
    await act(async () => root.render(<WorkspaceSidebar {...props} worktreeError="Commit or stash changes, then try again." />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Commit or stash changes");

    const disclosure = container.querySelector<HTMLButtonElement>(".workspace-settled-disclosure");
    expect(disclosure?.textContent).toContain("Settled");
    expect(disclosure?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll(".workspace-settled-row")).toHaveLength(2);
    expect(container.querySelector(".workspace-settled-row")?.textContent).toContain("repo · old");
    expect(container.querySelectorAll(".workspace-settled-remove")).toHaveLength(1);

    await act(async () => disclosure?.click());
    expect(container.querySelector<HTMLElement>(".workspace-settled-list")?.hidden).toBe(true);
    const search = container.querySelector<HTMLInputElement>('[aria-label="Search Spaces, Settled worktrees, and Agents"]');
    await act(async () => {
      if (!search) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "old");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(disclosure?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector<HTMLElement>(".workspace-settled-list")?.hidden).toBe(false);
    expect(container.querySelectorAll(".workspace-settled-row")).toHaveLength(1);
    expect(container.querySelector(".workspace-sidebar>.sr-only[role='status']")?.textContent).toContain("1 settled worktree");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Clear search"]')?.click());
    expect(container.querySelector<HTMLElement>(".workspace-settled-list")?.hidden).toBe(true);
    await act(async () => disclosure?.click());

    const remove = container.querySelector<HTMLButtonElement>('[aria-label="Remove checkout old from repo"]');
    await act(async () => remove?.click());
    expect(props.onRemoveWorktree).toHaveBeenCalledWith("/repo", settledSnapshot.settledWorktrees[0]);
    const restore = container.querySelector<HTMLButtonElement>('[aria-label="Restore old to repo"]');
    await act(async () => restore?.click());
    expect(props.onRestoreWorktree).toHaveBeenCalledWith("/repo", settledSnapshot.settledWorktrees[0]);

    await act(async () => root.render(<WorkspaceSidebar {...props} worktreeBusyOwner="/trees/old" />));
    const afterRestore = { ...settledSnapshot, settledWorktrees: settledSnapshot.settledWorktrees.slice(1) } satisfies WorkspaceSnapshot;
    await act(async () => root.render(<WorkspaceSidebar {...sidebarProps(afterRestore)} />));
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Restore gone to fallback");

    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

});
