import { Agentation } from "agentation";
import { useEffect, useState } from "react";
import type { WorkspaceSnapshot } from "../../shared/workspace";
import { FocusedWorkspace } from "./FocusedWorkspace";

const EMPTY_WORKSPACE: WorkspaceSnapshot = { projects: [], worktrees: [], agents: [], updatedAt: new Date(0).toISOString() };

/** Multi-project workspace with a focused project navigator and session tabs. */
export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(EMPTY_WORKSPACE);
  const [workspaceFailed, setWorkspaceFailed] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void window.ernie.getWorkspace().then((snapshot) => {
      if (active) { setWorkspace(snapshot); setWorkspaceLoading(false); }
    }).catch(() => {
      if (active) { setWorkspaceFailed(true); setWorkspaceLoading(false); }
    });
    const unsubscribe = window.ernie.onAgentEvent((event) => {
      if (event.kind === "workspace") {
        setWorkspace(event.snapshot);
        setWorkspaceFailed(false);
        setWorkspaceLoading(false);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  return <main className="agentation-canvas" aria-label="Ernie workspace">
    <FocusedWorkspace snapshot={workspace} failed={workspaceFailed} loading={workspaceLoading} onSnapshot={setWorkspace} />
    {import.meta.env.DEV && <Agentation
      endpoint="/__agentation"
      copyToClipboard={false}
      onCopy={(output) => { void window.ernie.copyText(output); }}
      onSubmit={(output) => { void window.ernie.command({ type: "prompt", message: output, behavior: "now" }); }}
    />}
  </main>;
}
