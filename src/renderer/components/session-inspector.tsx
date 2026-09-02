import type { PrimeRlmChild, PrimeSessionSnapshot } from "../../packages/prime-agent"

type SessionInspectorProps = Readonly<{
  snapshot: PrimeSessionSnapshot
}>

export function SessionInspector({ snapshot }: SessionInspectorProps) {
  const state = snapshot.useful.state
  const active = state.sessionActions.active
  const queueCount = state.sessionActions.queuedCount

  return (
    <aside aria-label="Session activity" className="session-inspector">
      <div className="inspector-heading">
        <h2>Session activity</h2>
      </div>

      <section aria-atomic="true" aria-labelledby="run-state-heading" aria-live="polite" className="inspector-section">
        <h3 id="run-state-heading">Run state</h3>
        <p className="inspector-primary">
          {active?.label ?? getRunLabel(snapshot)}
        </p>
        {active ? (
          <p className="inspector-meta">{formatPhase(active.phase)}</p>
        ) : null}
        {queueCount > 0 ? (
          <p className="inspector-callout">{queueCount} follow-up{queueCount === 1 ? "" : "s"} queued</p>
        ) : null}
      </section>

      <section className="inspector-section" aria-labelledby="runtime-heading">
        <h3 id="runtime-heading">Runtime</h3>
        <dl className="fact-list">
          <div>
            <dt>Model</dt>
            <dd>{snapshot.session.model?.label ?? "Not selected"}</dd>
          </div>
          <div>
            <dt>Thinking</dt>
            <dd>{state.thinkingLevel}</dd>
          </div>
          <div>
            <dt>Messages</dt>
            <dd>{state.messageCount}</dd>
          </div>
        </dl>
      </section>

      {state.activeToolNames.length > 0 ? (
        <section className="inspector-section" aria-labelledby="tools-heading">
          <h3 id="tools-heading">Active tools</h3>
          <ul className="tool-list">
            {state.activeToolNames.map((toolName) => <li key={toolName}>{toolName}</li>)}
          </ul>
        </section>
      ) : null}

      {snapshot.useful.children.length > 0 ? (
        <section className="inspector-section" aria-labelledby="agents-heading">
          <h3 id="agents-heading">Child agents</h3>
          <ul className="agent-list">
            {snapshot.useful.children.map((child) => (
              <li key={child.id}>
                <div className="agent-list__title">
                  <span>{child.label}</span>
                </div>
                <p>{formatChildActivity(child)}</p>
                <div className="agent-list__metrics">
                  {child.toolUseCount !== undefined ? <span>{child.toolUseCount} tools</span> : null}
                  {child.tokenCount !== undefined ? <span>{child.tokenCount.toLocaleString()} tokens</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  )
}

function getRunLabel(snapshot: PrimeSessionSnapshot) {
  if (snapshot.transport.status === "failed") return "Connection unavailable"
  if (snapshot.transport.status === "reconnecting") return "Restoring connection"
  if (snapshot.session.state === "recovering") return "Recovering session"
  if (snapshot.session.state === "working") return "Working on the current turn"
  return "Ready for the next instruction"
}

function formatPhase(phase: "committing" | "preparing" | "running") {
  if (phase === "committing") return "Saving the current result"
  if (phase === "preparing") return "Preparing the turn"
  return "Running the turn"
}

function formatChildActivity(child: PrimeRlmChild) {
  if (child.activity?.kind === "executing") {
    return child.activity.toolName ? `Using ${child.activity.toolName}` : "Using a tool"
  }
  if (child.activity?.kind === "writing") return "Writing a response"
  if (child.activity?.kind === "waiting") return "Waiting for more work"
  if (child.recap) return child.recap
  if (child.status === "done") return "Finished the assigned work"
  if (child.status === "error") return "Stopped after an error"
  if (child.status === "queued") return "Waiting to start"
  if (child.status === "running") return "Working on the assigned task"
  return "Stopped before completion"
}
