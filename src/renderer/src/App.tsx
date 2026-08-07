import { Agentation } from "agentation";
import { useEffect, useState } from "react";
import type { WorkspaceSnapshot } from "../../shared/workspace";
import { ProjectSidebar } from "./ProjectSidebar";

const EMPTY_WORKSPACE: WorkspaceSnapshot = { worktrees: [], agents: [], updatedAt: new Date(0).toISOString() };

function basename(path: string | undefined): string {
  return (path ?? "").split(/[\/]/u).filter(Boolean).at(-1) ?? "Project";
}

function OpenSidebarIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12m3-9 3 3-3 3" /></svg>;
}

/** Empty workbench shell while the project sidebar is rebuilt independently. */
export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(EMPTY_WORKSPACE);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspaceFailed, setWorkspaceFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void window.ernie.getWorkspace().then((snapshot) => {
      if (active) setWorkspace(snapshot);
    }).catch(() => {
      if (active) setWorkspaceFailed(true);
    });
    const unsubscribe = window.ernie.onAgentEvent((event) => {
      if (event.kind === "workspace") {
        setWorkspace(event.snapshot);
        setWorkspaceFailed(false);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  const rootWorktree = workspace.worktrees.find((worktree) => worktree.parentWorktreeId === undefined) ?? workspace.worktrees[0];
  const projectName = basename(rootWorktree?.path);

  return <main className="agentation-canvas relative h-full w-full overflow-hidden bg-[#090909]" aria-label="Ernie interface canvas">
    <div className="titlebar-drag" aria-hidden="true" />
    <ProjectSidebar
      projectName={projectName}
      worktrees={workspace.worktrees}
      agents={workspace.agents}
      failed={workspaceFailed}
      open={sidebarOpen}
      onClose={() => setSidebarOpen(false)}
    />
    <button
      type="button"
      className="sidebar-open-button"
      data-visible={!sidebarOpen}
      aria-label="Open sidebar"
      aria-controls="project-sidebar"
      aria-expanded={sidebarOpen}
      onClick={() => setSidebarOpen(true)}
    ><OpenSidebarIcon /></button>
    <div className="empty-workbench" aria-hidden="true" />
    {import.meta.env.DEV && <Agentation
      copyToClipboard={false}
      onCopy={(output) => { void window.ernie.copyText(output); }}
      onSubmit={(output) => { void window.ernie.command({ type: "prompt", message: output, behavior: "now" }); }}
    />}
  </main>;
}
