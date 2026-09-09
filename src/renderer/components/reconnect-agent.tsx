import { useEffect, useRef, useState } from "react"
import * as stylex from "@stylexjs/stylex"
import type { Agent } from "../../packages/agents"
import { usePrimeSessionState } from "../prime-agent-state"
import { useAgents } from "../agent-state"
import { styles } from "./agent-roster.styles"
import { AgentControls } from "./agent-settings"

/** Restores a selected saved root once; explicit retry follows a failed attempt. */
export const ReconnectAgent = ({ agent }: Readonly<{ agent: Agent }>) => {
  const { reconnect, pending } = useAgents()
  const { connection, connectionGeneration } = usePrimeSessionState()
  const connected = !connection || connection.state.status === "connected"
  const attempted = useRef<number | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    // A roster selection may already be resolving this root. Let it finish first.
    if (!connected || pending || attempted.current === connectionGeneration) {
      return
    }
    attempted.current = connectionGeneration
    setFailed(false)
    const attemptReconnect = async () => {
      const result = await reconnect(agent.id)
      if (attempted.current === connectionGeneration) {
        setFailed(!result.ok)
      }
    }
    void attemptReconnect()
  }, [agent.id, reconnect, pending, connected, connectionGeneration])
  let title = `Reconnecting ${agent.name}…`
  if (!connected) {
    title = `Prime Agent must connect before opening ${agent.name}`
  } else if (failed) {
    title = `Couldn’t reconnect ${agent.name}`
  }
  return (
    <div {...stylex.props(styles.empty)}>
      <h2>
        <output>{title}</output>
      </h2>
      {failed && connected ? (
        <button
          type="button"
          disabled={pending > 0}
          {...stylex.props(styles.menuButton)}
          onClick={async () => {
            setFailed(false)
            const result = await reconnect(agent.id, true)
            setFailed(!result.ok)
          }}
        >
          Try again
        </button>
      ) : null}
      <AgentControls agent={agent} />
    </div>
  )
}
