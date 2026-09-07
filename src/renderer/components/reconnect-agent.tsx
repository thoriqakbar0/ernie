import { useEffect, useRef, useState } from "react"
import * as stylex from "@stylexjs/stylex"
import type { Agent } from "../../packages/agents"
import { useAgents } from "../agent-state"
import { styles } from "./agent-roster.styles"
import { AgentControls } from "./agent-settings"

/** Restores a selected saved root once; explicit retry follows a failed attempt. */
export const ReconnectAgent = ({ agent }: Readonly<{ agent: Agent }>) => {
  const { reconnect, pending } = useAgents()
  const attempted = useRef(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    // A roster selection may already be resolving this root. Let it finish first.
    if (pending || attempted.current) {
      return
    }
    attempted.current = true
    const attemptReconnect = async () => {
      const result = await reconnect(agent.id)
      setFailed(!result.ok)
    }
    void attemptReconnect()
  }, [agent.id, reconnect, pending])
  return (
    <div {...stylex.props(styles.empty)}>
      <h2>
        <output>
          {failed ? `Couldn’t reconnect ${agent.name}` : `Reconnecting ${agent.name}…`}
        </output>
      </h2>
      {failed ? (
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
