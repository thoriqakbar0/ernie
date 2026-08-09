import { Agentation } from "agentation";
import { useCallback, useEffect, useState } from "react";
import type { AgentState } from "../../shared/contract";
import type { SpaceRuntimeState } from "../../shared/spaceRuntime";
import type { WorkspaceSnapshot } from "../../shared/workspace";
import { FocusedWorkspace } from "./FocusedWorkspace";
import { useSpaceTranscripts } from "./useSpaceTranscripts";

const EMPTY_WORKSPACE: WorkspaceSnapshot = { projects: [], worktrees: [], settledWorktrees: [], agents: [], updatedAt: new Date(0).toISOString() };
const EMPTY_AGENT_STATE: AgentState = {
  connection: "starting", detail: "Launching Prime Agent", executionTarget: "local", sessionId: "", sessionName: "",
  provider: "", modelId: "", modelName: "", thinkingLevel: "", isStreaming: false, isCompacting: false,
  messageCount: 0, queuedCount: 0, contextTokens: 0, contextWindow: 0, contextPercent: 0,
  totalTokens: 0, cost: "$0.0000",
};

/** Multi-project workspace with independently owned Space runtimes. */
export function App() {
  const transcripts = useSpaceTranscripts();
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(EMPTY_WORKSPACE);
  const [runtimeStates, setRuntimeStates] = useState<ReadonlyMap<string, SpaceRuntimeState>>(new Map());
  const [workspaceFailed, setWorkspaceFailed] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void window.ernie.getWorkspace().then((snapshot) => {
      if (!active) return;
      setWorkspace(snapshot);
      setWorkspaceLoading(false);
    }).catch(() => {
      if (!active) return;
      setWorkspaceFailed(true);
      setWorkspaceLoading(false);
    });
    const unsubscribeWorkspace = window.ernie.onWorkspaceEvent((event) => {
      if (event.kind === "workspace") {
        setWorkspace(event.snapshot);
        setWorkspaceFailed(false);
        setWorkspaceLoading(false);
      }
    });
    const unsubscribeRuntime = window.ernie.onSpaceEvent((envelope) => {
      transcripts.handleEvent(envelope);
      const event = envelope.event;
      if (event.kind !== "state" && event.kind !== "connection") return;
      setRuntimeStates((current) => {
        const previous = current.get(envelope.spaceId);
        const agent = event.kind === "state"
          ? event.state
          : { ...(previous?.agent ?? EMPTY_AGENT_STATE), connection: event.state, detail: event.detail };
        const next = new Map(current);
        next.set(envelope.spaceId, { spaceId: envelope.spaceId, agent, rlmMaxDepth: previous?.rlmMaxDepth ?? 0 });
        return next;
      });
    });
    return () => { active = false; unsubscribeWorkspace(); unsubscribeRuntime(); };
  }, [transcripts.handleEvent]);

  const rememberRuntime = useCallback((state: SpaceRuntimeState) => {
    setRuntimeStates((current) => new Map(current).set(state.spaceId, state));
  }, []);

  return <main className="ernie-canvas" aria-label="Ernie workspace">
    <FocusedWorkspace
      snapshot={workspace}
      runtimeStates={runtimeStates}
      liveItemsBySpace={transcripts.itemsBySpace}
      onAppendLiveUser={transcripts.appendUser}
      onRuntimeState={rememberRuntime}
      failed={workspaceFailed}
      loading={workspaceLoading}
      onSnapshot={setWorkspace}
    />
    {import.meta.env.DEV && <Agentation
      endpoint="/__agentation"
      copyToClipboard={false}
      onCopy={(output) => { void window.ernie.copyText(output); }}
    />}
  </main>;
}
