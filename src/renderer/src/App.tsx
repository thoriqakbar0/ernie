import { Agentation } from "agentation";
import { useEffect, useState } from "react";
import type { AgentState } from "../../shared/contract";
import type { WorkspaceSnapshot } from "../../shared/workspace";
import { FocusedWorkspace } from "./FocusedWorkspace";
import { useTranscript } from "./useTranscript";

const EMPTY_WORKSPACE: WorkspaceSnapshot = { projects: [], worktrees: [], agents: [], updatedAt: new Date(0).toISOString() };
const EMPTY_AGENT_STATE: AgentState = {
  connection: "starting", detail: "Launching Prime Agent", executionTarget: "local", sessionId: "", sessionName: "",
  provider: "", modelId: "", modelName: "", thinkingLevel: "", isStreaming: false, isCompacting: false,
  messageCount: 0, queuedCount: 0, contextTokens: 0, contextWindow: 0, contextPercent: 0,
  totalTokens: 0, cost: "$0.0000",
};

/** Multi-project workspace with focused session navigation and hybrid chat surfaces. */
export function App() {
  const transcript = useTranscript();
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(EMPTY_WORKSPACE);
  const [agentState, setAgentState] = useState<AgentState>(EMPTY_AGENT_STATE);
  const [workspaceFailed, setWorkspaceFailed] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void Promise.all([window.ernie.getWorkspace(), window.ernie.getState()]).then(([snapshot, state]) => {
      if (!active) return;
      setWorkspace(snapshot);
      setAgentState(state);
      setWorkspaceLoading(false);
    }).catch(() => {
      if (!active) return;
      setWorkspaceFailed(true);
      setWorkspaceLoading(false);
    });
    const unsubscribe = window.ernie.onAgentEvent((event) => {
      transcript.handleEvent(event);
      if (event.kind === "workspace") {
        setWorkspace(event.snapshot);
        setWorkspaceFailed(false);
        setWorkspaceLoading(false);
      } else if (event.kind === "state") setAgentState(event.state);
      else if (event.kind === "connection") setAgentState((current) => ({ ...current, connection: event.state, detail: event.detail }));
    });
    return () => { active = false; unsubscribe(); };
  }, [transcript.handleEvent]);

  return <main className="agentation-canvas" aria-label="Ernie workspace">
    <FocusedWorkspace snapshot={workspace} agentState={agentState} liveItems={transcript.items} onAppendLiveUser={transcript.appendUser} failed={workspaceFailed} loading={workspaceLoading} onSnapshot={setWorkspace} />
    {import.meta.env.DEV && <Agentation
      endpoint="/__agentation"
      copyToClipboard={false}
      onCopy={(output) => { void window.ernie.copyText(output); }}
      onSubmit={(output) => { void window.ernie.command({ type: "prompt", message: output, behavior: "now" }); }}
    />}
  </main>;
}
