import { Agentation } from "agentation";
import { useEffect, useRef, useState } from "react";
import type { AgentState } from "../../shared/contract";
import type { WorkspaceSnapshot } from "../../shared/workspace";
import { ProjectSidebar } from "./ProjectSidebar";
import { ChatComposer } from "./ChatComposer";

const EMPTY_WORKSPACE: WorkspaceSnapshot = { worktrees: [], agents: [], updatedAt: new Date(0).toISOString() };

function basename(path: string | undefined): string {
  return (path ?? "").split(/[\/]/u).filter(Boolean).at(-1) ?? "Project";
}

/** Agentation-shaped renderer baseline using only the three annotated regions. */
export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(EMPTY_WORKSPACE);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([window.ernie.getWorkspace(), window.ernie.getState()]).then(([nextWorkspace, nextState]) => {
      if (!active) return;
      setWorkspace(nextWorkspace);
      setAgentState(nextState);
    }).catch(() => { if (active) setError("Unable to load the project."); });
    const unsubscribe = window.ernie.onAgentEvent((event) => {
      if (event.kind === "workspace") setWorkspace(event.snapshot);
      else if (event.kind === "state") setAgentState(event.state);
      else if (event.kind === "connection") setAgentState((current) => current ? { ...current, connection: event.state, detail: event.detail } : current);
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  const rootWorktree = workspace.worktrees.find((worktree) => worktree.parentWorktreeId === undefined) ?? workspace.worktrees[0];
  const projectName = basename(rootWorktree?.path);
  const send = async (message: string) => {
    const prompt = message.trim();
    if (!prompt || busy || agentState?.connection !== "ready") return;
    setBusy(true);
    setError("");
    try {
      const result = await window.ernie.command({ type: "prompt", message: prompt, behavior: "now" });
      if (result.ok) setDraft("");
      else setError(result.error ?? "Prime Agent did not accept the message.");
    } catch {
      setError("Unable to send the message.");
    } finally {
      setBusy(false);
    }
  };

  const startThread = async () => {
    if (busy || agentState?.connection !== "ready") return;
    setBusy(true);
    setError("");
    try {
      const result = await window.ernie.command({ type: "new_session" });
      if (!result.ok || result.cancelled) setError(result.error ?? "Unable to start a new thread.");
      else { setDraft(""); requestAnimationFrame(() => inputRef.current?.focus()); }
    } catch {
      setError("Unable to start a new thread.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="agentation-canvas relative h-full w-full overflow-hidden bg-[#090909]" aria-label="Ernie interface canvas">
    <div className="titlebar-drag" aria-hidden="true" />
    <ProjectSidebar projectName={projectName} worktrees={workspace.worktrees} agents={workspace.agents} state={agentState} busy={busy} onNewThread={() => void startThread()} />
    <ChatComposer projectName={projectName} draft={draft} state={agentState} busy={busy} error={error} inputRef={inputRef} onDraftChange={setDraft} onSend={() => void send(draft)} />

    {import.meta.env.DEV && <Agentation
      copyToClipboard={false}
      onCopy={(output) => { void window.ernie.copyText(output); }}
      onSubmit={(output) => { void send(output); }}
    />}
  </main>;
}
